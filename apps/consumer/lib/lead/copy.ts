import type { LeadType } from "./capture";

// The lead form's copy, EN and AR (spec §6, §8: every string from the i18n layer). The approved
// export has no form, so these are new strings, and the Arabic wants a native read. The consent
// wording is NOT here: it is data (consent_texts, ADR 0025), HUMAN ONLY.

// A phone number inside Arabic text is isolated as left-to-right (U+2066 … U+2069), or the bidi
// algorithm reorders its groups ("010 1234 5678" would read "5678 1234 010").
const ltr = (s: string) => `${String.fromCharCode(0x2066)}${s}${String.fromCharCode(0x2069)}`;

type Messages = {
  eyebrow: Record<LeadType, string>;
  description: Record<LeadType, string>;
  requestQuote: string;
  fullName: string;
  phone: string;
  phoneHint: { EG: string; other: string };
  city: string;
  cityPlaceholder: string;
  interest: string;
  interestPlaceholder: string;
  preferredTime: string;
  times: { today: string; this_week: string; exploring: string };
  requiredNote: string;
  submit: string;
  close: string;
  errors: {
    name: string;
    phone: { EG: string; other: string };
    city: string;
    consent: string;
  };
  outcome: {
    verification_failed: string;
    duplicate: string;
    invalid: string;
    rate_limited: string;
    unavailable: string;
  };
  retrying: string;
  successTitle: string;
  successMessage: (brand: string) => string;
  whatsapp: string;
  done: string;
};

export const LEAD_COPY: Record<"en" | "ar", Messages> = {
  en: {
    eyebrow: {
      test_drive: "Book a test drive",
      quote: "Request a quote",
      contact: "Contact us",
    },
    description: {
      test_drive: "Leave your details and we'll call you to arrange your test drive.",
      quote: "Leave your details and we'll call you with a quote.",
      contact: "Leave your details and we'll get back to you.",
    },
    requestQuote: "Request a quote",
    fullName: "Full name",
    phone: "Mobile number",
    phoneHint: {
      EG: "An Egyptian mobile number, e.g. 010 1234 5678",
      other: "In international format, e.g. +971 50 123 4567",
    },
    city: "City",
    cityPlaceholder: "Choose a city",
    interest: "Model of interest",
    interestPlaceholder: "Not decided yet",
    preferredTime: "When should we contact you?",
    times: { today: "Today", this_week: "This week", exploring: "Just exploring" },
    requiredNote: "Fields marked * are required.",
    submit: "Send request",
    close: "Close",
    errors: {
      name: "Enter your full name.",
      phone: {
        EG: "Enter an Egyptian mobile number, e.g. 010 1234 5678.",
        other: "Enter your number in international format, starting with +.",
      },
      city: "Choose your city.",
      consent: "Please agree so we can contact you.",
    },
    outcome: {
      verification_failed: "We couldn't verify this request. Please try again.",
      duplicate: "This request was already sent. To send a new one, submit again.",
      invalid: "Some details weren't accepted. Please check them and try again.",
      rate_limited: "Too many requests. Please wait a minute and try again.",
      unavailable: "We couldn't send your request right now. Please try again in a moment.",
    },
    retrying: "Still sending…",
    successTitle: "Request received",
    successMessage: (brand) => `Thank you. ${brand} will contact you soon.`,
    whatsapp: "Message us on WhatsApp",
    done: "Done",
  },
  ar: {
    eyebrow: {
      test_drive: "احجز تجربة قيادة",
      quote: "اطلب عرض سعر",
      contact: "تواصل معنا",
    },
    description: {
      test_drive: "اترك بياناتك وسنتصل بك لترتيب تجربة القيادة.",
      quote: "اترك بياناتك وسنتصل بك لنقدّم لك عرض السعر.",
      contact: "اترك بياناتك وسنعاود التواصل معك.",
    },
    requestQuote: "اطلب عرض سعر",
    fullName: "الاسم الكامل",
    phone: "رقم الموبايل",
    phoneHint: {
      EG: `رقم موبايل مصري، مثال: ${ltr("010 1234 5678")}`,
      other: `بالصيغة الدولية، مثال: ${ltr("+971 50 123 4567")}`,
    },
    city: "المدينة",
    cityPlaceholder: "اختر المدينة",
    interest: "الطراز المطلوب",
    interestPlaceholder: "لم أحدد بعد",
    preferredTime: "متى تفضّل أن نتواصل معك؟",
    times: { today: "اليوم", this_week: "هذا الأسبوع", exploring: "أتصفح فقط" },
    requiredNote: "الحقول المعلّمة بـ * مطلوبة.",
    submit: "أرسل الطلب",
    close: "إغلاق",
    errors: {
      name: "أدخل اسمك الكامل.",
      phone: {
        EG: `أدخل رقم موبايل مصري صحيح، مثال: ${ltr("010 1234 5678")}.`,
        other: "أدخل رقمك بالصيغة الدولية، بدءًا بعلامة +.",
      },
      city: "اختر مدينتك.",
      consent: "يُرجى الموافقة حتى نتمكن من التواصل معك.",
    },
    outcome: {
      verification_failed: "تعذّر التحقق من الطلب. يُرجى المحاولة مرة أخرى.",
      duplicate: "سبق إرسال هذا الطلب. لإرسال طلب جديد، أرسل مرة أخرى.",
      invalid: "لم يتم قبول بعض البيانات. يُرجى مراجعتها والمحاولة مرة أخرى.",
      rate_limited: "طلبات كثيرة. يُرجى الانتظار دقيقة ثم المحاولة مرة أخرى.",
      unavailable: "تعذّر إرسال طلبك الآن. يُرجى المحاولة بعد قليل.",
    },
    retrying: "ما زلنا نرسل طلبك…",
    successTitle: "تم استلام طلبك",
    successMessage: (brand) => `شكرًا لك. ستتواصل معك ${brand} قريبًا.`,
    whatsapp: "راسلنا على واتساب",
    done: "تم",
  },
};
