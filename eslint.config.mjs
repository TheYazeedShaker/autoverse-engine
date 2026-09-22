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
      // Deno edge-function entrypoints: Deno globals and npm: specifiers, typechecked by the
      // Supabase CLI at deploy time. Their logic lives in sibling modules that ARE linted.
      "services/*/index.ts",
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
  },
  // No hardcoded design values (CLAUDE.md, "Design system"): colours and pixel sizes come from
  // @autoverse/tokens. design-tokens itself is the source of those values, so it is exempt.
  {
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
    ignores: ["packages/design-tokens/**"],
    rules: {
      "no-restricted-syntax": ["error", ...hardcodedTokenRules()],
    },
  },
  // The car carries the only colour: paint swatches are brand DATA (a model's option list), not
  // design values, so Swatch fixtures may spell out paint hex codes.
  {
    files: ["packages/ui/src/components/Swatch/*.{stories,test}.tsx"],
    rules: { "no-restricted-syntax": "off" },
  }
);

function hardcodedTokenRules() {
  const HEX = "#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b";
  const FN = "\\b(?:rgba?|hsla?|oklch|oklab)\\(";
  // A pixel length: `12px`, and Tailwind arbitrary values like `w-[13px]`.
  const PX = "(?:^|[^\\w.-])\\d+(?:\\.\\d+)?px\\b";
  const message = (what) =>
    `Hardcoded ${what} — use a token from @autoverse/tokens (CSS var or token utility class).`;
  const rules = [];
  for (const [pattern, what] of [
    [HEX, "hex colour"],
    [FN, "colour function"],
    [PX, "pixel value"],
  ]) {
    rules.push(
      { selector: `Literal[value=/${pattern}/]`, message: message(what) },
      { selector: `TemplateElement[value.raw=/${pattern}/]`, message: message(what) },
    );
  }
  // React reads a bare number on a length property as pixels: `style={{ gap: 6 }}` is `6px`.
  // (lineHeight is excluded — a unitless line-height is a ratio, not a length.)
  const LENGTH_PROPS =
    "^(?:width|height|(?:min|max)(?:Width|Height)|gap|rowGap|columnGap|" +
    "(?:padding|margin|inset)(?:Top|Right|Bottom|Left|Block|Inline|BlockStart|BlockEnd|InlineStart|InlineEnd)?|" +
    "top|right|bottom|left|fontSize|letterSpacing|borderRadius|border(?:Top|Right|Bottom|Left)?Width|" +
    "outlineWidth|outlineOffset|flexBasis)$";
  rules.push({
    selector: `Property[key.name=/${LENGTH_PROPS}/] > Literal[value>0]`,
    message: message("pixel value (a bare number on a length property is px)"),
  });
  return rules;
}
