import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import { mergeConfig } from "vite";

// One Storybook, hosted from @autoverse/ui (ui already depends on @autoverse/tokens), Vite builder.
// Recorded in ADR-0001. Essentials + interactions are built into Storybook 10 core, so we add only
// the a11y and theme addons (lean — every addon is build + maintenance weight, §8).
const config: StorybookConfig = {
  framework: { name: "@storybook/react-vite", options: {} },
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-themes"],
  core: { disableTelemetry: true },
  viteFinal: (cfg) => mergeConfig(cfg, { plugins: [tailwindcss()] }),
};

export default config;
