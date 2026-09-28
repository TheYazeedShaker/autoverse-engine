"use client";

import { Button, LeadModal, type ButtonProps } from "@autoverse/ui";
import * as Sentry from "@sentry/nextjs";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  submitLead,
  type CaptureOutcome,
  type LeadType,
  type PreferredTime,
} from "../lib/lead/capture";
import type { LeadClientConfig } from "../lib/lead/config";
import { LEAD_COPY } from "../lib/lead/copy";
import {
  buildSubmission,
  interestOption,
  requestFingerprint,
  type LeadErrors,
  type LeadFormValues,
} from "../lib/lead/form";
import { createBotCheck, loadTurnstile, type BotCheck } from "../lib/lead/turnstile";

// Lead capture on the showroom (slice 7, spec §6). One modal for the page, opened by any lead CTA
// (TopBar, hero, section header, spec drawer) with the lead type of that CTA and the model/trim of
// its context prefilled. Rendered only when the server allowed it: the `showroom_lead_capture` flag
// is on, and the brand-market has a consent text and a capture key (lib/lead/config.ts). Without
// this provider, every lead CTA renders nothing.
//
// The submit is the page contract (lib/lead/capture.ts): one submission_id per request, reused on
// retry; a fresh Turnstile token per attempt; each answer shown as a readable state. Failures are
// reported to Sentry by outcome only: no name, phone or city ever leaves in a report or a log.

export interface LeadOpenRequest {
  type: LeadType;
  modelId?: string | null;
  trimId?: string | null;
}

interface LeadApi {
  open: (request: LeadOpenRequest, trigger: HTMLElement | null) => void;
}

export const LeadContext = createContext<LeadApi | null>(null);

export interface LeadCaptureProps {
  config: LeadClientConfig;
  lang: "en" | "ar";
  /** The "model of interest" options: each model, then each of its trims. */
  interestOptions: { value: string; label: string }[];
  /** [trimId, modelId] for every trim on the page. */
  trimModel: [string, string][];
  /** The page's model names by id: the modal's title when a model is prefilled. */
  modelNames: Record<string, string>;
  children: ReactNode;
}

const EMPTY: LeadFormValues = {
  fullName: "",
  phone: "",
  city: undefined,
  interest: undefined,
  preferredTime: "this_week",
  consent: false,
  consentAt: null,
};

export function LeadCapture({
  config,
  lang,
  interestOptions,
  trimModel,
  modelNames,
  children,
}: LeadCaptureProps) {
  const copy = LEAD_COPY[lang];
  const dir = lang === "ar" ? "rtl" : "ltr";
  const trimMap = useMemo(() => new Map(trimModel), [trimModel]);
  const modelIds = useMemo(() => new Set(Object.keys(modelNames)), [modelNames]);

  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const [request, setRequest] = useState<LeadOpenRequest>({ type: "test_drive" });
  const [values, setValues] = useState<LeadFormValues>(EMPTY);
  const [errors, setErrors] = useState<LeadErrors>({});
  const [status, setStatusState] = useState<"editing" | "submitting" | "success">("editing");
  // Mirrored in a ref so open() (a stable callback) can read it without an updater side effect.
  const statusRef = useRef(status);
  const setStatus = useCallback((next: typeof status) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);
  const [alert, setAlert] = useState<{ tone: "error" | "info"; message: string } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [validationAttempt, setValidationAttempt] = useState(0);

  // One submission_id per request: kept while the visitor retries the same request, replaced when
  // anything they chose changes (requestFingerprint), or after a 409.
  const submission = useRef<{ id: string; fingerprint: string } | null>(null);
  const traceId = useRef<string | null>(null);

  // The bot check: the script loads when the modal first opens; the widget lives in the modal.
  const [botSlot, setBotSlot] = useState<HTMLDivElement | null>(null);
  const bot = useRef<BotCheck | null>(null);
  useEffect(() => {
    if (!open || !botSlot) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (!cancelled) bot.current = createBotCheck(api, botSlot, config.siteKey, lang);
      })
      .catch((err: unknown) => {
        // Submits then fail as "couldn't verify"; this says why.
        Sentry.captureMessage("lead_bot_check_unavailable", {
          level: "error",
          tags: {
            reason: err instanceof Error ? err.message : "unknown",
            market: config.marketCode,
          },
        });
      });
    return () => {
      cancelled = true;
      bot.current?.destroy();
      bot.current = null;
    };
  }, [open, botSlot, config.siteKey, config.marketCode, lang]);

  const api = useMemo<LeadApi>(
    () => ({
      open: (req, from) => {
        setTrigger(from);
        setRequest(req);
        // A finished request starts a fresh form; an unfinished one keeps what was typed. A submit
        // still in flight keeps its state: its outcome shows when it lands.
        if (statusRef.current === "success") {
          setValues(EMPTY);
          submission.current = null;
          setStatus("editing");
        }
        if (statusRef.current !== "submitting") setAlert(null);
        setValues((v) => ({
          ...v,
          interest: req.trimId
            ? interestOption("trim", req.trimId)
            : req.modelId
              ? interestOption("model", req.modelId)
              : v.interest,
        }));
        setErrors({});
        setOpen(true);
      },
    }),
    [setStatus],
  );

  const set = useCallback(<K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (key in e ? { ...e, [key]: undefined } : e));
  }, []);

  const report = (outcome: CaptureOutcome) => {
    if (outcome.kind === "received") return;
    Sentry.captureMessage("lead_submit_failed", {
      // A visitor who couldn't leave a lead is an incident (CLAUDE.md: any lead failure pages);
      // a form mistake or a rate limit is a warning.
      level: outcome.kind === "invalid" || outcome.kind === "rate_limited" ? "warning" : "error",
      tags: {
        outcome: outcome.kind,
        status: "status" in outcome ? String(outcome.status) : undefined,
        attempts: String(outcome.attempts),
        market: config.marketCode,
        lead_type: request.type,
        trace_id: traceId.current ?? undefined,
      },
    });
  };

  const onSubmit = async () => {
    // One send at a time: a second submit event before the re-render must not start a second loop.
    if (statusRef.current === "submitting") return;
    const built = buildSubmission(
      values,
      {
        type: request.type,
        marketCode: config.marketCode,
        consentVersion: config.consentVersion,
        cityRequired: config.cities.length > 0,
        trimModel: trimMap,
        modelIds,
      },
      copy,
    );
    if (!built.ok) {
      setErrors(built.errors);
      setValidationAttempt((n) => n + 1);
      return;
    }
    const fingerprint = requestFingerprint(built.submission);
    if (submission.current?.fingerprint !== fingerprint) {
      submission.current = { id: crypto.randomUUID(), fingerprint };
      traceId.current = crypto.randomUUID();
    }
    setStatus("submitting");
    setAlert(null);
    setRetrying(false);
    const outcome = await submitLead(
      { ...built.submission, submission_id: submission.current.id },
      {
        url: config.captureUrl,
        captureKey: config.captureKey,
        marketCode: config.marketCode,
        traceId: traceId.current ?? crypto.randomUUID(),
        getToken: () => bot.current?.getToken() ?? Promise.resolve(null),
        fetch: (...args) => fetch(...args),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        onRetry: () => setRetrying(true),
      },
    );
    setRetrying(false);
    report(outcome);
    if (outcome.kind === "received") {
      setStatus("success");
      return;
    }
    setStatus("editing");
    // A 409 means this id was used for a different request: the next submit is a new request.
    if (outcome.kind === "duplicate") submission.current = null;
    const message =
      outcome.kind === "unexpected" ? copy.outcome.unavailable : copy.outcome[outcome.kind];
    setAlert({ tone: outcome.kind === "duplicate" ? "info" : "error", message });
  };

  const title = request.modelId
    ? (modelNames[request.modelId] ?? config.brandName)
    : request.trimId
      ? (modelNames[trimMap.get(request.trimId) ?? ""] ?? config.brandName)
      : config.brandName;

  return (
    <LeadContext.Provider value={api}>
      {children}
      <LeadModal
        open={open}
        onOpenChange={(next) => {
          // No closing while a request is sending (Escape, the scrim and the close button are
          // ignored): the bot-check widget lives in the modal, so closing would cost the retries
          // their tokens and lose the lead (code review). A send ends within the retry budget.
          if (!next && statusRef.current === "submitting") return;
          setOpen(next);
        }}
        dir={dir}
        returnFocusTo={trigger}
        eyebrow={copy.eyebrow[request.type]}
        title={title}
        description={copy.description[request.type]}
        status={status}
        alert={alert}
        progress={retrying ? copy.retrying : null}
        validationAttempt={validationAttempt}
        fields={{
          fullName: {
            label: copy.fullName,
            value: values.fullName,
            onChange: (v) => set("fullName", v),
            error: errors.fullName,
          },
          phone: {
            label: copy.phone,
            value: values.phone,
            onChange: (v) => set("phone", v),
            hint: config.marketCode === "EG" ? copy.phoneHint.EG : copy.phoneHint.other,
            error: errors.phone,
          },
          city:
            config.cities.length === 0
              ? null
              : {
                  label: copy.city,
                  value: values.city,
                  onValueChange: (v) => set("city", v),
                  options: config.cities.map((c) => ({ value: c.id, label: c.label })),
                  placeholder: copy.cityPlaceholder,
                  error: errors.city,
                },
          interest: {
            label: copy.interest,
            value: values.interest,
            onValueChange: (v) => set("interest", v),
            options: interestOptions,
            placeholder: copy.interestPlaceholder,
          },
          preferredTime: {
            label: copy.preferredTime,
            value: values.preferredTime,
            onValueChange: (v) => set("preferredTime", v as PreferredTime),
            options: [
              { value: "today", label: copy.times.today },
              { value: "this_week", label: copy.times.this_week },
              { value: "exploring", label: copy.times.exploring },
            ],
          },
          consent: {
            label: config.consentText,
            checked: values.consent,
            onCheckedChange: (checked) => {
              set("consent", checked);
              set("consentAt", checked ? new Date().toISOString() : null);
            },
            error: errors.consent,
          },
        }}
        verification={<div ref={setBotSlot} data-lead-verification className="empty:hidden" />}
        onSubmit={() => void onSubmit()}
        labels={{ submit: copy.submit, close: copy.close, requiredNote: copy.requiredNote }}
        success={{
          title: copy.successTitle,
          message: copy.successMessage(config.brandName),
          whatsapp: config.whatsappHref
            ? { href: config.whatsappHref, label: copy.whatsapp }
            : null,
          done: copy.done,
        }}
      />
    </LeadContext.Provider>
  );
}

/** A lead CTA. Renders nothing unless lead capture is on for this page. */
export function LeadButton({
  request,
  label,
  variant = "primary",
  size = "md",
  className,
}: {
  request: LeadOpenRequest;
  label: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const lead = useContext(LeadContext);
  if (!lead) return null;
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      data-lead-opener={request.type}
      onClick={(e) => lead.open(request, e.currentTarget)}
    >
      {label}
    </Button>
  );
}
