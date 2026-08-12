# the Engine — Build Progress

> **Living document.** `CLAUDE.md` holds permanent standards. **This file changes every session** — read at session start, update at session end: fill _What Was Built Last Session_, refresh _Status_, append _Decisions_ / _Known Issues_, rewrite _Next Session — Start Here_ precisely.

**Last updated:** 2026-08-11
**Last session:** Reset to the final plan. Fresh repo (`autoverse-engine`) decided; migration spec, new `CLAUDE.md`, and this file authored. No residue from prior plan iterations — this file is the only state.

---

## THE PLAN (the only one)

**Autoverse** (company) builds **the Engine** (this repo) powering all products. **Phase 1:** the Engine + three apps serving five surfaces — `apps/consumer` (ONE app: Showroom / Brochure / Configurator behind per-brand entitlement gates), `apps/dashboard` (brand, tier-gated), `apps/admin` (operations). One brand, one model, end-to-end, production-hardened, multi-tenant + multi-market in structure. **Phase 2 (separate repo, later):** the Autoverse consumer platform product, built on the Engine's accumulated data. Governing docs in `docs/`; production plan v2.1 wins conflicts.

---

## Status

| Track                             | Status                 | Notes                                                                                                                                                           |
| --------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENGINE-MIGRATION`                | 🔜 **Next**            | Fresh repo, transplant design-tokens/ui/types + .claude/ + CI, rewire integrations, prove the loop once. Blocks everything.                                     |
| Storybook / design system         | ⏸ Paused for migration | Resumes in new repo after loop-proof; Tier-1 slice order per `specs/`. All decisions locked (sub-palette · Radix · restrained/precise · fonts self-hosted OFL). |
| Phase 1·A — Engine core           | ⏳ Held                | Spec arrives after migration completes.                                                                                                                         |
| Phase 1·B — Pipeline & admin      | ⏳ Held                | 7-stage board, render orchestration, AI content w/ approval gate.                                                                                               |
| Phase 1·C — Consumer app          | ⏳ Held                | Design-first: pages designed in Claude Design after Tier 1 → specs → build.                                                                                     |
| Phase 1·D — Dashboard & hardening | ⏳ Held                |                                                                                                                                                                 |
| Architecture v3 doc               | ✅ Done                | `docs/engine-architecture.html` — supersedes all earlier architecture versions.                                                                                 |

## What Was Built Last Session

- Decisions: fresh repo `autoverse-engine`; the layer is simply "the Engine" (codename dropped as confusing); ONE consumer app behind gates; Supabase project reused (default).
- Authored: `SPEC-engine-migration.md`, new `CLAUDE.md`, this `PROGRESS.md`.

## Decisions Made (must be remembered)

- **Naming:** Autoverse = company; the Engine = engine (this repo); Autoverse = also the Phase-2 platform product (separate repo, later).
- **One consumer app**, three gated surfaces — one journey, one session, one analytics trail; entitlements are flags, not codebases.
- **Transplant, don't rebuild:** design-tokens / ui / types / .claude / CI / migration 0001 carry as-is; delivery loop re-proven in the new repo before any feature work.
- **Boundary:** the Engine begins at the upload event (3D file + manifest.yaml); studio process never modeled. Manifest = source of truth per model; shared ID vocabulary with the studio, exact spelling.
- **In-house:** Unreal render farm + configurator are Autoverse-side; farm reached only via job queue + scoped bucket key; configurator stays decoupled behind the versioned iframe protocol (internal spec, from old doc 03, re-audienced later).
- **Hosting:** StreamPixel for launch (accepted risk: no written SLA, 3-yr vendor relationship; revisit if a brand contract carries uptime terms; Vagon Frankfurt fallback configured). Vagon at Gulf expansion; self-host ≥ ~50 sustained CCU or forced by residency/4K/IP.
- **AI content:** conditioning on renders (not fine-tuning); fixed versioned prompts (data, in admin); human approval state machine; brochure renders without AI blocks. Per-model LoRA = Later.
- **Content-gen chain:** renders → image gen (reference-conditioned) → APPROVAL → image-to-video (banner aspects) → approval; copy generated as structured blocks per brand voice profile, EN+AR, same gate. One provider adapter, per-stage swappable; provider picks = ADRs after a bake-off (candidates incl. Higgsfield API vs fal.ai/Replicate for image+video; Claude API for copy). Asset layout: assets/{brand}/{model}/v{n}/{source|renders|content}/... per architecture §07.
- **Design system:** locked monochrome palette + muted semantic sub-palette (state only); structural contrast pairing + invariant test; Radix; motion restrained/precise with semantic layer + reduced-motion CI gate; Storybook from `packages/ui`; fonts self-hosted (both OFL).
- **Design workflow:** Storybook Tier 1 first → import design system into Claude Design from this repo → `CLAUDE-DESIGN-BRIEF.md` as art direction → co-founder reviews there → approved page returns to chat → locked spec → build.
- Later (documented in place, not dropped): ML scoring, checkout, lead resale (legal+consent), custom domains, per-model fine-tunes, Egypt PDPL counsel check before public launch.

## Known Issues / TODOs

- **Action (Yazeed):** send the studio package — `docs/autoverse-model-delivery-spec.html` + `docs/model-manifest-template.yaml` — and lock the shared ID vocabulary + change process. Pipeline entry-point contract.
- **Action (Yazeed):** create the `autoverse-engine` GitHub repo (or grant Claude Code rights to) and provide account-level access for rewiring Vercel/Slack/Sentry/PostHog when asked.
- Confirm default: reuse existing Supabase project (say the word if a fresh one is preferred).
- Two documentation portals (internal + client-facing) — Phase 1·D.

## Next Session — Start Here

**Claude Code:** execute `specs/SPEC-engine-migration.md` top to bottom. Do not start any other work. Flag account-level needs in Slack instead of guessing. Update this file at session end.
**Chat track:** architecture v3 (engine-first doc 01 replacement) → then Phase 1·A engine-core spec, ready to hand over the moment migration's loop-proof lands.
