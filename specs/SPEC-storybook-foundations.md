# Build Spec — Storybook: Design-System Foundations + Primitives

**Task ID:** `AV-P1-STORYBOOK-FOUNDATIONS`
**Phase:** 1 (parallel track) · **Status:** READY TO BUILD
**Depends on:** Phase 0 kit (`design-tokens`, `ui`, `types`, CI, `.claude/`) — all present.
**Blocks:** nothing. **Blocked by:** nothing.
**Explicitly NOT blocked by:** the model-detail hero lock. This task ships the _atoms_ and the _system docs_; the _molecules_ wait for the locked hero (see §2).

> Operating note for Claude Code: this is the one Phase-1-adjacent task you are un-held on, because it has a real, locked spec (primer §4 tokens + the existing `design-tokens` package). The hero **build** stays HELD until a locked layout spec is handed over.

---

## 1. Objective

Stand up Storybook as the documented, testable home of the Autoverse design system — discharging the locked hard-requirement _"design system documented in Storybook"_ (primer §2). Output: the locked palette/type/contrast foundations as living docs, plus the layout-independent UI **primitives**, each with a story, an interaction test, and an automated accessibility gate. Fonts move to self-hosted so the platform never depends on Google's API (primer §4).

---

## 2. Scope

### In scope (MUST)

- Storybook wired onto existing `design-tokens` + `ui` packages, running with the Vite builder.
- Foundations docs (MDX): Principles, Color (with surface↔foreground proof), Typography (bilingual), Spacing/Radius/Elevation/Motion.
- Primitives: **Button**, **Swatch**, **SegmentedToggle**, **StatBlock**.
- Self-hosted variable fonts.
- Automated a11y gate in CI (§6).
- The token-pairing **invariant test** (§4.2) — the structural enforcement of the contrast rule.

### Out of scope — HOLD (do NOT author yet)

`ControlDock`, `SpecRibbon`, `InfoRail`, `ConfiguratorEmbed`, the model-detail page, and **any** schema work.

**Why the cut is here:** Button/Swatch/SegmentedToggle/StatBlock are true atoms — their APIs are intrinsic to their own behavior, not derived from any layout. The dock (how swatches + toggles arrange), the ribbon (which stats, how grouped), and the rail (overall composition) are layout-dependent molecules. Authoring molecules before the hero locks = guessing component APIs = the bottom-up rework trap our screen→schema→build rule exists to prevent. Atoms now; molecules after the hero locks and names them.

> If you want to be even more conservative, ship **Button + Swatch** only this pass and defer SegmentedToggle/StatBlock. Their APIs are intrinsic so I've kept all four, but the choice is yours.

---

## 3. Placement & tooling

- **One Storybook instance, hosted from `packages/ui`** (config in `packages/ui/.storybook/`). `ui` already depends on `design-tokens`, so a single instance documents both tokens and components. No separate `apps/storybook` — keeps it lean (priority §6.1) and avoids a second build target. _(Record as ADR — §9.)_
- **Builder:** `@storybook/react-vite` (Vite, not Webpack) — fast HMR/build, aligns with ship-speed + performance requirements.
- **Storybook version:** current stable. Do **not** hard-pin from this doc — resolve the latest stable major from the registry at install time so the spec can't go stale.
- **Addons (by purpose):** essentials/docs (autodocs), `addon-a11y` (axe in the panel), `addon-interactions` (play-function tests), `addon-themes` (light/dark surface toolbar — §5). Resist anything beyond these (every addon is build + maintenance weight).
- **Test runner:** `@storybook/test-runner` (Playwright + axe) for the CI a11y gate.
- **Package naming:** assume `@autoverse/ui`, `@autoverse/design-tokens`, `@autoverse/types`. Match the repo's actual scope if it differs.

---

## 4. `design-tokens` work

### 4.1 Extend the token set (SHOULD, low-controversy defaults)

Palette + fonts are locked. Primitives also need scale tokens — add them now, conservatively:

- **Spacing** scale (4px base): `2,4,8,12,16,20,24,32,40,48,64`.
- **Radius:** `sm 7px`, `md 10px`, `lg 14px`, `xl 18px`, `pill 999px`.
- **Elevation:** 2–3 shadow tokens tuned for the Mist canvas (soft, low-contrast — premium, not heavy).
- **Motion:** `duration-fast 150ms / base 220ms / slow 600ms`; easing `standard cubic-bezier(.2,.7,.2,1)`. These become the Framer-Motion contract later — name them now so motion is tokenized from day one.

All tokens exported as CSS custom properties **and** a typed TS object (single source, like the kit's other packages). Components consume tokens only — **never** hardcode hex/px (enforced in review, §7).

### 4.2 Contrast rule as a structural invariant (MUST — this is the headline)

Primer §4's structural fix ("pair each surface token with its required foreground so the bug class can't recur") becomes **code**:

- Model surfaces and foregrounds as paired entries, e.g. `surfaces = { light: {bg:'--av-mist', fg:'--av-on-light', fgMute:'--av-on-light-mute'}, dark: {bg:'--av-gunmetal', fg:'--av-on-dark', fgMute:'--av-on-dark-mute'} }`. A dark surface is its own variant that sets its own foreground.
- **Invariant unit test** (Vitest in `design-tokens`): every registered surface MUST have a non-null `fg` and `fgMute`, and each computed (`bg`,`fg`) pair MUST meet **WCAG AA** — ≥ 4.5:1 normal text, ≥ 3:1 large text/UI. Adding a surface without a passing foreground **fails the build**. This is the enforcement; the Color story (§5) is the visual proof.

### 4.3 Self-host fonts (MUST, with a verify-gate)

- Vendor **Google Sans Flex** (Latin) + **Cairo** (Arabic) as variable font files; `@font-face` with `font-display:swap`, `unicode-range` split (Latin vs Arabic so each loads only when needed), and `<link rel=preload>` for the primary weight. Storybook preview loads the same `@font-face` so previews match prod.
- ⚠️ **MUST verify first:** confirm the Google Sans Flex license permits self-hosting/redistribution _before_ vendoring the files. If it does not, fall back to the Google Fonts `css2` range link (current method) with `preconnect` + `preload`, and open an issue to revisit. This is the task's one external-dependency risk — resolve it explicitly, don't assume.

---

## 5. Story list (exact)

**Foundations** (MDX docs pages, autodocs on — each carries a short "how & why" per the exhaustive-docs requirement):

1. **Principles** — system overview; the contrast rule stated as law; links to the kit's `accessibility-review` skill and `code-reviewer` subagent.
2. **Color** — every palette token as a swatch (name · hex · CSS var). Then each **surface rendered with its paired foreground**, showing the **computed contrast ratio** and pass/fail badge. This page is the visual counterpart to the §4.2 test.
3. **Typography** — type scale, weights, both families; **an Arabic specimen under `lang="ar"`/`dir="rtl"`** proving the Cairo + RTL switch (Egypt-first, bilingual).
4. **Spacing · Radius · Elevation · Motion** — render the §4.1 scales as visual references.

**Primitives** (co-located `Component.tsx` + `.stories.tsx` + `.test.tsx` + `index.ts`): 5. **Button** — variants `primary` | `ghost`; rendered on **both** light and dark surfaces (theme toolbar); states default/hover/focus-visible/disabled/loading; sizes. Play-function asserts click + focus-visible ring. 6. **Swatch** — the option-control atom (color · name · `selected`/`aria-pressed` · `onSelect`). Hover scale, focus ring. Keyboard-operable toggle with an accessible name = the option label. (Maps to the manifest option vocabulary later — keep the prop named `optionName`/`value` to foreshadow it.) 7. **SegmentedToggle** — single-select group (View / Lighting in the hero). Correct radio/`aria` semantics + roving focus. Props `options`, `value`, `onChange`. 8. **StatBlock** — spec-ribbon atom (`value` · `unit` · `label`); presentational; shown on dark surface.

**Toolbar globals (SHOULD):** surface switch (Mist/Gunmetal via `addon-themes`) and a `dir`/`lang` switch (ltr/en ↔ rtl/ar). Every primitive story renders correctly under both surfaces and both directions.

---

## 6. The accessibility gate — what it asserts

`@storybook/test-runner` runs axe against **every** story in CI. A story fails the build if any of these fail:

- **Zero axe violations**, WCAG 2.1 **AA** ruleset.
- **Color-contrast** passes on every story under **both** surface themes — this is the automated, per-render enforcement of the contrast rule (complements the token-level invariant in §4.2; together they make dark-on-dark unrepresentable).
- **Keyboard:** every interactive element is focusable, has a **visible focus indicator**, and is operable by keyboard.
- **Semantics/names:** Button has an accessible name; SegmentedToggle exposes correct group + selection semantics; Swatch is a labelled toggle.
- **Custom contrast assertion** on the Color story: recompute each surface↔foreground ratio and fail if any pair < threshold (4.5:1 / 3:1). Redundant with §4.2 by design — defense in depth on the one rule we refuse to regress.

Wire this into the existing CI stage (build → **validate/test** → review → staging → prod). Storybook static build is produced as a CI artifact.

---

## 7. Engineering standards / Definition of Done (this task)

Maps to primer §2, §4, §14.

- **TypeScript strict**, fully typed props, exported types; no `any`.
- **Co-location:** each primitive = `Component.tsx`, `Component.stories.tsx`, `Component.test.tsx`, `index.ts`. Single responsibility, presentational where possible, no spaghetti.
- **Tokens only:** components reference design tokens; **no hardcoded hex/px** outside the token layer. Add a lint rule or review check to enforce.
- **Gates green:** typecheck, lint, unit + interaction tests, the a11y gate, and `storybook build` all pass.
- **Subagent sign-off:** `code-reviewer` and the `accessibility-review` skill must approve; `test-runner` must be green.
- **Docs:** autodocs on; every foundations page and every primitive has a short "how & why" note.
- **Trackable + visible:** one PR per slice (§10), each posting progress to the project Slack channel per the kit's flow.

---

## 8. Performance requirements

- Vite builder; `ui` is **tree-shakeable** — named exports, `"sideEffects": false` (except CSS) in `package.json`.
- Self-hosted fonts with `swap` + `unicode-range` subsetting + preload of the primary weight; no render-blocking font fetch.
- No addon bloat beyond §3. Keep the static Storybook build lean.
- Motion tokens defined but **not** animating in primitives beyond cheap CSS transitions; heavy motion lands with the molecules (Framer Motion), tokenized from these values.

---

## 9. ADRs to record (use the `ADR` skill)

1. **Storybook hosted from `packages/ui`, Vite builder** — rationale: single instance, lean, ui already depends on tokens.
2. **Atoms now, molecules after hero lock** — rationale: §2; prevents API-guessing rework.
3. _(If fonts fall back to CDN)_ record the licensing finding and the fallback decision.

---

## 10. Trackable task sequence (→ one PR each)

1. `design-tokens`: extend scales (§4.1) + model surface↔foreground pairs + the §4.2 invariant test. **Gate:** invariant test green.
2. `design-tokens`: self-host fonts (after license verify) + `@font-face`. **Gate:** fonts render offline.
3. `ui`: scaffold Storybook (Vite + addons), theme + dir/lang toolbars, wire `@font-face` into preview. **Gate:** Storybook runs.
4. `ui`: Foundations MDX (Principles, Color, Typography, Scales). **Gate:** Color story shows live ratios + pass badges.
5. `ui`: Button (+ stories, interaction test). **Gate:** a11y gate green on both surfaces.
6. `ui`: Swatch. 7. `ui`: SegmentedToggle. 8. `ui`: StatBlock.
7. CI: add `test-runner` a11y gate + `storybook build` artifact to the validate/test stage. **Gate:** pipeline green end-to-end.

---

## 11. Acceptance criteria

- [ ] Storybook builds and runs from `packages/ui`; static build is a CI artifact.
- [ ] Foundations docs present; Color story renders every surface↔foreground pair with computed AA ratios and pass badges.
- [ ] Typography story proves the Cairo/RTL switch.
- [ ] Button, Swatch, SegmentedToggle, StatBlock each: typed, co-located story + test, pass on **both** surfaces and **both** directions.
- [ ] §4.2 token-pairing invariant test exists and fails on an unpaired surface.
- [ ] a11y gate enforces zero AA violations on every story in CI.
- [ ] Fonts self-hosted (or CDN fallback + ADR if license blocks it); no render-blocking load.
- [ ] `code-reviewer` + `accessibility-review` approve; all gates green; progress posted to Slack.
- [ ] No molecule/page/schema code introduced (scope held).
