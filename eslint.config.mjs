// Flat ESLint config — minimal, strict baseline. Extend per-package as needed.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Build output + JS config files (CJS/ESM presets) are out of scope; we lint the strict-TS surface.
  {
    ignores: [
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/storybook-static/**",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  }
);
