import type { Preview, Decorator } from "@storybook/react-vite";
import { withThemeByDataAttribute } from "@storybook/addon-themes";
// The same self-hosted @font-face + token vars the app uses, so previews match production.
import "@autoverse/tokens/fonts.css";
import "@autoverse/tokens/css";
import "../src/styles/tailwind.css";
import "./preview.css";

// dir/lang toolbar: render every story under the chosen writing direction + language, so each
// primitive is verified ltr/en AND rtl/ar (Egypt-first, bilingual).
const withDirection: Decorator = (Story, context) => {
  const dir = context.globals.direction === "rtl" ? "rtl" : "ltr";
  const lang = dir === "rtl" ? "ar" : "en";
  return (
    <div dir={dir} lang={lang}>
      <Story />
    </div>
  );
};

const preview: Preview = {
  parameters: {
    layout: "centered",
    // a11y violations fail the test-runner gate (wired into CI in a later slice).
    a11y: { test: "error" },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  // autodocs on for every story (§5 — each foundations/primitive page carries a "how & why").
  tags: ["autodocs"],
  initialGlobals: { direction: "ltr" },
  globalTypes: {
    direction: {
      description: "Writing direction",
      toolbar: {
        title: "Direction",
        icon: "transfer",
        items: [
          { value: "ltr", title: "LTR · English" },
          { value: "rtl", title: "RTL · العربية" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    withDirection,
    // surface toolbar: Mist (light) ↔ Gunmetal (dark), set as data-theme on <html> (see preview.css).
    withThemeByDataAttribute({
      themes: { Mist: "light", Gunmetal: "dark" },
      defaultTheme: "Mist",
      attributeName: "data-theme",
    }),
  ],
};

export default preview;
