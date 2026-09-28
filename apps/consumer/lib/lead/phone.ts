// Phone numbers for the lead form (spec §6: the EG format hint and validation). Pure.
//
// capture-lead accepts only international format (`+` then 7–15 digits). A visitor types whatever
// they are used to, so the form normalises before sending:
//   - Arabic-Indic and Eastern Arabic-Indic digits become ASCII digits;
//   - spaces, dashes, dots and brackets are dropped;
//   - a leading 00 becomes +.
// Egypt (the only market with a rule so far) takes MOBILE numbers: 01X then 8 digits, X in {0,1,2,5}
// (Vodafone, Etisalat, Orange, WE), written locally (010…), with the country code (+20 10…, 0020…)
// or without the trunk zero (10…). Other markets need an explicit international number until they
// get their own rule.

// Built from code points, so the source shows what the invisible marks are.
const cp = (n: number) => String.fromCharCode(n);
// Arabic-Indic (U+0660-0669) and Eastern Arabic-Indic (U+06F0-06F9) digits.
const ARABIC_DIGITS = new RegExp(`[${cp(0x660)}-${cp(0x669)}${cp(0x6f0)}-${cp(0x6f9)}]`, "g");
// Spaces, dashes, dots, brackets, and the left-to-right / right-to-left marks (U+200E, U+200F)
// that pasting from an RTL page can carry.
const SEPARATORS = new Set(["-", ".", "(", ")", cp(0x200e), cp(0x200f)]);
const isSeparator = (ch: string) => ch.trim() === "" || SEPARATORS.has(ch);

function asciiDigits(input: string): string {
  return input.replace(ARABIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Digits and a leading +, nothing else; 00 → +. */
function compact(input: string): string {
  const s = [...asciiDigits(input)].filter((ch) => !isSeparator(ch)).join("");
  return s.startsWith("00") ? `+${s.slice(2)}` : s;
}

export type PhoneResult = { ok: true; e164: string } | { ok: false };

/** The number in international format, or not ok. */
export function normalizePhone(input: string, marketCode: string): PhoneResult {
  const s = compact(input);
  if (marketCode === "EG") {
    const national = s.startsWith("+20") ? s.slice(3) : s.startsWith("0") ? s.slice(1) : s;
    return /^1[0125][0-9]{8}$/.test(national)
      ? { ok: true, e164: `+20${national}` }
      : { ok: false };
  }
  return /^\+[1-9][0-9]{6,14}$/.test(s) ? { ok: true, e164: s } : { ok: false };
}

/** A wa.me link for a brand-market's WhatsApp number, or null when it isn't a usable number. */
export function whatsappHref(number: string | null): string | null {
  if (!number) return null;
  const digits = compact(number).replace(/^\+/, "");
  return /^[1-9][0-9]{7,14}$/.test(digits) ? `https://wa.me/${digits}` : null;
}
