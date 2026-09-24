# the Engine — Build Progress

> **Living document.** `CLAUDE.md` holds permanent standards. **This file changes every session** — read at session start, update at session end: fill _What Was Built Last Session_, refresh _Status_, append _Decisions_ / _Known Issues_, rewrite _Next Session — Start Here_ precisely.
>
> **This repository is public** ([ADR-0008](docs/adr/0008-public-repository.md)). Write this file as if a customer will read it: no credentials, no new infrastructure identifiers, nothing said about a vendor or a prospect.

**Last updated:** 2026-09-24 (evening)
**Last session:** Merged #24–#28, #30 and #31. All seven `#build-decisions` threads were answered and acted on. Both 1·A blockers are built and reviewed: **#34** (public capture on the anon key) and **#33** (job worker: scheduled, authenticated, routes leads). Merge #34 first, then #33. Hosted setup is the owner's (Next Session §3).

---

## THE PLAN (the only one)

**Autoverse** (company) builds **the Engine** (this repo) powering all products. **Phase 1:** the Engine + three apps serving five surfaces — `apps/consumer` (ONE app: Showroom / Brochure / Configurator behind per-brand entitlement gates), `apps/dashboard` (brand, tier-gated), `apps/admin` (operations). One brand, one model, end-to-end, production-hardened, multi-tenant + multi-market in structure. **Phase 2 (separate repo, later):** the Autoverse consumer platform product, built on the Engine's accumulated data. Governing docs in `docs/`; production plan v2.1 wins conflicts.

---

## Status

| Track                             | Status             | Notes                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENGINE-MIGRATION`                | ✅ Done 2026-08-12 | Spec archived in `specs/archive/`. Loop-proof merged (PR #1) and deployed to production. Two leftovers moved into 0-H: smoke test + flag exercise (0-H.6), old-repo archive (0-H.7).                                                              |
| Phase 0-H — Hardening             | ✅ On `main`       | All 7 groups landed on `main` via PR #10 (the stack had merged into its own branches first).                                                                                                                                                      |
| `ENGINE-CORE-1A` — Engine core    | 🟡 In progress     | BLOCK fixes #4–#6 merged (#26–#28), caller-auth foundation merged (#30). Both blockers built and reviewed: #34 (public capture) and #33 (worker), waiting on merge (#34 first) and the hosted setup. The gate passes with the worker in #33's CI. |
| `AUTONOMOUS-LOOP-P1`              | 🟡 In progress     | Backlog + architect (#24), permissions (#25). Escalation protocol and §7 rails in effect. Part 2 queued until 1·A closes.                                                                                                                         |
| Storybook / design system         | ⏸ Closed at Tier 1 | Tier 1 complete (9 primitives). Tier 2 superseded by `SPEC-storybook-tier2` (forthcoming). The three Storybook specs are marked do-not-execute.                                                                                                   |
| Phase 1·B — Pipeline & admin      | ⏳ Held            | 7-stage board, render orchestration, AI content w/ approval gate.                                                                                                                                                                                 |
| Phase 1·C — Consumer app          | ⏳ Held            | Design-first.                                                                                                                                                                                                                                     |
| Phase 1·D — Dashboard & hardening | ⏳ Held            |                                                                                                                                                                                                                                                   |

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

**Autonomous loop, Part 1** (`AUTONOMOUS-LOOP-P1`, in progress):

- `BACKLOG.md`, the `architect` subagent and the spec (#24).
- The escalation protocol is live: architect first, Tier B/C to `#build-decisions` (ADR 0009).
- The permission model: allow list, deny list and a fail-closed guard hook (#25, ADR 0010).
- The §7 safety rails apply from now on.

**Verified:** the Supabase check is green on `main`, and all ten migrations (the eight 1·A ones included) are on the hosted database. No edge function is deployed there yet.

**BLOCK bugs that needed no decision, fixed:**

- **#4** Events upsert: `ON CONFLICT DO NOTHING`, with a test of the request the code actually sends (#26).
- **#5** Job lease + reaper: a job whose worker dies comes back, and a late worker can't overwrite it (#27).
- **#6** Lead idempotency on `submission_id`: a replay is a no-op, and a reused key carrying a different person is refused (#28).

**Blocker 1, queue worker (#29, draft):**

- `services/job-worker` claims, runs and completes jobs under leases, and sweeps both DLQs.
- Dead letters are resolved rather than deleted, so the incident history stays.
- The phase gate no longer replays anything itself; the worker does, through the real store and API.
- Its first run caught a real mismatch: the gate's lead payload wasn't in the form capture-lead dead-letters. The worker refused it and paged. The gate is fixed; the rerun is in CI.

**Blocker 2, caller authorization, part 1 (#30):**

- Origin allowlist on `brand_markets`, per-brand publishable keys and a Postgres rate limiter.
- `resolve_public_caller` returns a brand only when the key, the origin and a live market all belong to that same brand.

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
- **Dead letters are resolved (`resolved_at`), never deleted.** `error_message` keeps the original cause; `last_error` holds the latest replay failure.

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

## ⛔ 1·A is BUILT but NOT READY TO SHIP — consolidated security review, 2026-09-23

> **Status 2026-09-24:**
>
> - **Merged:** #4 (#26), #5 (#27), #6 (#28), and the #1 groundwork (#30).
> - #2 and #3: the scheduled worker plus a worker-driven gate are in **#33**.
> - #1: enforcement on the anon key, with Turnstile and rate limits, is in **#34**.
> - #7–#9: open, not yet started.

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

`ENGINE-CORE-1A` stays **in-progress** until #34 and #33 are merged, the hosted setup below is done, and the gate passes with the worker (it does in #33's CI). Part 2 of the autonomous loop (runner, auto-merge, digest) stays queued until then.

### 1. `#build-decisions`: all seven threads answered (2026-09-24)

| Question                              | Answer                                                                                             | Where it landed                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Required checks                       | A: add `isolation`, `secrets`, `phase-gate`                                                        | **Not applied**. The agent's protection change was refused by the permission classifier; the owner runs it |
| Where the worker runs                 | A: pg_cron + pg_net → `job-worker` Edge Function, plus a daily reconciliation. ADR required        | #33, ADR 0011                                                                                              |
| Public functions and the service role | A: anon key + SECURITY DEFINER RPCs, with the owner's guardrails                                   | #34, ADR 0013                                                                                              |
| Worker auth / validate-theme roles    | A: cron shared secret, superadmin/ops JWT for "run now" and validate-theme. Rotation runbook       | #33                                                                                                        |
| Webhook signing                       | A: per-brand-market Vault secret, HMAC over `timestamp.body`, 5-minute replay window. ADR required | #33, ADR 0012                                                                                              |
| Email provider                        | Resend                                                                                             | #33                                                                                                        |
| Bot check                             | Cloudflare Turnstile                                                                               | #34                                                                                                        |

### 2. Open PRs, all against `main`

| PR  | What                                                                   | Tier  | State                                                                                                            |
| --- | ---------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------- |
| #32 | Remove `docs/ADMIN-DESIGN-BRIEF.md`, committed by mistake in `a9539ea` | human | CI green, code-review APPROVE. The file is still in history (public repo); rewriting history is the owner's call |
| #34 | Public capture on the anon key (blocker 2)                             | human | Both reviews addressed. **Merge first**                                                                          |
| #33 | Job worker: schedule, auth, Resend, signed webhooks (blocker 1)        | human | security-review BLOCK (migration order) and code-review items addressed. **Merge after #34**                     |

### 3. After merge: hosted setup (owner; the agent is denied hosted actions)

1. Protection: add the three required checks (thread answer A).
2. Edge secrets: `RESEND_API_KEY`, `LEAD_EMAIL_FROM`, `TURNSTILE_SECRET_KEY`, `CLIENT_HASH_SECRET`, `CAPTURE_GATEWAY_SECRET`, `JOB_WORKER_CRON_SECRET`.
3. Vault: `capture_gateway_secret` (= `CAPTURE_GATEWAY_SECRET`), `job_worker_url`, `job_worker_cron_secret` (= `JOB_WORKER_CRON_SECRET`). **Check `event_dlq` and `lead_dlq` are empty** before loading the two worker entries. They should be, since no edge function has ever been deployed.
4. Deploy `ingest-event`, `capture-lead`, `validate-theme` and `job-worker`. Follow `docs/runbooks/public-capture-rollout.md` for the order.
5. Then the agent: rerun the gate evidence, mark `ENGINE-CORE-1A` done in `BACKLOG.md`, and start `AUTONOMOUS-LOOP-P2`.

### Known follow-ups (not blocking)

- BLOCK #7 (`lead_activities` composite FK), #8 (`LeadRepository.create` bypasses `capture_lead`), #9 (event payload size; a Tier B question, not yet posted).
- When a `leads` CHECK constraint fails, Postgres logs the whole failing row (name, phone). `capture_lead` should raise its own messages before the insert.
- Leases can't be renewed. The worker handles one job per claim with a 25s timeout inside an 85s lease.
- The phase gate runs the worker via `run-once.ts`, not the scheduled pg_cron → Edge path. Test `0015` covers the schedule, and the first hosted run is the end-to-end proof.
- Regenerate `packages/engine-core/src/database.types.ts` once the migrations are applied, and run `docs/runbooks/flag-kill-path.md`.
- Pin `npm:@supabase/supabase-js` in the edge functions to the version the upsert test uses.

### Open questions carried from 2026-09-23 (each a one-line change)

- **Published-catalogue reads.** Took the stricter reading: a brand user sees only its own brand; `anon` sees nothing.
- **`price_egp`** hardcodes a currency while `brand_markets.currency` is per market.
- **Asset base kinds**: `source_model | render | image | document` is an assumption.
- **`vocabulary_registry` is readable by every signed-in user**, recorded as an accepted risk.
