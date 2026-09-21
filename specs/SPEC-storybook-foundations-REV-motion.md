> **STATUS: Tier 1 complete · Tier 2 superseded by SPEC-storybook-tier2 (forthcoming) — do not execute further.**

# Revision — Motion as a Design-System Pillar (extends `AV-P1-STORYBOOK-FOUNDATIONS`)

**Applies to:** `AV-P1-STORYBOOK-FOUNDATIONS` (+ its `-REV-component-library` patch).
**Built on:** the `motion-foundations` skill — Claude Code MUST load it before any motion work. This spec does **not** redefine the skill's engine; it adds the Autoverse design-system layer on top.
**Standardize on `motion/react`** (current Framer Motion package). Never import `framer-motion`; never mix the two.

> Core principle (from the skill, restated as law): **motion must guide attention, communicate state, or preserve spatial continuity — otherwise remove it.** Responsiveness outranks smoothness. Seamless = systematic, not abundant.

---

## M1. Decision to lock — motion character (raise in chat if unresolved)

Autoverse motion personality = **restrained / precise** (luxury, not playful):

- Default to easings `smooth` / `sharp`; springs `snappy` (UI feedback) and `gentle` (landing surfaces).
- `bouncy` reserved for genuinely playful moments only (empty states, onboarding) — not chrome.
- If `gentle` (stiffness 120 / damping 14) overshoots too much for the feel, **add one preset** `precise: { type:"spring", stiffness 210, damping 26 }` to the `springs` map for hero/overlay landings.
  **Record as ADR.** This sets the personality of the whole system — needs sign-off.

---

## M2. Token placement

- Motion tokens (`duration`, `easing`, `distance`, `scale`) + the `springs` map live in **`packages/design-tokens`**, exported as the typed `motionTokens` / `springs` objects the skill defines — one source of truth with palette/fonts. The skill's `lib/motion-tokens.ts` shape is the contract; just relocate it into the package.
- The `shouldAnimate()` / `motionConfig` runtime gate + the `useSafeMotion` hook live in **`packages/ui`** (shared, `"use client"`).
- **Supersedes** the minimal motion tokens sketched in foundations spec §4.1 — use the skill's full set (`instant/fast/normal/slow/crawl`, easings `smooth/sharp/bounce/linear`, the 5 springs).

---

## M3. Semantic motion layer (the design-system contribution)

Define named, purpose-bound motions in `ui` that map onto tokens/springs. **Components reference these, never raw tokens** — same discipline as surface↔foreground pairing.

| Semantic motion              | Trigger                            | Maps to                                                                                  | Reduced-motion behavior       |
| ---------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------- |
| `page-enter`                 | route/page mount                   | `slow` + `smooth`, `distance.md`, staggered children                                     | opacity-only ≤0.2s, no offset |
| `section-reveal`             | scroll into view                   | `normal` + `smooth`, `distance.lg`                                                       | opacity-only, no offset       |
| `card-land`                  | card mount/expand                  | `gentle` (or `precise`) spring                                                           | opacity-only                  |
| `control-feedback`           | button/swatch press                | `fast`, `scale.press` whileTap, `snappy`                                                 | scale removed; instant        |
| `swatch-select`              | option chosen                      | active-ring move `snappy`; render recolor is optimistic/instant                          | ring snaps, no transition     |
| `segmented-switch`           | View/Lighting toggle               | active pill slides via **transform** `fast` + `smooth`                                   | pill jumps, no slide          |
| `overlay-in` / `overlay-out` | modal/dialog                       | scrim opacity + surface `gentle`/`precise`                                               | opacity-only ≤0.2s            |
| `tooltip-pop`                | hover/focus                        | `instant` spring                                                                         | opacity-only                  |
| `accordion-expand`           | disclosure                         | **never animate height** — use `grid-template-rows` or `scaleY`/clip; `normal` + `sharp` | instant open, no transform    |
| `stagger`                    | list/group enter                   | children offset ~`fast`/2                                                                | all appear together           |
| `skeleton-pulse`             | loading                            | opacity pulse only                                                                       | keep (already opacity-only)   |
| `view-transition`            | exterior↔interior / 360 escalation | crossfade / shared-element, `smooth`, preserve continuity                                | crossfade only                |

---

## M4. Reduced-motion as a structural gate (mirrors the contrast invariant)

- Every animated component MUST route through `useSafeMotion` / `shouldAnimate()` — no raw `motion.div` with hardcoded transforms (skill Rules 3, 5, 6).
- **Storybook:** add a **reduced-motion toggle** to the toolbar (alongside surface + dir). Each animated story renders in both states.
- **a11y gate (extends §6):** under `prefers-reduced-motion: reduce`, the test-runner asserts the story applies **no transform animation**, fades are **≤0.2s opacity-only**, and there is **no layout shift / abrupt disappearance**. A component that animates through the preference **fails the build** — exactly like an unpaired surface fails the contrast invariant.

---

## M5. Storybook documentation

- **Motion foundations page (MDX):** render durations, easing curves, springs, distances **playing live**; the semantic-motion table with an interactive example of each; the character rule (M1) stated.
- **Per component:** stories demonstrate the component's semantic motion(s); `play` functions assert the motion fires on the right trigger (interaction tests).
- Autodocs "how & why" note on each: which semantic motion it uses and why.

---

## M6. Performance budget (extends §8)

- Transform + opacity only in `animate` (skill Rule 4) — `width/height/top/left/margin/padding` banned. Accordion uses `grid-template-rows`/`scaleY`, not `height`.
- **Configurator page is the constraint:** chrome motion stays cheap and must never compete with the iframe/pixel-stream render. No decorative animation during an active pixel-streaming session. Swatch→render feedback is optimistic/instant (already decided).
- Respect `shouldAnimate()` low-end gate for non-essential motion. 60fps; no input delay.
- SSR: `initial` matches server output (skill Rule 2) — mount-guard or `AnimatePresence`; zero hydration warnings.

---

## M7. Cross-platform parity

- Token **values** (durations, easing curves as cubic-bezier, distances) are the brand motion contract.
- Web consumes them via `motion/react`. **Mobile mirrors the same curves/timings in Rive** so both surfaces feel like one brand. Keep a short mapping note in the Motion foundations doc (web token → Rive equivalent).

---

## M8. Where it slots into the build (no new phase)

Woven into the existing tiers, not a separate task:

- **Tier 1:** motion tokens + `springs` (+ optional `precise`) into `design-tokens`; `shouldAnimate`/`useSafeMotion` into `ui`; reduced-motion toolbar + Motion foundations page in the Storybook scaffold. Tier-1 components (Button, Swatch, SegmentedToggle, Card) ship with their semantic motion + reduced-motion variant + gate assertion.
- **Tier 2:** each component (Modal→`overlay-in`, Tooltip→`tooltip-pop`, Accordion→`accordion-expand`, etc.) ships its semantic motion under the same gate.

---

## M9. ADRs to record

7. **Motion character = restrained/precise** (M1); whether `precise` preset is added.
8. **Motion tokens owned by `design-tokens`; gate/hooks in `ui`; `motion/react` standardized** (M2).

## M10. Acceptance criteria (additions)

- [ ] M1 character locked + ADR; `precise` preset added if chosen.
- [ ] `motionTokens` + `springs` in `design-tokens`; `shouldAnimate`/`useSafeMotion` in `ui`; nothing imports `framer-motion`.
- [ ] Semantic motion layer exists; components reference semantic motions, **not** raw tokens (review-enforced).
- [ ] Reduced-motion toolbar in Storybook; every animated story passes the reduced-motion assertion in CI.
- [ ] Motion foundations page renders live curves/springs + the semantic table.
- [ ] No animated layout properties anywhere; accordion uses a transform/grid technique.
- [ ] No decorative motion competes with the configurator render.
