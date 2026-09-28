import type { Showroom } from "../showroom/loader";
import type { Lang } from "../showroom/copy";

// Whether this page may offer lead capture, and what the client needs to do it (slice 7). Server
// side, per request, after the flag. Fails closed: every missing piece means no lead CTAs, and the
// reason is logged (an error while the flag is on, because a brand then silently loses leads).
//
// What reaches the browser: capture-lead's URL, the brand's publishable key (public by design,
// ADR 0013), the market code, the Turnstile site key (public), the consent text in the page's
// language with {Brand} filled in, the city list and the WhatsApp link. Never a secret, never the
// service-role key.

export interface LeadClientConfig {
  captureUrl: string;
  captureKey: string;
  marketCode: string;
  siteKey: string;
  consentVersion: string;
  /** The consent wording in the page's language, {Brand} filled with the brand's name. */
  consentText: string;
  cities: { id: string; label: string }[];
  whatsappHref: string | null;
  brandName: string;
}

export type LeadUnavailableReason =
  "no_consent_text" | "no_capture_key" | "no_site_key" | "no_capture_url";

export type LeadConfigResult =
  { ok: true; config: LeadClientConfig } | { ok: false; reason: LeadUnavailableReason };

/** capture-lead's URL from the Supabase project URL: https, or plain http on this machine only. */
export function captureUrlFrom(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  let base: URL;
  try {
    base = new URL(supabaseUrl);
  } catch {
    return null;
  }
  const local = base.hostname === "localhost" || base.hostname === "127.0.0.1";
  if (base.protocol !== "https:" && !(local && base.protocol === "http:")) return null;
  return new URL("/functions/v1/capture-lead", base.origin).toString();
}

// Turnstile site keys are short public tokens (e.g. 0x4AAAA…); anything else is a config mistake.
const SITE_KEY = /^[0-9A-Za-z_-]{10,128}$/;

export function leadConfig(
  showroom: Showroom,
  lang: Lang,
  env: { supabaseUrl: string | undefined; siteKey: string | undefined },
  whatsappHref: (n: string | null) => string | null,
): LeadConfigResult {
  const { consent, captureKey } = showroom.lead;
  if (!consent) return { ok: false, reason: "no_consent_text" };
  if (!captureKey) return { ok: false, reason: "no_capture_key" };
  const siteKey = env.siteKey?.trim();
  if (!siteKey || !SITE_KEY.test(siteKey)) return { ok: false, reason: "no_site_key" };
  const captureUrl = captureUrlFrom(env.supabaseUrl);
  if (!captureUrl) return { ok: false, reason: "no_capture_url" };
  return {
    ok: true,
    config: {
      captureUrl,
      captureKey,
      marketCode: showroom.market.code,
      siteKey,
      consentVersion: consent.version,
      // A function, not a string: a "$" in a brand name must not act as a replacement pattern and
      // alter the versioned wording (security review).
      consentText: consent.text[lang].replaceAll("{Brand}", () => showroom.brand.name),
      cities: showroom.lead.cities.map((c) => ({ id: c.id, label: c.name[lang] })),
      whatsappHref: whatsappHref(showroom.lead.whatsapp),
      brandName: showroom.brand.name,
    },
  };
}
