import { useState } from "react";
import type { LeadModalProps } from "./LeadModal";

// Story and test data for the LeadModal: plain values, the demo brand only. The consent wording is
// a placeholder; the real text is data (consent_texts) and HUMAN ONLY.

type Copy = {
  eyebrow: string;
  title: string;
  description: string;
  fullName: string;
  phone: string;
  phoneHint: string;
  city: string;
  cityPlaceholder: string;
  interest: string;
  interestPlaceholder: string;
  preferredTime: string;
  times: [string, string, string];
  consent: string;
  submit: string;
  close: string;
  requiredNote: string;
  successTitle: string;
  successMessage: string;
  whatsapp: string;
  done: string;
  dir: "ltr" | "rtl";
};

export const LEAD_COPY_EN: Copy = {
  eyebrow: "Book a test drive",
  title: "Demo SUV",
  description: "Leave your details and we'll call you to arrange it.",
  fullName: "Full name",
  phone: "Mobile number",
  phoneHint: "e.g. 010 1234 5678",
  city: "City",
  cityPlaceholder: "Choose a city",
  interest: "Model of interest",
  interestPlaceholder: "Choose a model",
  preferredTime: "When would you like to be contacted?",
  times: ["Today", "This week", "Just exploring"],
  consent: "Placeholder consent wording for Demo Motors (the real text is data).",
  submit: "Send request",
  close: "Close",
  requiredNote: "Fields marked * are required.",
  successTitle: "Request received",
  successMessage: "Thank you. Demo Motors will call you shortly.",
  whatsapp: "Message us on WhatsApp",
  done: "Done",
  dir: "ltr",
};

export const LEAD_COPY_AR: Copy = {
  eyebrow: "احجز تجربة قيادة",
  title: "ديمو إس يو في",
  description: "اترك بياناتك وسنتصل بك لترتيب الموعد.",
  fullName: "الاسم الكامل",
  phone: "رقم الموبايل",
  phoneHint: "مثال: 010 1234 5678",
  city: "المدينة",
  cityPlaceholder: "اختر المدينة",
  interest: "الطراز المطلوب",
  interestPlaceholder: "اختر الطراز",
  preferredTime: "متى تفضّل أن نتواصل معك؟",
  times: ["اليوم", "هذا الأسبوع", "أتصفح فقط"],
  consent: "نص موافقة تجريبي لـ Demo Motors (النص الحقيقي من البيانات).",
  submit: "أرسل الطلب",
  close: "إغلاق",
  requiredNote: "الحقول المعلّمة بـ * مطلوبة.",
  successTitle: "تم استلام طلبك",
  successMessage: "شكرًا لك. ستتصل بك Demo Motors قريبًا.",
  whatsapp: "راسلنا على واتساب",
  done: "تم",
  dir: "rtl",
};

type Overrides = Partial<Pick<LeadModalProps, "status" | "alert" | "progress">> & {
  errors?: Partial<Record<"fullName" | "phone" | "city" | "consent", string>>;
  whatsapp?: boolean;
};

/** A stateful LeadModal props builder for stories and tests. */
export function useLeadFixture(copy: Copy, overrides: Overrides = {}) {
  const [open, setOpen] = useState(true);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState<string | undefined>(undefined);
  const [interest, setInterest] = useState<string | undefined>("demo-suv");
  const [time, setTime] = useState("this_week");
  const [consent, setConsent] = useState(false);
  const props: LeadModalProps = {
    open,
    onOpenChange: setOpen,
    dir: copy.dir,
    eyebrow: copy.eyebrow,
    title: copy.title,
    description: copy.description,
    status: overrides.status ?? "editing",
    alert: overrides.alert ?? null,
    progress: overrides.progress ?? null,
    fields: {
      fullName: {
        label: copy.fullName,
        value: fullName,
        onChange: setFullName,
        error: overrides.errors?.fullName,
      },
      phone: {
        label: copy.phone,
        value: phone,
        onChange: setPhone,
        hint: copy.phoneHint,
        error: overrides.errors?.phone,
      },
      city: {
        label: copy.city,
        value: city,
        onValueChange: setCity,
        placeholder: copy.cityPlaceholder,
        options: [
          { value: "cairo", label: copy.dir === "rtl" ? "القاهرة" : "Cairo" },
          { value: "giza", label: copy.dir === "rtl" ? "الجيزة" : "Giza" },
        ],
        error: overrides.errors?.city,
      },
      interest: {
        label: copy.interest,
        value: interest,
        onValueChange: setInterest,
        placeholder: copy.interestPlaceholder,
        options: [
          { value: "demo-suv", label: copy.title },
          { value: "demo-ev", label: "Demo EV" },
        ],
      },
      preferredTime: {
        label: copy.preferredTime,
        value: time,
        onValueChange: setTime,
        options: [
          { value: "today", label: copy.times[0] },
          { value: "this_week", label: copy.times[1] },
          { value: "exploring", label: copy.times[2] },
        ],
      },
      consent: {
        label: copy.consent,
        checked: consent,
        onCheckedChange: setConsent,
        error: overrides.errors?.consent,
      },
    },
    onSubmit: () => {},
    labels: { submit: copy.submit, close: copy.close, requiredNote: copy.requiredNote },
    success: {
      title: copy.successTitle,
      message: copy.successMessage,
      whatsapp:
        overrides.whatsapp === false
          ? null
          : { href: "https://wa.me/201000000000", label: copy.whatsapp },
      done: copy.done,
    },
  };
  return { props, setOpen };
}
