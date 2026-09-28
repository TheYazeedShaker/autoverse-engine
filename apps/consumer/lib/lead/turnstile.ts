// The lead form's bot check: Cloudflare Turnstile, explicitly rendered and executed per attempt.
// Browser only. capture-lead verifies each token server-side and refuses a token solved on another
// hostname; tokens are single-use, so every submit attempt gets a fresh one (the page contract).
//
// - The script loads only when the modal first opens (no third-party request on page view).
// - `execution: "execute"` + `appearance: "interaction-only"`: invisible unless Cloudflare wants
//   the visitor to click, in which case the widget shows in the modal's verification slot.
// - The site key is public and comes from config (NEXT_PUBLIC_TURNSTILE_SITE_KEY), never inline.

export const TURNSTILE_SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const LOAD_TIMEOUT_MS = 10_000;
// Long enough for a visitor to solve an interactive challenge.
export const TOKEN_TIMEOUT_MS = 60_000;

interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  language?: string;
  execution?: "render" | "execute";
  appearance?: "always" | "execute" | "interaction-only";
  "refresh-expired"?: "auto" | "manual" | "never";
  callback?: (token: string) => void;
  "error-callback"?: (code?: string) => boolean | void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined;
  execute(widgetId: string): void;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

/** Loads the Turnstile script once per page. Rejects (and can be retried) on failure. */
export function loadTurnstile(doc: Document = document): Promise<TurnstileApi> {
  const w = doc.defaultView;
  if (w?.turnstile) return Promise.resolve(w.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = doc.createElement("script");
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    const timer = setTimeout(() => fail(new Error("turnstile_load_timeout")), LOAD_TIMEOUT_MS);
    const fail = (err: Error) => {
      clearTimeout(timer);
      script.remove();
      loading = null;
      reject(err);
    };
    script.onload = () => {
      clearTimeout(timer);
      if (w?.turnstile) resolve(w.turnstile);
      else fail(new Error("turnstile_missing"));
    };
    script.onerror = () => fail(new Error("turnstile_load_failed"));
    doc.head.appendChild(script);
  });
  return loading;
}

export interface BotCheck {
  /** A fresh token, or null when none came (error, expiry or timeout). */
  getToken(): Promise<string | null>;
  destroy(): void;
}

/** Renders one widget into `container` and hands out a fresh token per call. */
export function createBotCheck(
  api: TurnstileApi,
  container: HTMLElement,
  siteKey: string,
  language: "en" | "ar",
  timeoutMs: number = TOKEN_TIMEOUT_MS,
): BotCheck {
  let pending: ((token: string | null) => void) | null = null;
  const settle = (token: string | null) => {
    const p = pending;
    pending = null;
    p?.(token);
  };
  const widgetId = api.render(container, {
    sitekey: siteKey,
    action: "lead",
    language,
    execution: "execute",
    appearance: "interaction-only",
    "refresh-expired": "manual",
    callback: (token) => settle(token),
    "error-callback": () => {
      settle(null);
      return true; // handled: no console noise from the widget
    },
    "expired-callback": () => settle(null),
    "timeout-callback": () => settle(null),
  });

  return {
    getToken() {
      if (!widgetId) return Promise.resolve(null);
      settle(null); // a caller still waiting gets nothing: one attempt at a time
      return new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => settle(null), timeoutMs);
        pending = (token) => {
          clearTimeout(timer);
          resolve(token);
        };
        // A token is single-use: reset, then solve again.
        api.reset(widgetId);
        api.execute(widgetId);
      });
    },
    destroy() {
      settle(null);
      if (widgetId) api.remove(widgetId);
    },
  };
}
