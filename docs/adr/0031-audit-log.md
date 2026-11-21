# 0031 — one audit log: `ops.audit_log`, extended and written by the database

**Status:** accepted — 2026-11-21 (owner; `docs/merge-map/decisions.md` D9)

## Context

`CLAUDE.md` requires an audit log on every sensitive mutation, and the admin spec requires every write to appear in it with before and after. The Engine has no audit table: only `lead_activities` for leads. The Nmesis admin writes `ops.audit_log` (`at`, `actor`, `action`, `target`, `details`) from about 65 places in its backend, and its "Changes" page reads it.

## Decision

1. **`ops.audit_log` is the one audit table.** It keeps its history and gains these columns:
   - `actor_id` (uuid, the staff user);
   - `entity_type` and `entity_id`;
   - `before` and `after` (jsonb);
   - `trace_id`.
2. **Append-only**, enforced by a trigger that refuses update, delete and truncate for every role, as `consent_texts` does.
3. **Written by the database.** Generic row triggers on every audited table record before and after.
4. **Who did it can't be forged:**
   - **The actor is `auth.uid()`**, read by the trigger.
   - **A setting (`app.actor_id`) is honoured only when `app_auth.request_trust()` says `server`** (jobs, migrations), and it is always set transaction-local (`set_config(..., true)`), because connections are pooled.
   - **The actor never comes from a header or an argument.**
   - **The trace id** is format-checked as in ADR 0013 (`^[A-Za-z0-9-]{8,64}$`), else dropped.
5. **What the payload holds: an allow-list, never a copy of the row.** The log can never be erased, so each audited table declares the columns its before and after **may** include.
   - **Never by value:** secrets, keys, hashes, Vault ids and wrapped keys.
   - **Personal data** (contact names and emails, alert recipients, invitations, members, profiles) is recorded only as "changed", never by value.
   - **Lead rows** are audited by `lead_activities`, not copied here.
   - **A phone reveal or a CSV export** records the act, not the data.
6. **Read by staff, through the `changes` area** (ADR 0032). That is wider than some source tables, which is why rule 5 holds. Export is audited too.

## Alternatives considered

- **A fresh `public.audit_entries`.** Rejected: it loses the Nmesis history or needs a copy.
- **Audit written by application code.** Rejected: one missed call site leaves a hole. Triggers can't be forgotten.

## Consequences

- Every audited write costs one extra insert. That is acceptable at admin volumes; bulk imports batch.
- Old Nmesis rows have no `before`/`after`, and the viewer shows them as they are.
- The Nmesis admin keeps writing its own rows until each area switches off. Both write the same table, labelled by source.
- A new audited table must declare its allow-list. A CI test fails if a column named like a key, secret, hash, Vault id, email or phone is on it by value.
- Whether the existing Nmesis rows (which hold staff names, and sometimes emails in `target`) may stay unerasable is a data question for the owner, raised with A2.
- A2 first confirms that the Nmesis backend only inserts into `ops.audit_log` (no update, delete or pruning), so the append-only trigger breaks nothing.
