# Revision — Component Library Scope (supersedes §2 atoms, §5 primitives, §10 sequence, §11 acceptance)

**Applies to:** `AV-P1-STORYBOOK-FOUNDATIONS`
**Unchanged from original spec:** §3 placement/tooling, §4 tokens + contrast invariant + fonts, §6 a11y gate, §7 standards, §8 performance, §9 ADRs. Those still hold verbatim.

> Scope grows from 4 atoms to a full primitive library. To protect the vertical slice (§3), it ships in **two tiers**: Tier 1 = everything the model-detail hero + its lead forms need (build first); Tier 2 = the remaining standard library (fills in after). The molecule HOLD is unchanged: `ControlDock`, `SpecRibbon`, `InfoRail`, `ConfiguratorEmbed`, page, and schema remain out of scope.

---

## R1. Three decisions to lock before building (raise in chat if unresolved)

1. **Headless a11y foundation — MUST.** Build interactive primitives on **Radix UI** (or React Aria), not hand-rolled. They ship unstyled, correct ARIA/focus/keyboard behavior; we skin with tokens. Rationale: solo team + zero-violation a11y gate (§6) makes hand-rolled focus traps / roving tabindex a liability. **Record as ADR.**
2. **Status colors — MUST DECIDE.** The locked palette is chromatic-free, but Alert + form validation need state semantics. Choose one:
   - (a) a **minimal muted semantic sub-palette** (`error / success / warning / info`), used **only** for state feedback — recommended, because monochrome error states on lead-capture forms hurt usability; or
   - (b) **monochrome alerts** differentiated by icon + weight + border.
     Whichever — it extends the locked design system, so it needs your sign-off and an ADR. Add the chosen tokens to `design-tokens` under the §4.2 pairing rule.
3. **Icon system — MUST.** Adopt **Lucide** (tree-shakeable, ISC). Wrap in an `Icon` primitive so size/stroke/color come from tokens. Several components below depend on it.

---

## R2. Foundations (unchanged list, restated)

Principles · Color (surface↔foreground proof) · Typography (bilingual specimen) · Spacing/Radius/Elevation/Motion. Add a **Status colors** foundations page only if R1.2 option (a) is chosen.

---

## R3. Component scope

Each component (MUST, unless marked): co-located `Component.tsx` + `.stories.tsx` + `.test.tsx` + `index.ts`; typed props, tokens-only, no hardcoded hex/px; rendered and passing the a11y gate (§6) on **both** surface themes and **both** directions (ltr/rtl).

### Prerequisite primitives (build before the rest — others depend on them)

- **Icon** — wraps Lucide; size/stroke/color from tokens.
- **Text / Heading** — renders the type scale; `lang`/`dir`-aware (Latin→Google Sans Flex, Arabic→Cairo). The Typography _component_ (the foundations page stays as docs).

### Layout primitives

- **Container** — max-width wrapper + responsive padding.
- **Grid** — responsive 12-column grid; breakpoint tokens added to `design-tokens`.
- **Stack / Cluster** — vertical-rhythm and horizontal-inline layout helpers (SHOULD; high reuse).
  > Note: a _generic_ 12-col grid is layout-independent and safe. It does **not** encode the hero composition — that stays with the held molecules.

### Form primitives

- **Button** — variants `primary | secondary | ghost`; sizes; states default/hover/focus-visible/disabled/loading; optional leading/trailing icon.
- **TextField / Input** — label, placeholder, helper text, error state (uses R1.2), `aria-invalid`/`aria-describedby`. _(Added — lead-capture forms need it.)_
- **Select** — token-styled; built on the headless lib for a11y. _(Added.)_
- **Textarea** — multiline TextField sibling. _(Added.)_
- **Checkbox** — controlled, indeterminate, label, a11y.
- **Radio + RadioGroup** — controlled group, `radiogroup` semantics, arrow-key navigation.
- **Switch** — on/off toggle (your "toggle"); `role="switch"`.

### Product atoms (hero-required — keep)

- **Swatch** — option-control atom (`value`/`optionName` · `selected`/`aria-pressed` · `onSelect`); keyboard toggle with accessible name = option label. _(Foreshadows the manifest option vocabulary.)_
- **SegmentedToggle** — single-select-of-N group (View / Lighting); radio semantics + roving focus.
- **StatBlock** — spec-ribbon atom (`value` · `unit` · `label`); presentational; dark surface.

### Surface / disclosure / feedback / overlay

- **Card** — surface container; a Card **is a surface**, so it MUST set its own paired foreground (§4.2). Variants: light/dark, with/without border.
- **Alert** — status variants per R1.2; icon + dismissible option; `role="status"`/`"alert"`.
- **Badge / Tag** — small status/label token. (SHOULD.)
- **Tooltip** — built on headless lib (floating positioning); hover+focus triggers; `aria-describedby`; touch-safe.
- **Modal / Dialog** — headless lib: portal, focus trap, scroll-lock, Escape, return-focus, `aria-modal`.
- **Accordion** — single/multi expand; `aria-expanded`; keyboard.
- **Breadcrumbs** — `nav` landmark; current-page `aria-current`; token separator (Icon).

---

## R4. Tiering (build order — protects the vertical slice)

**Tier 1 — hero + lead-form critical (build first):**
Icon · Text/Heading · Container · Grid · Button · Swatch · SegmentedToggle · StatBlock · Card.

> If lead capture is decided to be a **modal**, promote Modal + TextField + the form atoms into Tier 1.

**Tier 2 — standard library (fills in after Tier 1 is green):**
Stack/Cluster · TextField · Select · Textarea · Checkbox · Radio/RadioGroup · Switch · Alert · Badge · Tooltip · Modal · Accordion · Breadcrumbs.

Each component = its own PR (or small grouped PR for trivial siblings like Checkbox/Radio/Switch), posting progress to Slack per the kit flow.

---

## R5. ADRs to record (in addition to original §9)

4. **Radix UI / React Aria as the headless a11y foundation** (R1.1).
5. **Status-color decision** — sub-palette vs monochrome (R1.2).
6. **Lucide as the icon system** (R1.3).

---

## R6. Acceptance criteria (replaces original §11 component lines)

- [ ] R1 decisions locked + ADRs recorded (headless lib, status colors, icons).
- [ ] All Tier 1 components: typed, co-located story + test, pass the a11y gate on both surfaces + both directions.
- [ ] All Tier 2 components: same bar.
- [ ] Card honors the §4.2 pairing rule (sets its own foreground); the invariant test still passes.
- [ ] Interactive components are built on the headless lib (no hand-rolled focus traps / roving tabindex).
- [ ] Icon, Text/Heading, Container, Grid present and consumed by downstream components.
- [ ] Form primitives expose `error` state wired to the chosen status semantics.
- [ ] Fonts self-hosted (both OFL — Google Sans Flex + Cairo), `OFL.txt` committed per family; no CDN font dependency.
- [ ] `code-reviewer` + `accessibility-review` approve; full pipeline green.
- [ ] No molecule / page / schema code introduced (HOLD intact).
