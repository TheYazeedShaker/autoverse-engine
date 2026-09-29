# the Engine — Build Progress

> **Living document.** `CLAUDE.md` holds permanent standards. **This file changes every session** — read at session start, update at session end: fill _What Was Built Last Session_, refresh _Status_, append _Decisions_ / _Known Issues_, rewrite _Next Session — Start Here_ precisely.
>
> **This repository is public** ([ADR-0008](docs/adr/0008-public-repository.md)). Write this file as if a customer will read it: no credentials, no new infrastructure identifiers, nothing said about a vendor or a prospect.

**Last updated:** 2026-09-28
**Last session:** **Interactive local session, runner OFF.** `PAGE-CONSUMER-SHOWROOM` slice 7 (LeadModal + capture contract): slices 1–6 are merged (#82 last), and #84 (capture CORS, PR 1/3) is merged and redeployed. #85 (read path, PR 2/3) is merged; the owner issued the demo's `web` key, inserted `eg-v1`, merged the smoke OPTIONS check (#86) and set `SUPABASE_FUNCTIONS_URL`. #87 (the LeadModal, PR 3/3) is merged and checked end to end on the preview by the owner: all four openers, validation, a real submit (201, lead stored, routing email received), Arabic, and the flag kill. Slice 8 (`feat/showroom-slice-8-motion`: curtain, reveals, motion polish, glass dock) **waits for the owner's merge**. BACKLOG #15–#19 added on the owner's instruction. See _Next Session_ §0.

**Earlier (2026-09-26):** `PAGE-CONSUMER-SHOWROOM` started. Access checks passed: the three approved copies in `design-approved/showroom/` and their `assets/`/`uploads/` images read fine, and `design/` was refused. Slice 1 (#66) and the migrations #67 (price_amount), #68 (presentation fields) and #69 (attribute vocabulary) are **merged**. All five Tier B decisions are answered. The read path (#70, `showroom_catalog`, ADR 0018) is **merged** too. The wiring PR (slice 1b: the page reads `showroom_catalog`, plus the Vercel preview demo path) **waits for the owner’s merge**; slice 2 follows.

---

## THE PLAN (the only one)

**Autoverse** (company) builds **the Engine** (this repo) powering all products. **Phase 1:** the Engine + three apps serving five surfaces — `apps/consumer` (ONE app: Showroom / Brochure / Configurator behind per-brand entitlement gates), `apps/dashboard` (brand, tier-gated), `apps/admin` (operations). One brand, one model, end-to-end, production-hardened, multi-tenant + multi-market in structure. **Phase 2 (separate repo, later):** the Autoverse consumer platform product, built on the Engine's accumulated data. Governing docs in `docs/`; production plan v2.1 wins conflicts.

---

## Status

| Track                             | Status             | Notes                                                                                                                                                                                |
| --------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ENGINE-MIGRATION`                | ✅ Done 2026-08-12 | Spec archived in `specs/archive/`. Loop-proof merged (PR #1) and deployed to production. Two leftovers moved into 0-H: smoke test + flag exercise (0-H.6), old-repo archive (0-H.7). |
| Phase 0-H — Hardening             | ✅ On `main`       | All 7 groups landed on `main` via PR #10 (the stack had merged into its own branches first).                                                                                         |
| `ENGINE-CORE-1A` — Engine core    | ✅ Done 2026-09-24 | All nine slices, the theming REV, the BLOCK fixes and both blockers are on `main` and deployed. The gate passes with the worker (CI run 36034118352).                                |
| `AUTONOMOUS-LOOP-P1`              | 🟡 In progress     | Backlog + architect (#24), permissions (#25). Escalation protocol and §7 rails in effect.                                                                                            |
| `AUTONOMOUS-LOOP-P2`              | ⏸ Runner OFF       | Runner on `main`. `agent_loop_enabled` inactive since 2026-09-25 and stays off until the owner decides on a measured trial. Work continues in interactive sessions.                  |
| Storybook / design system         | ⏸ Closed at Tier 1 | Tier 1 complete (9 primitives). Tier 2 superseded by `SPEC-storybook-tier2` (forthcoming). The three Storybook specs are marked do-not-execute.                                      |
| Phase 1·B — Pipeline & admin      | ⏳ Held            | 7-stage board, render orchestration, AI content w/ approval gate.                                                                                                                    |
| Phase 1·C — Consumer app          | 🟡 In progress     | `PAGE-CONSUMER-SHOWROOM`: slice 1 and four migrations merged (#66–#70); the wiring PR (1b) is in review. Next: slice 2.                                                              |
| Phase 1·D — Dashboard & hardening | ⏳ Held            |                                                                                                                                                                                      |

### Phase 0-H tracker — all built and green; **on `main` only once PR #10 merges**

| #   | Group                                                                                                             | Status                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| —   | Spec housekeeping (docs only)                                                                                     | ✅ merged to `main` (#2)                                                            |
| 1–7 | Migrations reconcile · isolation in CI · RLS hardening · full CI wall · repo hygiene · smoke + flag · ops closure | ✅ built, green, merged **into branches** (#3–#9) — **PR #10** lands them on `main` |

### Phase 1·A slice tracker (historical; built stacked. From now on every PR targets `main`)

| Slice | What                                                                             | Status             |
| ----- | -------------------------------------------------------------------------------- | ------------------ |
| setup | Yazeed's answers: `design/` ignored, CLAUDE.md reworded, PROGRESS title repaired | ✅ PR #11          |
| 1     | Schema — catalog and markets                                                     | ✅ PR #12          |
| 2     | Schema — options and spec ledger                                                 | ✅ PR #13          |
| 3     | Schema — control plane and billing                                               | ✅ PR #14          |
| 3.5   | Theming REV — `brand_themes`, `validate-theme`, admin neutral ramp               | ✅ PR #15          |
| 4     | Schema — content blocks and media                                                | ✅ PR #16          |
| 5     | Schema — leads and events                                                        | ✅ PR #17          |
| 6     | Data-access layer (`packages/engine-core`)                                       | ✅ PR #18          |
| 7     | Event pipeline (`ingest-event` + retry worker)                                   | ✅ PR #22          |
| 8     | Leads pipeline (`capture-lead`)                                                  | ✅ PR #19          |
| 9     | Job queue                                                                        | ✅ PR #20          |
| gate  | Induced-failure test, zero-loss reconciliation, evidence to Slack                | ✅ PR #21 — PASSED |

## What Was Built Last Session

Interactive local session, 2026-09-26. Runner **off**. Task: `PAGE-CONSUMER-SHOWROOM`.

**Access check (before any code):** the three approved copies and their `assets/` and `uploads/` images are readable with the file tools, and `design/` is refused. The approved copies contain real manufacturer names, file names and images. None of it is copied into the repo: the demo brand is "Demo Motors" in fixtures only.

**Slice 1: route, resolution, theme, flag, loaders** (`feat/showroom-slice-1-route`, **PR #66** against `main`, waiting for the owner's merge):

- `apps/consumer/app/page.tsx`: the showroom entry, rendered per request. Host → subdomain (`lib/showroom/host.ts`, root domain from `CONSUMER_ROOT_DOMAIN`, exactly one label) → `page_showroom` flag keyed by subdomain (checked **before** any catalogue read, so the kill path needs no database) → `CatalogSource` → `buildShowroom`. Every "no" is the same brand-free 404 (`app/not-found.tsx`). An unreadable catalogue is a 5xx, not a 404. The skeleton UI lists models, trims and prices only.
- `lib/showroom/source.ts`: **the seam.** No database-backed source exists until the read-path Tier B is answered, so with no source the page 404s. Local work uses `SHOWROOM_SOURCE=fixture` (never in a production build, previews included) and the launch config `consumer-fixture` (open `http://demo.localhost:3000`).
- `lib/showroom/loader.ts`: rows → view. It re-checks published/live state and brand ids as a second layer. Trim stats resolve over the model's (`resolveTrimStats`, now pure in engine-core, drive included). A missing price is "on request", never 0. Prices print only in EGP markets while the column is `price_egp`. A missing image is null plus `showroom_asset_missing`. Filter facets derive from data, counting each model once.
- `lib/showroom/theme.ts`: `brand_themes` → `:root{--av-accent…;--av-accent-hover;--av-accent-muted;--av-focus-ring;--av-on-accent}`, re-validated as six-digit hex before it goes into `<style>` (hoisted to `<head>`). A missing or invalid theme renders the neutral accent and logs.
- `lib/log.ts`: the structured JSON logger with one trace id (`x-vercel-id`, else a well-formed `x-request-id`, else a fresh UUID). The same id goes to the flag's failure log and the Sentry scope. Boundary logs: `showroom_load_start/done/failed`, `showroom_not_found` with its reason, `showroom_source_error`. No PII: only slugs, codes and counts. The source read has a 2 s timeout per attempt, the timed-out attempt is aborted, and there is one retry (idempotent).
- Second-layer tenancy checks in `load.ts`: a snapshot for a different subdomain than the host named is refused (`showroom_source_mismatch`, a 5xx, paged), and a theme row for another brand-market is never applied (`showroom_theme_mismatch`).
- Flags (`lib/flags.ts`) are now evaluated with `sendFeatureFlagEvents: false` and `disableGeoip: true`, because `page_showroom` is keyed by a subdomain a visitor can choose. The fixture source is also refused on any Vercel deployment.
- **ADR 0017**: the showroom's metrics and log-based alerts (wired with the log drain, as in ADR 0016), and **caching deferred** to the DB-backed source (the revalidation interval is still owed). `docs/runbooks/flag-kill-path.md` covers `page_showroom`.
- `packages/engine-core/src/database.types.ts` **corrected against the migrations**: `ModelRow` gains fuel/fuel_category/drive/transmission/efficiency_*, `TrimRow.drive`, and `BrandMarketRow` gains subdomain, consent_defaults and the footer columns. New `TrimPriceRow` and `AssetRow`.
- ESLint: for `apps/consumer/lib/showroom/fixtures/**` and `theme.test.ts` only, hex colours and registry image dimensions are allowed (brand data). Colour functions and px strings stay banned.
- Reviews: `security-review` APPROVE (M1/L1/L2/L4 applied). `code-reviewer` CHANGES REQUESTED, all addressed: alerts (ADR 0017), trace id end to end, flag events off, runbook, abortable timeout, a page test, a narrower lint exemption, and a comment fix.
- Checked: consumer typecheck, lint, `pnpm format:check`, `next build`; vitest consumer 58/58, engine-core 20/20. In the browser: `demo.localhost` → flag off → 404 with `reason: flag_off`. With the flag forced on locally (reverted), the skeleton rendered, the theme was hoisted into `<head>`, the draft model was hidden and on-request showed as text.
- Noted, not changed: the content migration's comment gives `'front-3q'` as an example view key, while the spec and the loader use `front-34`. The spec governs the page. Confirm the spelling with the studio vocabulary before the upload-watcher writes rows. `consent_defaults` has no `jsonb_typeof` CHECK, so parse it with Zod in slice 9.

**Tier B posted to `#build-decisions` (2026-09-26). Owner replies were read the same day:**

1. **Anonymous catalogue read path.** **Decided: A with four conditions**: page-rendered columns only and nothing from `brand_market_private`; asset paths only from the public published bucket; a paired cross-tenant test; its own ADR. → **PR #70**: `public.showroom_catalog(subdomain)`, anon-only EXECUTE, RLS unchanged. It adds `assets.public_path`, my reading of the public-bucket condition, flagged in the PR, plus a canonical-subdomain CHECK, ADR 0018 and test 0022. Security review approved; CI is green.
2. **Asset storage path → URL.** **Decided: A.** A public-read bucket behind the CDN, built as `ASSET_BASE_URL` + `storage_path`, with `next/image` and one remote pattern, and long immutable cache headers. **Condition:** the public bucket holds _published_ renders only. Drafts and pre-launch renders live in a private bucket and are copied over at publish, because brands launch under embargo. This goes in an ADR in the slice 2 PR; the copy-at-publish step belongs to 1·B.
3. **Presentation fields.** **Decided: revised A** → **PR #68**: `footer_tagline_en/ar`, `hotline`, `contact_email`, `cities_en/ar`, and `lead_cities jsonb` (validated in the DB; Zod in slice 7). **The hero backdrop is brand-invariant** (an Autoverse asset, no column).
4. **`price_egp` vs per-market currency.** **Decided: A** → **PR #67** renames it to `price_amount`. Its currency is always the market's. Slice 2 drops the loader's interim EGP-only rule.
5. **Arabic for body/fuel/drive/transmission values.** **Decided: B** → **PR #69**:
   - `vocabulary_registry` gets the kinds `body_type`/`fuel`/`drive`/`transmission`, seeded with generic EN/AR keys.
   - The models/trims columns get kind-checked FKs (`fuel_category` uses kind `fuel`).
   - **Owner, before merging #69:** run the pre-check query in its description on the hosted DB. It must return 0 rows, or the migration aborts on deploy.
   - Slice 2 groups facets by key and renders `display_en/ar`.
6. Follow-ups the migration security review noted outside its PRs:
   - `app_auth.all_emails_valid` has the same NULL-skip bug #68 fixed: a NULL array element passes.
   - The catalog tables don't revoke `truncate` from anon/authenticated.
   - Each is a one-line migration.

### Previous session (2026-09-25 → 26)

**BLOCK #9, PR #61** (owner decision, option A; ADR 0016):

- An event's payload is capped at 8 KB and the event as a whole at 9 KB. The caps are enforced in Zod, by the `events_payload_size` CHECK, and by a pre-check in `ingest_events_public`.
- An oversized event is refused with 413 and stored nowhere, dead-letter queue included. The RPC's refusal is returned rather than raised, so the rate-limit hit is kept.
- The body is capped at 256 KB, counted on the stream.
- The worker gives up at once on a replay the database refuses with a CHECK (23514). This applies to lead replays too.
- Alert: more than 20 `events_refused_too_large` in 15 minutes per market (owner-confirmed; revisit with real traffic).
- Tests: SQL test 0018 and the unit tests. Both reviews approved.
- Rule recorded: **event payloads never carry PII.**

**Housekeeping, #60 + #64:** the showroom spec is committed and points at `design-approved/showroom/` (`showroom.dc.html`, `vehicle-card.dc.html`, `spec-drawer.dc.html`). BACKLOG is re-queued. #60 went in as a regular merge, so its first commit (with two real manufacturer names, since removed) stays in `main`'s history. The owner's call; see _Known Issues_. The revert PR #63 was closed unmerged.

**Approved design copies, #62 (owner-applied patch; ADR 0010):**

- `design/` is unchanged and closed. The owner copies a page's files into gitignored `design-approved/<page>/`, which the file tools can read. Edit and Write are denied there, and the shell can't touch it.
- The guard now also refuses recursive searches that would reach either folder. That covers `grep -r` and variants, `rg -u`/`--no-ignore`, `git grep --no-index`, symlinked roots, wrapped or abbreviated forms, and `bash -c` payloads.
- The root `.gitignore`, `.rgignore` and `.ignore` files are owner-only, and `RIPGREP_CONFIG_PATH` is blocked.
- Security review: approved after three rounds. The recursive-search rule is best-effort; its residual risks are listed in the ADR.
- **Slip, disclosed to the owner:** before this fix, a repo-wide `grep -r` by the agent matched lines in two `design/` briefs. That content was not used.

**BLOCK #7, PR #57** (`fix/block-7-lead-activities-brand-fk`):

- Migration `20260925120000_lead_activities_brand_fk.sql`: `leads` gets `unique (id, brand_id)`, and `lead_activities` now references `(lead_id, brand_id)`. An activity can no longer claim a different brand from its lead.
- Test `0017`: a mismatched activity is refused on `lead_activities_lead_brand_fkey`, even with RLS bypassed. Legitimate writes still land. CI is fully green, and `isolation` ran 0017.
- Reviews: both approved.

**BLOCK #8, PR #58** (`fix/block-8-lead-repository-capture`):

- `LeadRepository.create` now goes through the `capture_lead` RPC instead of inserting into `leads`. The lead, its first activity and its routing jobs are written together, and the call is idempotent on `submission_id`, which is now required. It returns the lead id.
- `EngineDb` gains a narrow `rpc()`.
- Checked locally: typecheck, lint, prettier, vitest 20/20. Reviews: both approved.

**Runner trust finding, recorded** (ADR 0014 amendments):

- The first unattended run ignored all 48 `permissions.allow` entries because the workspace wasn't trusted. `claude -p` never shows the trust dialog. The owner fixed it in _Prepare the run_ by setting `projects[$GITHUB_WORKSPACE].hasTrustDialogAccepted`.
- **Patch for the owner to apply** (sent in chat as `agent-loop-trust-check.patch`; checked against `main` with `git apply --check`). It makes three checks: read the key back, run a one-turn $0.05 probe that fails on the `this workspace has not been trusted` stderr warning, and apply the same check to the real run's stderr.
- The workspace monthly spend limit and `LOOP_MAX_BUDGET_USD` are separate limits. A $3 monthly limit stopped the second run mid-task.

## Decisions Made (must be remembered)

- **Naming:** Autoverse = company; the Engine = engine (this repo); Autoverse = also the Phase-2 platform product (separate repo, later).
- **One consumer app**, three gated surfaces — one journey, one session, one analytics trail; entitlements are flags, not codebases.
- **Transplant, don't rebuild:** design-tokens / ui / types / .claude / CI / migration 0001 carried as-is.
- **Boundary:** the Engine begins at the upload event (3D file + manifest.yaml); studio process never modeled. Manifest = source of truth per model; shared ID vocabulary with the studio, exact spelling.
- **In-house:** Unreal render farm + configurator are Autoverse-side; farm reached only via job queue + scoped bucket key; configurator stays decoupled behind the versioned iframe protocol.
- **Hosting:** StreamPixel for launch; Vagon at Gulf expansion; self-host at sustained scale or when forced by residency/4K/IP.
- **AI content:** conditioning on renders (not fine-tuning); fixed versioned prompts (data, in admin); human approval state machine; brochure renders without AI blocks.
- **Content-gen chain:** renders → image gen (reference-conditioned) → APPROVAL → image-to-video (banner aspects) → approval; copy generated as structured blocks per brand voice profile, EN+AR, same gate. One provider adapter, per-stage swappable; provider picks = ADRs after a bake-off. Asset layout per architecture §07.
- **Design workflow:** design system imported into Claude Design → `CLAUDE-DESIGN-BRIEF.md` / `ADMIN-DESIGN-BRIEF.md` as art direction → co-founder review → approved page returns to chat → locked spec → build.
- Later (documented in place, not dropped): ML scoring, checkout, lead resale (legal+consent), custom domains, per-model fine-tunes, Egypt PDPL counsel check before public launch.
- **Design system:** locked monochrome palette + muted semantic sub-palette (state only); structural contrast pairing + invariant test; Radix; motion restrained/precise with semantic layer + reduced-motion CI gate; Storybook from `packages/ui`; fonts self-hosted (both OFL).
- **Repo visibility:** public per ADR-0008, **but REV2 treats it as a pending decision** — raised in Slack 2026-09-21. If it goes private, mark ADR-0008 superseded.
- **`design/` is Yazeed's** — gitignored; never read, modified or committed by Claude (2026-09-22).
- **Brand/profile writes stay scoped to superadmin + ops** (confirmed 2026-09-22).
- **Migrations use timestamp names from here on** (`YYYYMMDDHHMMSS_name.sql`), matching what the Supabase CLI records remotely (REV2 0-H.1).
- **Every PR targets `main`. Never stack PRs on each other's branches** (owner, 2026-09-24). Work that needs an unmerged PR waits, or opens as a draft against `main` and is rebased once its dependency lands.
- **Escalation protocol** (ADR 0009). Tier A: the architect cites the docs, and the citation goes in the PR. Tier B: post in `#build-decisions` in the spec's format, move to independent work, and check the threads every cycle. Tier C: HUMAN ONLY, act only on the owner's reply.
- **Leads are idempotent on a form-minted `submission_id`**, unique per brand. The consumer form (1·C) must mint one per submit and keep it across retries.
- **Loop runner** (ADR 0014, owner 2026-09-25): GitHub Actions, one fresh session per run. It uses the `ANTHROPIC_API_KEY` secret (spend-capped), not federation. OIDC federation is recorded as future hardening. The agent's GitHub App secrets are `APP_ID` / `APP_PRIVATE_KEY`.
- **Dead letters are resolved (`resolved_at`), never deleted.** `error_message` keeps the original cause; `last_error` holds the latest replay failure.
- **The unattended runner is OFF** (owner, 2026-09-25): `agent_loop_enabled` is inactive in PostHog, and it stays off until the owner decides on a measured trial. Until then, backlog work happens in interactive sessions. Never switch it on from a session.
- **The loop's workspace must be trusted, and an untrusted run must fail** (ADR 0014 amendment). An untrusted `claude -p` ignores every project allow rule. The only sign is a stderr warning; the exit code stays 0.
- **Two spend limits** (ADR 0014): the workspace's monthly limit is the backstop for a leaked key; `LOOP_MAX_BUDGET_USD` caps each run. The monthly limit must be at least runs per month × the per-run budget.
- **Lead writes go through `capture_lead` only.** No code path inserts into `leads` directly (BLOCK #8).
- **Event payloads: 8 KB, 9 KB per event, 256 KB per request; oversized refused (413), never dead-lettered; never PII** (ADR 0016, owner 2026-09-25). Per-kind payload schemas are queued (`EVENT-PAYLOAD-SCHEMAS`) for when page event capture lands.
- **Design files reach the agent only as the owner's copies** in `design-approved/<page>/` (ADR 0010, owner 2026-09-26). `design/` stays closed. Each page spec names its copies, and a spec's text grants nothing by itself. Page work runs in a local session.
- **No real manufacturer names anywhere in the repo outside `docs/`**, specs included. The demo brand is "the demo brand".

## Known Issues / TODOs

### Waiting on Yazeed

- **Repo visibility decision** (keep public / go private).
- **`docs/ADMIN-DESIGN-BRIEF.md`**: it names a real manufacturer + model line as seed data. Commit as-is, genericise that line, or keep it out of the public repo? (0-H.5 is otherwise complete.)
- **Base 1·A spec, theming REV and design exports** — REV2 amends documents that are not in the repo. 1·A cannot start in slice order without them.
- **Sentry DSN and PostHog project key**, set as Vercel env vars (not shared in chat). The code will be a no-op without them.
- **PostHog connector re-authorization** — needed to create and flip the test flag in 0-H.6.
- **Merging each 0-H PR** as it goes green.
- **Archiving the old repo** after its farewell commit is pushed (0-H.7).

### Carried

- Send the studio package (`docs/autoverse-model-delivery-spec.html` + `docs/model-manifest-template.yaml`) and lock the shared ID vocabulary + change process.
- Two documentation portals (internal + client-facing) — Phase 1·D.
- `CLAUDE.md` names a car maker as a quality benchmark ("Porsche-level bar"). REV2's acceptance bans real manufacturer names outside `docs/`. Left untouched because `CLAUDE.md` is the operating manual; Yazeed to decide whether to reword it.

## ✅ 1·A BLOCK review — resolved 2026-09-24 (kept for the record)

> **Status 2026-09-24:**
>
> - **Merged:** #4 (#26), #5 (#27), #6 (#28), and the #1 groundwork (#30).
> - #2 and #3: the scheduled worker plus a worker-driven gate are in **#33**.
> - #1: enforcement on the anon key, with Turnstile and rate limits, is in **#34**.
> - #7: **merged, PR #57** (composite FK + test 0017), 2026-09-25.
> - #8: **merged, PR #58** (`LeadRepository.create` → `capture_lead`), 2026-09-25.
> - #9: **merged, PR #61**, 2026-09-26. Decided 2026-09-25 in `#build-decisions` (owner): option A. 8 KB per serialized payload, enforced in Zod and by a CHECK on `events`; oversized events refused with a 4xx, never dead-lettered; 256 KB request-body cap on ingest-event. Plus an ADR: event payloads never carry PII. Option C (per-kind payload schemas) queued as a follow-up for when page event capture lands. Hosted pre-check run by the owner: 0 rows over 8192 bytes, so the CHECK is safe. Queued as `BLOCK-FIX-9`.

The phase gate passed, and a consolidated `security-review` over slices 3–9 then returned **BLOCK**.
Both are true, and the second is the more important one: **the gate passes on a system that, deployed
as it stands, would lose every dead letter and deliver no lead notification.** Read this before
merging anything past #18.

Read-side tenant isolation came through clean — the reviewer could not break it, and the PII audit
found no path for an end user, anon or another brand to reach lead data. The problems are on the
**write side** and the **availability side**.

### Must be fixed before these pipelines carry real traffic

1. **CRITICAL — the edge functions authorize nobody.** `validate-theme` takes `brand_id` from the
   request body and writes `brand_themes` with the service-role key: no session check, no ownership
   check. Anyone who can reach the URL can repaint any brand in any market. `capture-lead` and
   `ingest-event` share the shape — lead injection into any brand with a **forged consent record**,
   and events under any brand id. RLS is sound; this bypasses it by design. Needs a decision from
   Yazeed on how consumer-facing capture authenticates (server-resolved brand rather than
   caller-declared, plus the rate limiting CLAUDE.md requires and no function currently has).
2. **CRITICAL — no worker exists.** `services/job-worker` has no entrypoint, and nothing calls
   `claim_jobs`, `complete_job` or `planReplay` outside tests. Both dead-letter queues are
   write-only, and **no brand is ever notified of any lead**. Needs a scheduler decision (Supabase
   scheduled function vs an external cron).
3. **HIGH — the gate certifies a pipeline it does not drive.** `phase-gate.sh` performs the
   dead-letter insert and the replay _itself_, standing in for the components in (2). The one thing
   it genuinely proves is that a killed backend rolls back, which is Postgres, not us.
4. **HIGH — events idempotency breaks in production.** supabase-js `.upsert()` emits
   `ON CONFLICT DO UPDATE`, which trips `events_write_once` on ordinary redelivery of an already
   processed event — and then the whole batch is dead-lettered into the queue nobody drains. Test
   0008 uses `DO NOTHING`, which is not what the code runs, so it was invisible.
   Fix: `{ onConflict: "id", ignoreDuplicates: true }`, and test the statement the code emits.
5. **HIGH — claimed jobs have no lease and no reaper.** A worker dying mid-job leaves the row
   `running` forever, and the dedupe index (`pending`,`running`) then blocks that work from ever
   being re-enqueued. The comments claiming it "comes back on the next sweep" are wrong.
6. **MEDIUM-HIGH — the lead dedupe comment is false.** The key is the newly generated lead id, so a
   replayed capture creates a second lead and emails the brand twice. `capture_lead` needs an
   idempotency key from the payload.
7. **MEDIUM — `lead_activities.brand_id` is not tied to its lead's brand.** Composite FK missing,
   inconsistent with the same file's own pattern for models and trims.
8. **MEDIUM — `LeadRepository.create` bypasses `capture_lead`**, so a lead written through it has no
   first activity and no routing jobs — the exact outcome slice 8 exists to prevent.
9. **MEDIUM — event payloads are unbounded.** `z.record(z.string(), z.unknown())` with no size cap,
   in a write-once table that cannot be scrubbed.

### Also noted

- No CI canary for RLS on `leads` itself (the one PII table), nor for 0009/0010.
- `control_plane` revokes insert/update/delete but not `truncate`, unlike the later migrations.
- AA constraints, the SECURITY DEFINER grants, the append-only guards and the claiming logic all
  held up under attack — those parts are sound.

## Next Session — Start Here

`ENGINE-CORE-1A` is **done**. **`AUTONOMOUS-LOOP-P2` is in progress, with the runner OFF** (`agent_loop_enabled` inactive, owner's call, until a measured trial). Sessions are interactive. `AUTONOMOUS-LOOP-P1` stays in progress until its acceptance items are proven (several are proven by P2's own acceptance run).

### 0. First thing next session

1. **Continue `PAGE-CONSUMER-SHOWROOM`** (`specs/SPEC-page-consumer-showroom.md`), in a **local** session. The design source is the owner's copies in `design-approved/showroom/`, read with the file tools only, never the shell. One PR per slice against `main`; stop after each for the owner's merge. Anything the design shows that the schema lacks is Tier B, never invented. The EG consent value is HUMAN ONLY.
   - #66–#69 are merged (2026-09-26; the #69 hosted pre-check returned 0 rows, the Supabase check is green on `main`, and `page_showroom` exists in PostHog, off). All five Tier B decisions are answered.
   - #70 (read path, ADR 0018) is merged. The owner approved `public_path`, and ADR 0018 now records the owner's requirement that unpublish deletes the public object.
   - **Merged: the wiring PR #71 (slice 1b).**
     - The page reads `showroom_catalog` over GET with the anon key, and validates the payload with a strict Zod schema (`catalog-schema.ts`).
     - The loader is reshaped to that payload (ADR 0018: the per-row brand/status/publish checks are removed, and the structural orphan checks added). Facets group by vocabulary key; prices use `price_amount` in the market currency.
     - The catalogue is cached per subdomain, per server instance, with a **hard** 60 s expiry that never serves a stale entry (ADR 0017 amended). Next's data cache was rejected, because its stale-while-revalidate could show an embargoed model after a quiet spell. The trace id goes to PostgREST as `x-request-id`. Source errors log the HTTP status or the failing schema paths; a contract break or a 4xx is not retried.
     - Preview demo path: `SHOWROOM_PREVIEW_SUBDOMAIN=demo` (Preview only) maps `*.vercel.app` previews to the demo brand. Runbook: `docs/runbooks/showroom-preview-demo.md` (seed values, Vercel variables, flag).
     - engine-core types are synced with #67–#70.
     - **Gap, recorded (code review):** no contract test runs `ShowroomCatalog.parse` against the real `showroom_catalog` output. The key sets are kept in step by hand, in test 0022 and `catalog-schema.ts`. Closing it needs PostgREST in CI (the `isolation` job only starts Postgres), so it is a `ci.yml` change for the owner. Until then, a `CatalogShapeError` pages (ADR 0017).
     - Deferred (code review, low): on expiry each concurrent request on a warm instance reads the database; sharing one in-flight read per subdomain can come with real traffic.
     - Demo tenant: **decided B, time-limited (ADR 0019)**. One database for Preview and Production; the demo brand is obviously synthetic (slug `demo`, "Demo brand", leads to the owner's inbox); its EG market goes off live before `CONSUMER_ROOT_DOMAIN` is set; Preview moves to its own database before the first real client brand (BACKLOG #13 `PREVIEW-DB-SEPARATION`); admin and analytics must exclude or label it.
     - The owner has the demo seed as local files, never committed because they carry the approved design's real model names: `1-demo-seed.sql` (brand, market, lead routing, the theme derived by validate-theme's rules with accent `#B50D18`, 5 models, 7 trims, 7 EGP prices, vocabulary keys), `2-demo-images-steps.md` (the public bucket `showroom-public`, 14 renamed images), and `3-demo-assets.sql` (the `public_path` rows). All are re-runnable.
   - #72 (ADR 0019, BACKLOG #13) is merged. The owner ran the demo seed (5 models, 7 trims, 7 prices) and registered 14 images in `showroom-public`. The Vercel variables are set, and `page_showroom` is active for `demo`.
   - **Finding, 2026-09-26: the preview still 404'd.** The Vercel build warned that `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SHOWROOM_PREVIEW_SUBDOMAIN` and `ASSET_BASE_URL` were "missing from turbo.json … will not be available". `turbo.json` declared no env at all, and Turbo 2 runs in strict env mode.
     - The fix (open PR `fix/consumer-turbo-env`): a package-level `apps/consumer/turbo.json`. `env` holds the build-time variables (`NEXT_PUBLIC_POSTHOG_KEY/HOST`, `NEXT_PUBLIC_SENTRY_DSN`, `ASSET_BASE_URL`); `passThroughEnv` holds the runtime-only ones (Supabase pair, `SHOWROOM_PREVIEW_SUBDOMAIN`, `CONSUMER_ROOT_DOMAIN`, `SENTRY_DSN`, `CI`, Vercel system variables). `SHOWROOM_SOURCE` stays undeclared on purpose.
     - `apps/consumer/turbo-env.test.ts` fails CI (via `pnpm test`) when the consumer reads an undeclared variable; checked by removing `SUPABASE_URL`, which made it fail.
     - The showroom lives at `/` of the preview address.
     - **Probably not the cause of the 404** (code review): Turbo filters the build process, while Vercel functions read runtime variables from the project settings; the `NEXT_PUBLIC_*` values reached the build anyway through Turbo's Next.js inference. The actual reason was not readable here (the Vercel connector can't see the project). The page now also logs `flag_eval_failed` with `reason: no_posthog_key` when the PostHog key is missing, which was the one silent path to a 404. The runbook's table maps the logged `showroom_not_found` reason to its fix.
   - #73 is merged. **The preview works end to end** (owner, 2026-09-26): at `/` it shows the demo brand, 5 models, 7 trims and the correct EGP prices, read live.
   - **Open: slice 8, motion** (`feat/showroom-slice-8-motion`, 2026-09-28). ADR 0026.
     - **Tokens:** the approved page's timings are now tokens in `design-tokens` (overlay 550 ms, reveal 650 ms with a 120 ms stagger, curtain 820 ms, car entrance 1.6 s, count 1.75 s, their curves, and the distances), with a TS↔CSS parity test. `ui/motion.ts` gains the semantic motions `curtainLift`/`curtainSkip`, `sectionReveal`, `carEntrance`, `statCount`, `overlayIn`/`overlayOut` and `scrimFade`.
     - **IntroCurtain** (spec §5.1):
       - once per session: an inline constant script marks `<html data-intro-seen>` from sessionStorage before the curtain parses, and CSS hides it (never shown then hidden);
       - it lifts when the high-priority hero image decodes, capped at 900 ms, or at the first input;
       - aria-hidden, and never rendered under reduced motion;
       - `<html suppressHydrationWarning>`.
     - **Reveal / CarEntrance / StatCount:**
       - server-rendered final; only what starts below the fold is hidden after hydration, then revealed once seen;
       - the range header and section headers reveal at level 0, cards at level 1 (+120 ms);
       - the cards' car drives in from behind (mirrored in RTL by the frame);
       - card figures count up from zero in the page's digits.
     - **Overlays:** the drawer, filter sheet and lead modal get enter/exit motion (AnimatePresence + Radix `forceMount`, `ui/overlay-motion.ts`). The filter sheet owns its open state and closes itself at `lg`.
     - **Dock:** tinted glass, token `glass-dark` (Gunmetal at 88%, blur and saturate). `glass.test.ts` checks its text over the tint composited on white, Mist and Onyx (soft ink ≈ 6.8:1 over white).
     - **Checked:**
       - tokens: 103 tests; ui and consumer suites green;
       - local browser (fixture, temporary overrides reverted and grepped):
         - the curtain shows once, lifts, and is gone on reload; no hydration warnings;
         - the reveals and count-ups fire on scroll;
         - the drawer slides in from the end and out, with focus returned;
         - the modal lands and the name field is focused;
         - the dock's computed background is 88% Gunmetal with blur.
       - The fixture has no car images, so the car entrance needs the preview.
     - Noted: the drawer's exit started about 240 ms after the close in the dev server; check on the preview build.
     - Reviews:
       - security-review **APPROVE**. Applied: a comment that the inline script must stay a constant; the CSP hash/nonce note in ADR 0026.
       - code-reviewer CHANGES REQUESTED, all applied:
         - B1: the curtain can't cover the page for good. A CSS failsafe hides it after 2 s with no JavaScript, and the cap counts from navigation start.
         - Lifting also marks `<html>`, and storage is read, so a same-document remount stays hidden.
         - The car's motion moved onto the filtered image layer.
         - StatCount is driven by a motion value in tabular digits.
         - One reduced-motion hook (`ui/use-reduced-motion.ts`).
         - Tests: overlays gone at once under reduced motion; the drawer enters from the left in RTL; the sheet closes when the window grows to lg; SSR renders final (Reveal, CarEntrance, StatCount).
         - Smaller fixes: FilterSheet reads `onOpenChange` through a ref; `palette.onDarkSoft` is the single soft-ink value; the curtain offstage and entrance delay are tokens.
       - Kept by choice: the filter sheet closes on a change to lg, not when opened at lg (its trigger is hidden there, and closing during its own entrance stalled motion's exit).
     - **Owner review round (2026-09-29), five fixes pushed to #88. All timings are token edits:**
       1. Curtain: at least `durationCurtainHold` 1.2 s from navigation start, then an 0.8 s lift once the hero image decodes (it waits at most to 1.8 s). The failsafe was raised to 3.2 s. Found the real cause of "vanishes": lifting set `<html data-intro-seen>`, whose CSS hides the curtain at once and cut the lift. That came from the first review round, and lifting now writes storage only. Measured locally: the lift fires 1,227 ms after navigation.
       2. Drawer: 700 ms in / 480 ms out with one gentle ease-out (`easingGentle`), a fade added, and the scrim on the same timings. The ~240 ms exit delay was a re-render of the whole shell: the drawer's state now lives in `SpecDrawerHost`.
       3. Hero: the trim pill floats over the top of the model area, so every model has the same area, car position and height. With trims, the area had been 49 px shorter and the car 25 px lower, meeting the backdrop's floor band: the "border". The stats also fit a 375 px phone now.
       4. Filter sheet: the same slower overlay timings, open and close; transform only.
       5. Dock: light glass, Mist at 55% under a 40 px blur with saturation, Onyx names and a Gunmetal active pill. Contrast: Onyx over the glass 5.9:1 at worst (Onyx beneath), 17.9–19.2:1 over the light page; the pill 14:1. One tint passes everywhere, so no switching was needed.
     - **PROGRESS.md repaired in this PR:** the slice-7 update inserted a second copy of the file (a replacement pattern in my edit script). The copy was verified byte-identical and removed (911 → 556 lines); the edit tooling now uses plain string slicing.
     - Raised for the owner: CI has no browser-level Storybook/axe or reduced-motion job; reduced motion is enforced structurally (`design-system-gates.test.ts`) and in unit tests. A browser gate would be a `ci.yml` change.
   - **Slice 7 (merged): LeadModal + capture contract** (2026-09-28). Three PRs, each against `main`:
     1. **#84 `fix/capture-lead-cors`: merged.** The owner redeployed both functions; the preflight answers 204 with `access-control-allow-origin` on both. Finding: `capture-lead` and `ingest-event` answered the browser's CORS preflight with 405 and no CORS headers, so no page could ever submit (the contract's custom headers force a preflight).
        - Now: `OPTIONS` → 204 first thing (`services/shared/cors.ts`: `*`, no credentials, the four contract headers, max-age 600); every answer carries the CORS header and `nosniff`.
        - A top-level try/catch turns any throw into a logged 503 (`lead_unhandled_error` pages).
        - `Origin: null` is refused as no caller.
        - `X-Trace-Id` is kept only if `^[A-Za-z0-9-]{8,64}$`.
        - ADR 0013 amended (why `*`, why no proxy), runbook verify step with a `curl`.
        - Reviews: security APPROVE; code review CHANGES REQUESTED, all applied (unhandled-throw path, the tests type-checked, a `requireEnv` anchor).
        - **Owner after merge:** redeploy both functions.
        - Follow-up (security review, predates it): Turnstile is called before any rate limit, so a cheap per-address limit ahead of it is owed.
        - Info: two brands could list the same origin; add a rule before any shared hosting.
     2. **#85, read path: merged** (owner post-merge steps done: the demo's `web` key, the `eg-v1` row, verified through `showroom_catalog`). Migration `20260928140000`, test 0026, ADR 0025 and an ADR 0018 amendment.
        - `consent_texts`:
          - append-only in the database: row triggers refuse update/delete and a statement trigger refuses truncate, for every role;
          - format, length and `{Brand}`-only placeholder CHECKs;
          - RLS read for staff and the owning brand; writes by the service role only.
        - Leads cite `(brand_id, market_code, consent_text_version)`. The FK is **NOT VALID**: it binds new leads, and older test leads keep their strings. An unknown version → 23503 → `rejected` → 422.
        - `showroom_catalog` returns:
          - `lead_consent {version, en, ar}`: the latest row with `published_at <= now()`;
          - `capture_key`: the newest unrevoked `web` key, as a string only.
          - Both are null when there is none, and then there are no lead CTAs.
        - Every existing lead test and `phase-gate.sh` seeds a consent row; 0022's top-level key set now includes both keys.
        - Consumer Zod accepts both as optional/nullable, with the database's rules. The fixture carries `eg-v1` with the owner's wording and `capture_key: null`.
        - The SQL tests run only in CI: no Docker locally.
        - Review changes applied:
          - Security (tenant isolation APPROVE): NULL-safe assertions in 0026 (`is distinct from`, including the owner's revoked-key fallback test); the DB and Zod text rules aligned (≤ 2000 code points, a non-space character); an unacceptable consent row becomes `null` (no CTAs), never a failed catalogue; `created_at` stamped by the DB.
          - Code review: a lint fix in the schema test; the one-way deploy order recorded (ADR 0018); a runbook step with the consent insert and a verify query.
        - Follow-ups (not in this PR):
          - A lead can cite a version scheduled for later. A possible hardening is `published_at <= consent_at` in `capture_lead`, which would be sensitive to skew in the form's clock.
          - `lead_activities` has no truncate guard; `consent_texts` shows the pattern.
          - Before a real brand is live, ship a read-path change consumer-first.
        - **Owner:** after merge, run runbook §2.4 (the `eg-v1` insert for the demo) and §2.3's key check. The demo needs an unrevoked key labelled `web`.
     3. **`feat/showroom-slice-7-lead-modal` (open, waits for merge).**
        - `packages/ui`: **TextField**, **Select** (Radix Select), **Checkbox** (Radix Checkbox), **LeadModal** (Radix Dialog: a centred panel, a full-height sheet on phones, the drawer's visual language), each with stories, tests and axe LTR/RTL.
          - LeadModal behaviour: it focuses the first field; a failed validation focuses the first invalid field; success replaces the form and focuses its heading; focus returns to the opener. City is left out when the market lists none.
          - Opener slots: TopBar `bookTestDriveSlot`, ModelSection `action` (a sibling of the toggle, never inside it), ModelCarousel `bookTestDrive` (ghost), SpecDrawer `secondaryAction`.
        - Consumer `lib/lead/`:
          - `capture.ts`: the page contract:
            - the three headers;
            - one `submission_id` per request, reused on retry, a new one once anything changes or after a 409;
            - a fresh Turnstile token per attempt;
            - 201/403/409/422/429 final;
            - 503/502/504/network retried with backoff 1/2/4 s (4 attempts, 20 s each).
          - `turnstile.ts`: explicit render, execute per attempt, the script loaded only when the modal opens.
          - `phone.ts`: EG mobiles only (`01[0125]` + 8), Arabic digits, 00/+20 forms → `+20…`; other markets need `+`.
          - `form.ts`, `config.ts` (a server-side fail-closed gate: consent text, capture key, site key, capture URL) and `copy.ts` (EN/AR; the Arabic wants a native read).
        - `app/lead-capture.tsx`: the provider and the modal host. Failures go to Sentry with tags only (outcome, status, attempts, market, type, trace id): no name, phone or city.
        - Flag **`showroom_lead_capture`** (keyed by subdomain, default off). With the flag on and a piece missing, the page logs `showroom_lead_capture_unavailable` (error) and renders no CTAs.
        - Docs: an ADR 0017 amendment (alerts) and a runbook `flag-kill-path.md` section.
        - Checked:
          - the full gate (`--force`) and the consumer build;
          - ui 203 tests; consumer lead tests: contract, form, phone, config, Turnstile, the flow in jsdom and the page wiring.
        - Local browser check (fixture, temporary overrides reverted and grepped):
          - the CTAs render;
          - validation errors show and focus moves;
          - the 503→201 retry kept the `submission_id` and trace id, with a real Turnstile test-key token per attempt;
          - success; RTL/Arabic;
          - the drawer opener stacks and returns focus;
          - the hero prefills the model;
          - the phone sheet works;
          - no console errors.
        - Found and fixed in the browser: an Arabic phone example rendered reversed (now LTR-isolated), and an empty City field was shown when the market lists none.
        - Reviews:
          - security-review **APPROVE**. Applied: `{Brand}` is filled with a function (a `$` in a brand name can't alter the wording; tested), and a comment by `Sentry.init` (widening `tracePropagationTargets` would break the CORS preflight).
          - code-reviewer CHANGES REQUESTED, all applied:
            - B1: the modal can't close while sending (the bot check lives in it, so closing lost the retries' tokens), plus a re-entry guard; tests cover both.
            - B2: a page-side Zod schema (`lib/lead/schema.ts`) parses the body before sending, types are derived from it, and a contract test pins it to capture-lead's `publicLeadSchema`.
            - B3: field and checkbox borders are the muted ink (≥ 3:1, WCAG 1.4.11), with a stronger Select highlight; the success state is described by its message.
            - Tests for 409 → a new id, and a Turnstile load failure → nothing sent, reported.
        - **Not done: the local-stack end-to-end (spec §9 slice 7).** No Docker on the dev machine. The real end-to-end is the owner's preview submit (201, one lead, one email); the Playwright local-stack E2E stays with slice 10 (§10).
        - Follow-ups (reviews; not in this PR):
          - capture-lead doesn't check the Turnstile `action` (`lead`), and doesn't check `city` against `lead_cities`. A trim can be stored under another model of the same brand.
          - `packages/types` still exports a stale `LeadType` (`quote | test_drive`).
          - Join the submit trace to the page render trace.
          - Revisit `verification_failed` at level error once real traffic shows the human-failure rate: it is kept at error because a server 403 (origin or hostname misconfig) is systemic.
          - `contact` has no opener until the footer.
          - Modal motion is slice 8; lead modal events are slice 9.
          - If a CSP is added: `script-src` and `frame-src` for challenges.cloudflare.com, `connect-src` for the Supabase, Sentry and PostHog hosts, and the hoisted brand-theme style.
     - **Tier B, all decided by the owner in `#build-decisions` (2026-09-28):**
       - (1) consent **A**: append-only, enforced in the DB; leads reference an existing version. The EG wording is supplied by the owner as `eg-v1`, approved for the demo and EG pending legal review before a real brand. `{Brand}` is filled from the brand name at render time.
       - (2) key **A**: only the newest unrevoked `web` key, with exact-field and revoked-key tests.
       - (3) openers **A**:
         - TopBar "Book a test drive" (`test_drive`);
         - hero ghost "Book a test drive" (model prefilled);
         - section-header "Request a quote" (`quote`, model);
         - drawer secondary "Book a test drive" (model + trim);
         - the card unchanged; `contact` for the future footer.
     - Found: `packages/ui` has no TextField, Select or Checkbox yet (Tier 1 had nine other primitives); they come with PR 3.
   - **Slice 6, compare tray: merged as #82** (`feat/showroom-slice-6-compare`, 2026-09-28; #80 and #81 merged; the spec seed is verified: 2 tabs / 26 groups / 10 rows per model).
     - `packages/ui`:
       - **CompareToggle**: a native checkbox with its label, token-styled. At the limit it is disabled and says why.
       - **CompareTray**: dark, fixed at the bottom centre; thumbnail, name and Remove per trim; a polite live count; "Compare N" from 2, and only with a link. Remove keeps focus in the tray.
     - Consumer: `lib/showroom/compare.ts` (**exactly a pair**: limit 2 = min 2; link builder; `?trims=` parser); the shell holds the selection (in memory for the visit); each card's compare slot gets the checkbox.
     - **Compare route placeholder** `/compare`, behind its own flag **`page_compare`** (default off): the showroom's gates, then that flag. It lists only published trims of this brand-market from `?trims=` (at most 3 uuids), says the comparison is coming, and links back; `noindex`.
     - **Decided (owner, B):** exactly 2, a pair (the approved compare page is built as one). "Compare" works only with the pair; a third pick is refused. Spec §5.9 amended.
     - Code review (CHANGES REQUESTED) applied:
       - removing the last trim returns focus to its card checkbox;
       - at the limit the checkbox is `aria-disabled`, so it stays focusable and says why;
       - "none selected" is announced;
       - the compare flag is evaluated in parallel;
       - one shared gate (`app/showroom-gate.ts`) for "/" and "/compare".
     - Observability: `/compare` is a flagged placeholder. It logs `compare_view` and `compare_not_found`, and its failures page through the shared showroom gate (Sentry, ADR 0017). Its own metric and alert come with PAGE-CONSUMER-COMPARE.
     - **Smoke finding (owner, 2026-09-28):** "Smoke (post-deploy)" has failed on every production deploy since 2026-09-26. Its home-page step expects 200 at `/`, but the production vercel.app host has no brand, so `/` correctly 404s. Health and the deployed commit were fine; it was not deployment protection. The fix is a replacement `smoke.yml` (health reports the deployed sha; the unknown host must get the brand-neutral 404 with no `data-showroom`), given to the owner because `.github/` is human-gated.
   - **Slice 5, spec drawer** (#80 + #81, merged; #79 brand logos merged, and the demo logo is registered):
     - **#80, read path** (`feat/showroom-catalog-spec`): `showroom_catalog` returns `spec { tabs, groups, rows }` for published models.
       - Per-trim values: published trims only, well-formed only, `{en, ar}`.
       - A per-trim row with no published trim is left out.
       - Migration `20260928120000`, test 0025, 0022 key set, ADR 0018 amended.
       - The consumer's Zod takes `spec` as optional.
       - Security review: isolation clean; its Medium (a draft-trim row's label) and Low (a malformed value) are fixed.
     - **Slice 5 UI** (`feat/showroom-slice-5-drawer`, stacked on #80):
       - `packages/ui` **SpecDrawer**: a Radix Dialog side panel from the inline end (full height on phones); Radix Tabs, then Collapsible groups (first open), then key/value rows and notes; Configure (accent) disabled; focus returns to the trigger, even in Safari (`returnFocusTo`).
       - **SpecDrawerTrigger**: the card's "Technical data ›" row.
       - Consumer: `lib/showroom/drawer.ts` resolves the ledger per trim with engine-core `resolveLedgerRow` (now typed on `LedgerRowFields`). An empty group gets the "data will be added" note; no ledger gets the note alone.
       - The shell opens one drawer at a time.
     - **Demo data:** a demo-ledger seed file (not committed) builds the approved tabs and groups from the demo's own columns; the owner runs it after #80.
     - Code review (CHANGES REQUESTED) applied: the drawer carries its own `dir` (it is portaled out of the page), so the tab arrows follow RTL (tested); the RTL axe test now really runs RTL; the model name is `h3` and group toggles sit in `h4`s; loader orphans: dropped tabs are logged, and rows are checked against ACCEPTED groups; focus after Escape is tested. Kept by choice: "From" on a trim price (same as the cards).
     - Deferred: drawer slide motion (slice 8). Watch the payload in the slice-10 performance pass: every trim's resolved drawer ships to the client (small at demo scale). If it grows, ship each model's ledger once and resolve on the client (resolveLedgerRow is pure).
   - **Brand logos** (`feat/brand-logo`, merged as #79; #78 TopBar merged). **ADR 0024.**
     - Owner decision (`#build-decisions`): a logo is a public-bucket key `{brand}/_brand/logo-{light|dark}.{hash8}.{svg|png}`, rendered via `<img>`, never inline SVG, with the brand name as fallback.
     - Migration `20260928100000` + test 0024:
       - CHECK formats per variant;
       - a trigger: the key's brand folder must be the row's own brand (insert, update, a brand move);
       - a trigger: a brand's slug can't change while it has logos.
     - Consumer: `logoPath()` re-checks, drops a foreign ref and logs `showroom_logo_invalid`. The TopBar shows `logo_dark` (for dark surfaces).
     - Tool: `asset-tools/src/logo-cli.mjs` (SVG blocklist, PNG alpha, hashed names, SQL). Runbook section _Brand logos_; the orphan query now excludes logo keys.
     - Security review PASS; its fixes applied.
     - **Decided (owner, B):** logos are named by the surface they go on. The dark TopBar uses `logo_dark` (the white mark); `logo_light` is for light surfaces. The tool warns when a logo is under 3:1 on its surface. The hosted pre-check returned 0 rows.
     - **Next: slice 5** (spec drawer).
   - **TopBar** (`feat/showroom-topbar`, merged as #78; #77 merged with the hero backdrop). The owner's slice-4 decisions are recorded in `#build-decisions`: 1–3 agreed; the dock stays solid for now, with a tinted glass that passes contrast in slice 8.
     - `packages/ui` **TopBar** (server component): brand wordmark (the logo slot waits for a defined `logo_*_asset_ref` format), the market chip, EN/AR as plain links (hreflang, aria-current), and "Book a test drive" disabled until slice 7 (hidden on phones). The height is a token, `--av-topbar-height` / `topBar.height` (64px); the hero is `max(100svh − bar, 40rem)`.
     - `proxy.ts` passes `?lang=` to the root layout as a header (always overwritten), so `<html lang dir>` follows the page (it was static `en`/`ltr`).
     - Carousel keyboard fix (owner report: ←/→ did nothing on the preview). The keys worked only with focus inside the hero. Now they also work with nothing focused while the hero fills the middle of the screen; focused controls keep their keys.
     - **Next: slice 5** (spec drawer), after this merges.
   - **Slice 4** (`feat/showroom-slice-4-hero`, merged as #77; #76 merged: slice 3). **ADR 0023.**
     - `packages/ui`: **ModelCarousel** (Embla: 1:1 drag, one per flick, loop, centred, 92% slides from `md`, RTL; model names, trim pill with crossfade, prev/next, arrow keys, live region, count-up stats, Configure disabled + "Show trims"), **CountUp**, **ModelDock** (sliding pill via motion `layoutId`, `inert` when hidden), and `motion.ts` (semantic motions `countUp`, `pillSlide`, `crossfade` on the tokens; instant under reduced motion). Stories, tests, axe in both directions.
     - Hero framing: `carFrame.heroFill` / `--av-car-fill-hero` = **80%** of the 16:9 box (same as the side view; ADR 0022 amended).
     - Consumer: `app/showroom-experience.tsx` shares one active model between the hero, the dock and scroll-spy (`lib/showroom/spy.ts`: 30% line, bottom = last, suspended until `scrollend`). The dock shows only the visible models (RangeExplorer's `onVisibleChange`) and hides below 2. The first hero image is the one `fetchpriority=high` fetch.
     - Arabic fix (owner): "N محدد" → "محدد: N".
     - Code review (CHANGES REQUESTED) applied: stable Embla options (no reInit per model change; tested); trim-pill arrows stay in the pill; the live region speaks only for carousel moves; state changes reported once (not from an updater); `carouselSettle` motion + `--av-hero-slide` token; an opaque dock (AA-paired text); overlapping dock picks (`createSpyHold`); CountUp follows a new format and restarts interrupted tweens from where they stopped.
     - **Open (owner):** the hero CTAs (Configure glass/disabled + a Mist "Show trims", vs the spec's accent primary) and no from-price in the hero (ADR 0023 §4–5); the TopBar has no slice; the hero backdrop file must be added at `apps/consumer/public/showroom/hero-backdrop.jpg` (the shell can't copy it out of the approved design folder).
   - **Slice 3** (`feat/showroom-slice-3-filters`, merged as #76; #75 merged: the 80% car fill).
     - `packages/ui`: **FilterPanel** (search, sort, collapsible facet groups with counts; options are `aria-pressed` toggle chips, selected = the brand accent per the theming REV), framed as **FilterSidebar** (sticky, glassy, from `lg`) and **FilterSheet** (Radix Dialog bottom sheet below `lg`; focus goes to the sheet, not the search field, so no phone keyboard on open). Stories + tests + axe in both directions.
     - Consumer: `lib/showroom/range.ts` (pure): whole models hide; OR within a group, AND across groups; drive/seats match when any trim has the value (the same rule as the counts); search on the model name in either language; sort featured / name (page language) / power (best trim, high→low) / 0–100 (quickest trim); missing figures last; ties keep line-up order. `app/range-explorer.tsx` (client) holds the state and orders the server-rendered sections. Result count ("4 of 5 models") in a polite live region; an empty state with Clear all.
     - Copy EN/AR from the prototype's `L` strings; Arabic plurals via `Intl.PluralRules` (zero/one/two/few/many/other). The strings beyond the prototype (empty state, "N selected", plural forms) want a native read.
     - Code review (CHANGES REQUESTED) applied: a live region inside the modal sheet; a selected chip's count at full on-accent strength (no opacity); focus kept on Clear all (to the search field / the result count); the sidebar always renders (search and sort without facets); Arabic search folding (hamza forms, diacritics, tatweel, ى/ة); an `isFacetKey` guard; digits resolved on the server (`numberingSystem`) so SSR and the browser format identically; RangeExplorer interaction tests (jsdom).
     - Deliberately deferred: sheet enter/exit motion, and closing an open sheet when the window grows past `lg` (slice 8); the dock reflecting visible models (slice 4); filter/sort events (slice 9).
   - **Slice 2** (`feat/showroom-slice-2-cards`, merged as #74).
     - `packages/ui`: **VehicleCard** and **ModelSection**, each with stories, tests, and axe checks in LTR/EN and RTL/AR. ModelSection uses Radix Collapsible (the APG accordion pattern); the grid is 1/2/3 columns, and a card is never stretched.
     - Button gains an `accent` variant (the brand accent; Configure). The tokens gain neutral defaults for the accent family (AA-paired in the token test), the Tailwind bridge, and a `2xl` radius (28px, the card).
     - The consumer loads the design system (Tailwind v4 via PostCSS, tokens, self-hosted fonts). The page renders a section per model and a card per trim. Images come through `next/image` from `ASSET_BASE_URL` + `public_path` (**ADR 0020**; one remote pattern, a 1-day optimiser TTL until keys are content-hashed).
     - `?lang=ar` renders Arabic/RTL until the TopBar toggle (slice 4).
     - Configure and Explore are **disabled** until their pages exist; Technical data (slice 5) and Compare (slice 6) are hidden.
     - **Card decided (owner, 2026-09-27, 1B + 2A; ADR 0021):** a white card with no wedge, as the approved file. White is a paired surface token (`--av-surface-white`, in both contrast tests, with the accent). The year, icons and dividers are brand-accent "small accents", and Configure is the accent. Spec §2/§5.7 and the theming REV are amended; the `muted_hex` → wedge routing is removed. ADR 0021 confirms the accent is validated against white (CHECK `brand_themes_aa_accent_on_white`). BACKLOG #14 `FOCUS-COLOUR-CONTRAST-CHECK` (trigger: before the first real brand goes live).
     - **#74 merged (2026-09-27).** The owner re-processed and registered 14 hashed masters (0 errors); the preview shows every car facing right on one ground line.
     - **#75 merged (2026-09-28):** the side-view car fills 80% of the 2:1 box, centred and bottom-aligned, from the token `carFrame.sideFill` / `--av-car-fill-side`; the hero is unchanged until slice 4. ADR 0022 amended.
     - **Asset standard (owner, 2026-09-27; ADR 0022), added to #74:**
       - Finding: no code flipped any model; the wrong-way Lyriq was a stale copy under a reused name (storage `max-age=3600` + the optimiser).
       - One master per trim per view: partial unique indexes on `assets` (migration `20260927100000`, test 0023; hosted pre-check in the runbook).
       - Side masters face RIGHT; `car-direction.test.ts` fails on any mirror other than the RTL rule.
       - Content-hashed names `{brand}/{model}/{trim}-{view}.{hash8}.{ext}`.
       - `CarImageFrame`: a fixed 2:1 side box / 16:9 hero box, bottom-aligned, the placeholder in the same box.
       - `packages/asset-tools`: `download.mjs` and `normalize.mjs`, placed in a workspace package rather than `scripts/assets` so their tests and typecheck run in CI.
         - They require a transparent background, trim to the car (alpha > 16), scale to 1920, and write hashed files + a re-runnable `register.sql`.
         - Direction check: a strong left is an error (`--confirm-right` after an eye check); a weak left or too close to call is a warning.
         - `--out` must be empty.
       - Code review (CHANGES REQUESTED) applied: the card padding moved to an inner wrapper, so the frame bleeds by exactly the padding; a wider flip detector; the download has a timeout, a size cap, and no redirects.
       - Runbook `docs/runbooks/showroom-assets.md`: steps + the registry-vs-bucket check queries.
       - The earlier hand-made `3-demo-assets.sql` (unhashed names) is superseded by `register.sql`.
     - Review fixes also applied: titles wrap to 2 lines (never truncated); no letter-spacing in Arabic (`rtl:tracking-normal`); the chevron uses the motion tokens; VehicleCard is a **server** component, with Technical data and Compare as slots the app fills with client triggers; correct Arabic plurals; the missing-base warning is logged once per process; `ASSET_BASE_URL` must be an https bucket prefix or the build fails (security review).
     - Deliberately deferred parity items vs the approved card: the car entry animation and the stat count-up (slice 8, motion), the slider glyph on Configure, and the approved compact car height under 24rem (ours: h-44 / h-48 / h-64 by container size).
   - `<html lang dir>` is still static `en`/`ltr` in `app/layout.tsx`. Fix it with the TopBar's EN/AR toggle (slice 4 or earlier).
2. **Owner: confirm the Supabase check on `main` applied both new migrations to the hosted DB** (`20260925120000_lead_activities_brand_fk`, `20260925140000_event_payload_cap`). The guard blocks the agent from hosted-DB reads.
3. **Owner, before any loop trial:** apply the trust-check patch to `agent-loop.yml` (ADR 0014, _Amendment — workspace trust_), and raise the monthly spend limit to at least runs per month × `LOOP_MAX_BUDGET_USD`.
4. Commit messages or heredocs that mention `design/` or `design-approved/` are blocked by the guard (it parses every line as a command). Write the message to a scratch file and use `git commit -F`.

### 1. Part 2 precondition: ✅ PASSED (2026-09-25)

A fresh session tried seven denied actions, and all seven were refused (evidence in `#build`):

- **Guard hook:** a hosted-DB read over MCP (`list_migrations`), a shell append to `.github/workflows/ci.yml`, and a shell read inside `design/`.
- **Permission rules:** Read `.env`, Read `.env.local`, an Edit to `.github/workflows/ci.yml`, and `gh api`.

This confirms that hooks load at session start. The 1·A session that read the hosted DB started before the hook existed. **Keep the loop's runs fresh sessions**: a new process per run, never a resumed long-lived one.

The guard matches command text, including text inside heredocs, so a shell command that only _mentions_ a `design/` path is blocked too. Use the Edit tool for docs that name such paths.

The precondition text itself is on `TheYazeedShaker-patch-2`, which isn't on `main` yet. The agent can't edit the spec (ADR 0010), so the owner opens that PR. Run `pnpm format` on it first: the edit removed the blank lines before lists, so it may fail the format check.

### 2. Human-only setup (owner, 2026-09-25)

| Item                                                                  | State                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slack bot in `#build-inbox` + `SLACK_BOT_TOKEN` secret                | ✅ bot is a channel member (checked). The secret is set per the owner (the agent can't read Actions secrets)                                                                                                                                                                                                                                                                                              |
| Owner's Slack user ID                                                 | ✅ confirmed, and set as the `OWNER_SLACK_USER_ID` Actions variable per the owner. It stays out of the repo                                                                                                                                                                                                                                                                                               |
| `ANTHROPIC_API_KEY` secret with a spend cap                           | ✅ per the owner. The key stays; OIDC federation is future hardening (ADR 0014)                                                                                                                                                                                                                                                                                                                           |
| GitHub App                                                            | ✅ per the owner. Secrets are named **`APP_ID`** and **`APP_PRIVATE_KEY`** (these replace the earlier `AGENT_APP_*` names)                                                                                                                                                                                                                                                                                |
| PostHog flag `agent_loop_enabled`                                     | ✅ exists and is off (checked)                                                                                                                                                                                                                                                                                                                                                                            |
| `POSTHOG_PERSONAL_API_KEY` secret (the runner reads the flag with it) | ✅ per the owner                                                                                                                                                                                                                                                                                                                                                                                          |
| Rulesets on `main`                                                    | ✅ owner, 2026-09-25: `main-ci` (5 required checks, up to date, no bypass) and `main-review` (code-owner review, 0 approvals, no bypass). The classic rule is deleted; a direct push is rejected. CODEOWNERS cleaned on `main` (owner). Owner-authored PRs verified to merge with no review and no bypass, so ADR 0015 keys auto-merge on the App author. Auto-merge stays off until ADR 0015 is accepted |

### 3. Build Part 2

**Done earlier on 2026-09-25 (runner session):**

- **Runner, revised per the owner's five fixes.** Sent to the owner as files to add (`.github/` is denied to the agent): `.github/workflows/agent-loop.yml` and `.github/scripts/loop/{kill-switch.sh,slack,inbox,outbox,digest,publish}.mjs`, `prompt.md`, `loop.test.mjs` (21 tests, all pass; actionlint + shellcheck clean). A second `security-review` approved the five-job design, with one condition (below).
  - Jobs: `gate` (PostHog) → `inbox` (Slack; owner messages go out as job outputs) → `agent` (Anthropic key + read-only token; leaves a git bundle of `agent/*` branches, PR requests, Slack messages and a pause request in a one-day artifact) → `publish` (fresh runner on `main`; re-checks the kill switch; the only holder of the App key; pushes `agent/*` fast-forward only, opens PRs, creates `loop/pause`) → `post` (fresh runner; Slack outbox, inbox ack, digest).
  - Slack: `inbox.mjs` passes only `OWNER_SLACK_USER_ID`'s messages to the agent (`.loop/inbox.md`); the bot's own replies, a Tier C "approved" included, are dropped. The agent queues posts in `.loop/outbox/*.json`, and the `post` job sends them as the bot. The ack list comes from the `inbox` job, so the agent can't choose what gets marked read. `digest.mjs` runs on the `43 4 * * *` cron or a dispatch with `digest=true`.
  - **Hard precondition before `agent_loop_enabled` goes on:** remove both `cache: pnpm` lines from `ci.yml`. The agent job can become root through docker (the local Supabase tests need it) and could poison `main`'s pnpm cache, which every PR's CI restores. That would put its code inside the merge wall.
  - Also before go-live (owner): confirm Vercel preview env vars hold nothing sensitive, or skip preview builds for `agent/*` branches (an ignored-build-step). Pushed agent branches build previews with the agent's code.
  - Hardening applied from the second review: `PAUSE` is read from live `main`; `post` stays silent if the publish re-check says stop; the bundle is fetched with `transfer.fsckObjects`; `publish` rejects a branch with any commit whose author or committer isn't the agent; Slack messages leave the agent job as a job output rather than in the public artifact.
  - Noted, out of scope: `ci.yml` and `deno.yml` still pin actions by tag, not SHA.
  - Every action pinned to a commit SHA. Triggers: schedule + `workflow_dispatch` only. Claude Code pinned at 2.1.274 (`stable`); `--max-budget-usd` confirmed in its `--help`, and the install step refuses to run if it's missing.
  - Kill switch: `PAUSE` on `main`, a `loop/pause` branch (how the agent pauses itself, spec §7), an unset `LOOP_MAX_BUDGET_USD`, or the flag off/unreadable. The agent runs with `--permission-mode dontAsk`.
  - Isolation drill: dispatch with `drill=isolation`.
  - Actions variables it needs besides `OWNER_SLACK_USER_ID`: `POSTHOG_HOST`, `POSTHOG_PROJECT_ID`, `LOOP_MAX_BUDGET_USD` (no run starts while it's unset), `SLACK_INBOX_CHANNEL_ID`, `SLACK_BUILD_CHANNEL_ID`, `SLACK_DECISIONS_CHANNEL_ID`. The bot needs `channels:history`, `chat:write` and `reactions:write`, and membership in all three channels.
- **ADR 0015, merge tiers: proposed.** Auto-merge only PRs authored by the `autoverse-agent` App that touch no code-owned path; never an owner-authored PR. Lists the CODEOWNERS gaps to close first and two open questions.
- ADR 0014 amended (no push trigger, SHA pins done, token scoping). `.loop/` added to `.gitignore`.

**Next:**

1. ✅ The runner is on `main` (owner). Two unattended runs happened. The first ran untrusted and ignored the allow list. The second hit the $3 monthly spend limit mid-task. Both are recorded in ADR 0014. The runner is now **off**.
2. Owner: apply the trust-check patch; set the monthly spend limit to fit the per-run budget.
3. Owner: answer ADR 0015's open questions and accept it; the agent then drafts `agent-automerge.yml`.
4. Owner: decide on a measured trial. Only then do the Part 2 acceptance runs happen (spec, _Acceptance criteria_: inbox pickup, kill switch, tiered merge, Tier B round trip, digest, isolation drill). The `cache: pnpm` precondition above still applies before the flag goes on.
5. BLOCK #7/#8, which were meant as the first loop tasks, were done interactively instead (#57, #58).

### 4. End-to-end lead test (owner-led)

The owner has a seed SQL for the demo brand + EG market (sent in chat; deliberately not committed: public repo, REV2 bans real manufacturer names outside `docs/`). After seeding: a real form submission (Turnstile + `X-Autoverse-Key` + `X-Autoverse-Market`) should give 201, one lead, and a Resend email within a minute. That also proves a real delivery, which the CI gate can't (its brand has no recipients).

### Known follow-ups (not blocking)

- **Scratch branch `chore/scratch-deny-test`** (PR #43, closed) is still on GitHub. This environment's git proxy cut off `git push --delete` twice. Owner: use "Delete branch" on #43.
- **Guard over-block:** GitHub's `list_branches` is blocked as a Supabase tool (the two connectors share the name). Next guard PR: add it to the shared-name exemption keyed on `project_id`. This fails closed, so it isn't a hole.

- BLOCK #7–#9 are all merged (#57, #58, #61).
- **Real manufacturer names in `main`'s history** (#60's first commit, `ad72fc4`). Removing them means rewriting `main` with the rulesets off and a force-push; the agent's advice is to leave it. Owner's call. Squash-merge PRs from now on, so a fix-up folds into one commit.
- `event_dlq` has no size CHECK (ADR 0016). Adding one first needs a hosted count of existing oversized dead letters.
- From the #57/#58 reviews (none introduced by those PRs):
  - A CI canary for 0017 (drop `lead_activities_lead_brand_fkey`, require a `CRITICAL`). This goes in `ci.yml`, so the owner adds it.
  - A lead with activities can't be hard-deleted: the cascade hits the append-only trigger. The erasure / right-to-delete path needs a design (ADR).
  - `EngineDb` calls have no timeout or abort signal. CLAUDE.md requires one on every external call.
  - The caller-supplied `source` is unbounded when it's written to `lead_activities`; it needs a length cap.
  - The logger must redact `EngineDbError.cause.details`: a CHECK failure carries "Failing row contains (…)" with the name and phone.
  - When the first real supabase-js adapter for `EngineDb` is written, add a type-level test that the client satisfies it.
- `EventRepository.record` still upserts with `onConflict: "id"` and without `ignoreDuplicates`. BLOCK #4 fixed the ingest path, not this repository method. Check whether it has any caller before the next events change.
- When a `leads` CHECK constraint fails, Postgres logs the whole failing row (name, phone). `capture_lead` should raise its own messages first.
- The CI gate runs the worker via `run-once.ts`. The hosted schedule is now proven separately (the pg_cron ticks above).
- Regenerate `packages/engine-core/src/database.types.ts` from the live schema; run `docs/runbooks/flag-kill-path.md`. (Showroom slice 1 hand-corrected the catalog, brand_markets and asset rows against the migrations; they had drifted. The rest is still hand-written.)
- When the log drain goes live, wire **ADR 0017's showroom alerts** along with ADR 0016's (the mismatch alerts page). Check on a preview that the Sentry `trace_id` tag reaches events. Next time `flags.ts` changes, turn `isFlagEnabled`'s positional arguments into an options object.
- `brand_themes.focus_hex` has only a format CHECK (BACKLOG #14, trigger: before the first real brand goes live).
- Owner: create the `page_showroom` flag in PostHog (off). The code already reads it and fails closed without it.
- `docs/ADMIN-DESIGN-BRIEF.md` stays in git history (commit `a9539ea`); whether to rewrite history is the owner's call.

### Open questions carried from 2026-09-23 (each a one-line change)

- **Published-catalogue reads.** Took the stricter reading: a brand user sees only its own brand; `anon` sees nothing.
- ~~**`price_egp`** hardcodes a currency~~: decided 2026-09-26, renamed to `price_amount` (PR #67).
- **Asset base kinds**: `source_model | render | image | document` is an assumption.
- **`vocabulary_registry` is readable by every signed-in user**, recorded as an accepted risk.
