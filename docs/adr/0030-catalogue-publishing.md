# 0030 — the catalogue lives in Engine tables and is published to the configurator server

**Status:** accepted — 2026-11-21 (owner; `docs/merge-map/decisions.md` D3, D25, D27). The owner chose the separate data-only repository the same day (point 3).

## Context

The configurator server stays where it is, and existing client iframe links keep working (owner decision). Today it reads its catalogue as files on the Nmesis repo's data branch, written by the Nmesis admin:

- a catalogue file of brands and models;
- one configurator config per car, with its registry and manifests.

It reads those files once, at boot, into its own disk; the Nmesis admin writes through the server, which then copies each change to the branch.

The Engine admin's Catalog page replaces that admin. Nmesis keys everything by text slugs, the showcase by its own ids, and the Engine by uuids.

**What visitors see is whatever those files say**, so whoever can write them can change every client's configurator.

## Decision

1. **Engine tables are the truth.** These are `models`, `trims`, `trim_prices`, `option_assignments`, `assets` and `model_versions`, plus a new `configurator_configs` table: the configurator server's own document per model, brand-scoped, versioned and Zod-validated.
2. **A `publish-config` function** writes the configurator server's files from Engine tables:
   - **Same format and paths** as today, in the data-only repository (point 3), so the server's code reads them as it does now.
   - **The server re-reads on change, and checks what it reads.** It reads its files only at boot today, so a publish would reach visitors only after a restart. A change on that server, made before A11, has it poll the data branch's head about once a minute, with conditional requests.
     - It moves only on a fast-forward. When the head moves, it reads the whole tree at that commit into a staging copy.
     - It checks every file with the same checks `publish-config` applies before writing: the Zod schema, the asset-host and path allow-lists, and the slug pattern. A commit made with a leaked credential passes no other check, and every cross-boundary payload is checked on both sides.
     - It swaps the whole set at once.
     - On any failure, a rewritten history or a deleted branch, it keeps its whole last good set, logs and alerts.
   - **Only an approved version is published**, by named roles at aal2 (ADR 0032).
   - **Built from database state only**, never from the request.
   - **Checked before writing.** The output is Zod-checked; every URL in it is on an allow-list of asset hosts; every path is canonicalised and on an allow-list; every slug matches `^[a-z0-9-]+$`.
   - **It publishes only after the catalogue's switch-over**, once the Nmesis admin's catalogue writes are refused (D14, point 7). Until then the Engine reads, and the Nmesis admin is the only writer.
   - **One commit per publish, never forced.** It updates the branch only from the expected parent commit. A concurrent write then makes it retry instead of overwriting; that is a backstop, since the switch-over leaves one writer.
   - **Failure is safe.** Idempotent and retried with a timeout; a failure leaves the server's files as they were and raises an alert.
   - **Audited.** Each publish writes an audit row (ADR 0031) with the commit SHA and a content hash.
3. **The credential can do nothing but this: a separate data-only repository** (owner, D27).
   - **A private repository holds only the configurator server's data files**, copied from today's data branch: with its history only if that branch shares none with the server's code, otherwise files only (runbook H5). The server is pointed at it (a setting on that server).
   - **A GitHub App writes to it:**
     - only Contents (read and write) and Metadata (read);
     - installed on that repository alone;
     - short-lived installation tokens, each requested for that one repository with the fewest permissions (Contents read for the reconciliation job);
     - not a personal token or a machine user.
   - **The configurator server has its own credential for that repository alone:** a fine-grained token, never the one that reaches its code repository. It has Contents read and write while the Nmesis admin still writes the catalogue, and read only from the catalogue's switch-over, when the Nmesis admin's catalogue writes are refused (D14 step 2).
   - **Neither credential can reach the configurator server's code**, which lives in a repository neither one is scoped to. A leaked one could still change what visitors see. The server's checks (point 2) and point 4 stand in the way.
   - **Nothing relies on a paid GitHub feature**, such as rulesets or branch protection on a private repository. So Contents write also allows a force-push, a branch deletion or a tag; the server's fast-forward rule (point 2) covers that.
   - **The App's private key is a function secret, and function secrets are project-wide** (runbook H3): every function deployed to that project can read it. Before A11, every function deployed there is reviewed in this repo, or `publish-config` runs where only it holds the key.
4. **A reconciliation job** runs every few minutes. It matches each new commit on the data branch with the SHAs and content hashes in the publish audit (ADR 0031).
   - **Until the catalogue's switch-over**, the server's commits (the Nmesis admin's saves) are the only ones it accepts, each matched against the dual-read sync (point 7). Any other commit pages.
   - **After it**, any commit that `publish-config` didn't make pages.
   - The response is to re-publish the last approved version.
5. **Format compatibility is tested twice.**
   - A Zod schema of today's files is checked against a brand-free synthetic fixture in CI.
   - Before the first real publish, a dry run diffs its output against the live data branch. It is reviewed by the owner and must be empty except for intended changes.

   Real files never enter this repo (ADR 0008).

6. **A crosswalk, `public.legacy_ids`,** maps every Nmesis and showcase key (brand, model, trim, colour, interior, CDN prefix) to Engine ids.
   - Engine slugs start equal to the Nmesis slugs.
   - The ids in `ops.frame_keys` never change: the configurator server depends on them exactly.
7. **During dual-read** (`docs/merge-map/data.md` §6), a minute sync copies the Nmesis admin's writes into Engine tables. It stops at the catalogue's switch-over, when the Engine admin becomes the only writer.

## Alternatives considered

- **The configurator server reads the Engine database or an API.** Deferred, not rejected: it means a much larger change to the server, which stays as it is for now apart from re-reading on change. A later project can switch it.
- **The files stay the truth, edited through the Nmesis backend.** Rejected: two catalogues.
- **The existing data branch, held to the App by a repository ruleset.** Dropped (owner, D27): rulesets on a private repository need a paid GitHub plan.
- **A fine-grained personal token with contents write.** Rejected: it belongs to a person's account and lives long, while the App's installation tokens last an hour.
- **A reload endpoint on the configurator server**, called by `publish-config` after each commit. Rejected for now: it adds an inbound endpoint and a shared secret, to save about a minute.

## Consequences

**Good**

- One catalogue, edited in one admin.
- The configurator server keeps its code paths and its file format. It changes only where it reads (a setting) and when (re-reading on change, through the same checks as `publish-config`).

**Bad**

- The data branch becomes machine-written publish commits. The audit log is where "who changed what" lives (ADR 0031).
- A GitHub outage delays a publish; the configurator keeps serving the last good files.
- A new repository and App to maintain (runbook H5).
- The configurator server needs one change before A11: re-reading on change, with `publish-config`'s checks. It is made on that server, outside this repo, so the two copies of the checks must be kept in step (the CI fixture of point 5 serves both).
- A publish reaches visitors up to about a minute later.
- Later work: the configurator server could verify a signature on what it reads.
