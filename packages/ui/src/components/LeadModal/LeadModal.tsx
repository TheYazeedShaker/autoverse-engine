"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, MessageCircle, X } from "lucide-react";
import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { cn } from "../../cn";
import { overlayScrim, overlaySurface } from "../../overlay-motion";
import { useReducedMotionPreference } from "../../use-reduced-motion";
import { Button } from "../Button";
import { Checkbox } from "../Checkbox";
import { Icon } from "../Icon";
import { SegmentedToggle, type SegmentedOption } from "../SegmentedToggle";
import { Select, type SelectOption } from "../Select";
import { TextField } from "../TextField";

// LeadModal — the showroom's lead form (spec §6, §5.10). The approved export has no form, so it is
// built from the system's form primitives in the drawer's visual language: the light surface, the
// small uppercase eyebrow, a light display heading, the round close button, and the brand accent on
// the one primary action.
//
// - Radix Dialog: the focus trap, Escape and scrim close, scroll lock and focus return are Radix's.
//   It is opened by the app, so focus returns to the control that opened it (`returnFocusTo`).
// - Data-free and stateless about capture: the app owns the values, the validation, the submit (the
//   page contract) and the outcome. This renders what it is given.
// - Opening focuses the first field. A failed validation (`validationAttempt` changes) focuses the
//   first invalid field. Success replaces the form and moves focus to its heading.
// - A centred panel from `md`; a full-height sheet on phones.
// - While submitting, the close button is disabled (the app also ignores Escape and the scrim):
//   a send in flight finishes in view.

export interface LeadTextBinding {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string;
}

export interface LeadSelectBinding {
  label: string;
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  error?: string | null;
}

export interface LeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dir: "ltr" | "rtl";
  /** Where focus returns on close: the control that opened the modal. */
  returnFocusTo?: HTMLElement | null;
  /** The request type, e.g. "Book a test drive". */
  eyebrow: string;
  /** e.g. the model's name, or the brand's. */
  title: string;
  description?: string;
  status: "editing" | "submitting" | "success";
  /** A form-level message: why the last attempt failed, or what to do next. */
  alert?: { tone: "error" | "info"; message: string } | null;
  /** A quiet progress line while submitting, e.g. "Still trying…". */
  progress?: string | null;
  fields: {
    fullName: LeadTextBinding;
    phone: LeadTextBinding;
    /** Null when the market lists no cities: the field is left out. */
    city: LeadSelectBinding | null;
    interest: LeadSelectBinding;
    preferredTime: {
      label: string;
      options: SegmentedOption[];
      value: string;
      onValueChange: (value: string) => void;
    };
    consent: {
      label: ReactNode;
      checked: boolean;
      onCheckedChange: (checked: boolean) => void;
      error?: string | null;
    };
  };
  /** Changes on every submit that failed validation: focus moves to the first invalid field. */
  validationAttempt?: number;
  /** The bot check's mount point (the app renders the widget into it). */
  verification?: ReactNode;
  onSubmit: () => void;
  labels: { submit: string; close: string; requiredNote: string };
  success: {
    title: string;
    message: string;
    /** A WhatsApp shortcut, when the brand-market has a number. */
    whatsapp?: { href: string; label: string } | null;
    done: string;
  };
}

export function LeadModal({
  open,
  onOpenChange,
  dir,
  returnFocusTo,
  eyebrow,
  title,
  description,
  status,
  alert,
  progress,
  fields,
  validationAttempt = 0,
  verification,
  onSubmit,
  labels,
  success,
}: LeadModalProps) {
  const reduced = useReducedMotionPreference();
  const formRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const submitting = status === "submitting";

  // The modal is opened by the app, not a Dialog.Trigger: remember what had focus when it opened.
  const returnTo = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") {
    const focused = document.activeElement;
    returnTo.current = focused instanceof HTMLElement && focused !== document.body ? focused : null;
  }
  wasOpen.current = open;

  useEffect(() => {
    if (validationAttempt === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [validationAttempt]);

  useEffect(() => {
    if (status === "success") successRef.current?.focus();
  }, [status]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!submitting) onSubmit();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="bg-surface-dark/45 fixed inset-0 z-40 backdrop-blur-xs"
                {...overlayScrim(reduced)}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              dir={dir}
              aria-describedby={
                status === "success"
                  ? "lead-modal-success"
                  : description
                    ? "lead-modal-description"
                    : undefined
              }
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                (status === "success" ? successRef.current : firstFieldRef.current)?.focus();
              }}
              onCloseAutoFocus={(e) => {
                const target = returnFocusTo ?? returnTo.current;
                if (target?.isConnected) {
                  e.preventDefault();
                  target.focus();
                }
              }}
            >
              <motion.div
                {...overlaySurface("modal", dir, reduced)}
                className="bg-surface text-on-surface fixed inset-0 z-40 flex flex-col shadow-lg focus:outline-none md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[92svh] md:w-[min(36rem,94vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl [--av-bg:var(--av-surface)] [--av-fg-muted:var(--av-on-surface-muted)] [--av-fg:var(--av-on-surface)]"
              >
                <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-4.5">
                  <p className="text-fg-muted pt-2 text-xs tracking-[0.2em] uppercase rtl:tracking-normal">
                    {eyebrow}
                  </p>
                  <Dialog.Close
                    aria-label={labels.close}
                    disabled={submitting}
                    className="disabled:opacity-50 border-fg/20 text-fg hover:bg-fg/5 focus-visible:ring-focus-ring grid size-9 shrink-0 place-items-center rounded-full border focus-visible:outline-none focus-visible:ring-2"
                  >
                    <Icon icon={X} size="sm" />
                  </Dialog.Close>
                </div>

                {status === "success" ? (
                  <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pt-4 pb-8">
                    <Dialog.Title asChild>
                      <h2
                        ref={successRef}
                        tabIndex={-1}
                        className="text-fg flex items-center gap-3 text-3xl font-light tracking-tight focus:outline-none rtl:tracking-normal"
                      >
                        <Icon icon={CheckCircle2} size="lg" className="text-success shrink-0" />
                        {success.title}
                      </h2>
                    </Dialog.Title>
                    <p id="lead-modal-success" className="text-fg text-base leading-relaxed">
                      {success.message}
                    </p>
                    <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                      {success.whatsapp ? (
                        <Button asChild variant="secondary" size="lg" className="sm:flex-1">
                          <a href={success.whatsapp.href} target="_blank" rel="noopener noreferrer">
                            <Icon icon={MessageCircle} size="md" />
                            {success.whatsapp.label}
                          </a>
                        </Button>
                      ) : null}
                      <Dialog.Close asChild>
                        <Button variant="primary" size="lg" className="sm:flex-1">
                          {success.done}
                        </Button>
                      </Dialog.Close>
                    </div>
                  </div>
                ) : (
                  <form
                    ref={formRef}
                    noValidate
                    onSubmit={submit}
                    aria-busy={submitting || undefined}
                    className="flex min-h-0 flex-1 flex-col"
                  >
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-6">
                      <Dialog.Title className="text-fg mt-2 text-3xl font-light tracking-tight md:text-4xl rtl:tracking-normal">
                        {title}
                      </Dialog.Title>
                      {description ? (
                        <Dialog.Description
                          id="lead-modal-description"
                          className="text-fg-muted mt-2 text-sm leading-relaxed"
                        >
                          {description}
                        </Dialog.Description>
                      ) : null}
                      <p className="text-fg-muted mt-1.5 text-xs">{labels.requiredNote}</p>

                      {/* Form-level outcome: errors interrupt (role=alert), guidance doesn't. */}
                      <div aria-live="polite" className="empty:hidden">
                        {alert && alert.tone === "info" ? (
                          <p className="bg-surface-white text-on-white border-fg/15 mt-4 rounded-md border px-3.5 py-3 text-sm">
                            {alert.message}
                          </p>
                        ) : null}
                      </div>
                      {alert && alert.tone === "error" ? (
                        <p
                          role="alert"
                          className="bg-surface-error text-on-error mt-4 rounded-md px-3.5 py-3 text-sm"
                        >
                          {alert.message}
                        </p>
                      ) : null}

                      <fieldset disabled={submitting} className="mt-5 flex flex-col gap-4.5">
                        <TextField
                          ref={firstFieldRef}
                          label={fields.fullName.label}
                          value={fields.fullName.value}
                          onChange={(e) => fields.fullName.onChange(e.target.value)}
                          error={fields.fullName.error}
                          hint={fields.fullName.hint}
                          autoComplete="name"
                          required
                        />
                        <TextField
                          label={fields.phone.label}
                          value={fields.phone.value}
                          onChange={(e) => fields.phone.onChange(e.target.value)}
                          error={fields.phone.error}
                          hint={fields.phone.hint}
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          // Phone numbers read left to right in Arabic too.
                          dir="ltr"
                          className="rtl:[&_input]:text-end"
                          required
                        />
                        {fields.city ? (
                          <Select
                            label={fields.city.label}
                            options={fields.city.options}
                            value={fields.city.value}
                            onValueChange={fields.city.onValueChange}
                            placeholder={fields.city.placeholder}
                            error={fields.city.error}
                            disabled={submitting}
                            dir={dir}
                            required
                          />
                        ) : null}
                        <Select
                          label={fields.interest.label}
                          options={fields.interest.options}
                          value={fields.interest.value}
                          onValueChange={fields.interest.onValueChange}
                          placeholder={fields.interest.placeholder}
                          error={fields.interest.error}
                          disabled={submitting}
                          dir={dir}
                        />
                        <div className="flex flex-col gap-1.5">
                          <span className="text-fg text-sm font-medium" aria-hidden="true">
                            {fields.preferredTime.label}
                          </span>
                          <SegmentedToggle
                            label={fields.preferredTime.label}
                            options={fields.preferredTime.options}
                            value={fields.preferredTime.value}
                            onValueChange={fields.preferredTime.onValueChange}
                            size="sm"
                            dir={dir}
                            className="self-start"
                          />
                        </div>
                        <Checkbox
                          label={fields.consent.label}
                          checked={fields.consent.checked}
                          onCheckedChange={fields.consent.onCheckedChange}
                          error={fields.consent.error}
                          disabled={submitting}
                          required
                        />
                        {verification}
                      </fieldset>
                    </div>
                    <div
                      className={cn(
                        "border-fg/10 bg-surface shrink-0 border-t px-6 pt-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] md:rounded-b-2xl",
                      )}
                    >
                      <Button
                        type="submit"
                        variant="accent"
                        size="lg"
                        className="w-full"
                        loading={submitting}
                      >
                        {labels.submit}
                      </Button>
                      <p
                        aria-live="polite"
                        className="text-fg-muted mt-2 text-center text-xs empty:hidden"
                      >
                        {submitting && progress ? progress : ""}
                      </p>
                    </div>
                  </form>
                )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
