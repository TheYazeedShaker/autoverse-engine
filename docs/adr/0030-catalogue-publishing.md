# 0030 — the catalogue lives in Engine tables and is published to the configurator server

**Status:** accepted — 2026-11-21 (owner; `docs/merge-map/decisions.md` D3, D25, D27)

## Context

The configurator server stays where it is, and existing client iframe links keep working (owner decision). Today it reads its catalogue as files on the Nmesis repo's data branch, written by the Nmesis admin:

- a catalogue file of brands and models;
- one configurator config per car, with its registry and manifests.

The Engine admin's Catalog page replaces that admin. Nmesis keys everything by text slugs, the showcase by its own ids, and the Engine by uuids.

**What visitors see is whatever those files say**, so whoever can write them can change every client's configurator.

## Decision

1. **Engine tables are the truth.** These are `models`, `trims`, `trim_prices`, `option_assignments`, `assets` and `model_versions`, plus a new `configurator_configs` table: the configurator server's own document per model, brand-scoped, versioned and Zod-validated.
2. **A `publish-config` function** writes the configurator server's files from Engine tables:
   - **Same format, same location** as today, so the server is unchanged.
   - **Only an approved version is published**, by named roles at aal2 (ADR 0032).
   - **Built from database state only**, never from the request.
   - **Checked before writing.** The output is Zod-checked; every URL in it is on an allow-list of asset hosts; every path is canonicalised and on an allow-list; every slug matches `^[a-z0-9-]+$`.
   - **One commit per publish, never forced.** It updates the branch only from the expected parent commit, so a concurrent write (the Nmesis admin during dual-read) makes it retry instead of overwriting.
   - **Failure is safe.** Idempotent and retried with a timeout; a failure leaves the server's files as they were and raises an alert.
   - **Audited.** Each publish writes an audit row (ADR 0031) with the commit SHA and a content hash.
3. **The credential can do nothing but this.**
   - **Preferred:** move the catalogue files to a separate data-only repository the configurator server reads.
   - **Otherwise:**
     - a GitHub App with short-lived installation tokens (or a dedicated machine user), not a personal token, with **no** administration permission, so it can't edit the ruleset;
     - a repository ruleset that lets that identity push **only** the data branch, and blocks it from creating branches or pushing tags;
     - review required on every other branch, so a leaked secret can never reach the configurator server's code.
   - **Rulesets on a private repository need a paid GitHub plan.** Without one, the separate data-only repository is mandatory, not just preferred.
   - The secret is held by `publish-config` alone.
4. **A reconciliation job** compares the data branch with the last published hashes and alerts on any commit that `publish-config` did not make.
5. **Format compatibility is tested twice.**
   - A Zod schema of today's files is checked against a brand-free synthetic fixture in CI.
   - Before the first real publish, a dry run diffs its output against the live data branch. It is reviewed by the owner and must be empty except for intended changes.

   Real files never enter this repo (ADR 0008).

6. **A crosswalk, `public.legacy_ids`,** maps every Nmesis and showcase key (brand, model, trim, colour, interior, CDN prefix) to Engine ids.
   - Engine slugs start equal to the Nmesis slugs.
   - The ids in `ops.frame_keys` never change: the configurator server depends on them exactly.
7. **During dual-read** (`docs/merge-map/data.md` §6), a minute sync copies the Nmesis admin's writes into Engine tables. It stops at the catalogue's switch-over, when the Engine admin becomes the only writer.

## Alternatives considered

- **The configurator server reads the Engine database or an API.** Deferred, not rejected: it means changing the server, which stays as it is for now. A later project can switch it.
- **The files stay the truth, edited through the Nmesis backend.** Rejected: two catalogues.
- **A fine-grained personal token with contents write.** Rejected: it covers every branch of that repository, including the server's own code.

## Consequences

**Good**

- One catalogue, edited in one admin.
- The configurator server needs no change.

**Bad**

- The data branch becomes machine-written publish commits. The audit log is where "who changed what" lives (ADR 0031).
- A GitHub outage delays a publish; the configurator keeps serving the last good files.
- A new identity and ruleset to maintain (runbook H5).
- Later work: the configurator server could verify a signature on what it reads.
