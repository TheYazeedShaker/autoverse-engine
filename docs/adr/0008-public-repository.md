# 0008 — the Engine repository is public

**Status:** accepted — 2026-08-12

## Context

`specs/archive/SPEC-engine-migration.md` step 1 called for a private GitHub repository. During the migration
the repo was created public, and the owner chose to keep it that way.

Before the decision was confirmed, a security review of the published content found that the repo
carries more than code:

- `docs/autoverse-hosting-decision.html` — the full vendor cost model: per-CCU input costs, break-even
  thresholds, a six-vendor price comparison at three concurrency scenarios, and the negotiating
  posture. It also records the assessment that StreamPixel's pricing "may reflect GPU
  oversubscription" and that they publish no uptime SLA — about a current supplier.
- `docs/autoverse-journey-blueprint.html` — the SKU matrix, which surface is mandatory in every deal,
  the tier-gating levers, and the retroactive-history upsell.
- `docs/autoverse-production-plan.html`, `docs/engine-architecture.html` — the engineering contract,
  asset path conventions, SLO and alert thresholds, and the statement that the service-role key exists
  in exactly two runtimes.
- `PROGRESS.md` — the live Supabase project ref, the Slack channel ID and a message permalink, and a
  dated list of which merge-wall gates are not yet enforced.
- `packages/types/src/index.ts` — a real manufacturer and model used as example identifier values.

No credentials are exposed. Every commit and blob was checked: `.env.example` holds variable names
only, `.claude/settings.local.json` is gitignored, and no MCP config is committed.

The original rationale for public was cost. That premise is inaccurate — GitHub's Free plan includes
unlimited private repositories with unlimited collaborators, so a private repo is free. The only
material difference is CI: Actions minutes are unlimited on public repos and capped at 2,000/month on
private ones, which this repo's CI would use a small fraction of.

The owner was shown all of the above, including the corrected cost premise, and chose to stay public.

## Decision

**The repository is public.** The commercial and operational exposure above is accepted, knowingly.

Anything already pushed is treated as **disclosed and unrecoverable** — the Supabase project ref
`drkiapqwlqomysekxstd`, the Slack channel ID, the vendor commentary, and the packaging model. Deleting
or rewriting history does not undo publication, so no redaction effort will be spent pretending
otherwise.

## Alternatives considered

- **Make it private.** Free, immediate, and nothing else in the build changes. Rejected by the owner.
- **Stay public, move `docs/` and `PROGRESS.md` to a private repo.** Requires a history rewrite and
  still leaves the infrastructure identifiers disclosed — more work for a weaker result. Rejected.

## Consequences

**Good**

- Unlimited Actions minutes; no plan constraint on CI as the merge wall grows.
- Zero friction for previews, integrations, and any future outside contributor.

**Bad — and these are now standing obligations, not one-off cleanups**

- Competitors can derive the gross margin on the configurator SKU; customers can read the upsell
  strategy before negotiating. Vendors can read how they were ranked and what was said about them.
- `PROGRESS.md` is a published document. It must stop carrying live infrastructure identifiers,
  security-gate status, and anything said about a vendor or a prospect. Write it as if a customer
  will read it, because one can.
- Secret hygiene is now the load-bearing control, and it is currently weak (see below). A public repo
  with a non-functioning secret scan is one `git commit -am` away from a service-role key leak.
- Fork pull requests can run CI. The workflow needs a `permissions:` block and outside-collaborator
  approval must stay on.
- New identifiers (project refs, channel IDs, prospect names) must be treated as publication events
  from here on, not as internal notes.

## Follow-up required by this decision

Tracked in `PROGRESS.md` under Known Issues; none are blocking the migration itself.

1. Widen `.gitignore` — it covers `.env`, `.env.local`, `.env*.local` but not `.env.production`,
   `.env.staging`, `supabase/.env`, `.envrc`, `*.pem`, `*.key`.
2. Make the secret scan real. Today `.claude/hooks/secret-scan.sh` is wired only as a Claude
   `PreToolUse` hook on `Bash`: it does not guard the owner's own `git commit`, `git commit -am`
   bypasses it because it reads `git diff --cached`, and CI has no secret-scan step at all.
3. Add `permissions: contents: read` to `.github/workflows/ci.yml`; consider `--ignore-scripts` on
   install and SHA-pinned actions.
4. Replace the real manufacturer/model example values in `packages/types/src/index.ts` with
   obviously-fictional ones.
