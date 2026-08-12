// Tailwind preset mapping Autoverse tokens to utility classes.
// Usage in an app: tailwind.config = { presets: [require("@autoverse/tokens/tailwind")] }
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        surface: "var(--av-surface)",
        "surface-panel": "var(--av-surface-panel)",
        "surface-dark": "var(--av-surface-dark)",
        "on-surface": "var(--av-on-surface)",
        "on-surface-soft": "var(--av-on-surface-soft)",
        "on-dark": "var(--av-on-dark)",
        "on-dark-soft": "var(--av-on-dark-soft)",
        accent: "var(--av-accent)",
        "accent-on-dark": "var(--av-accent-on-dark)",
        border: "var(--av-border)",
      },
      fontFamily: {
        sans: "var(--av-font-en)",
        ar: "var(--av-font-ar)",
        mono: "var(--av-font-mono)",
      },
      borderRadius: { DEFAULT: "var(--av-radius)", sm: "var(--av-radius-sm)", lg: "var(--av-radius-lg)" },
      transitionTimingFunction: { av: "var(--av-ease)" },
    },
  },
};
