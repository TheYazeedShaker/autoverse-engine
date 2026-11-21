# 0032 — staff auth, roles and the write path

**Status:** accepted — 2026-11-21 (owner; `docs/merge-map/decisions.md` D6, D7, D8). The owner also accepted the RPC as the boundary the same day.

## Context

With one database (ADR 0027), Nmesis staff already exist in its Supabase Auth, with mandatory TOTP. The role sets disagree:

- the Engine's enum: `superadmin`, `ops`, `content_editor`, `support`, `read_only`;
- the admin spec: superadmin, ops, content, finance, read_only;
- Nmesis: owner, ops, sales, finance and viewer, over ten areas;
- the approved System design shows different labels again.

The Engine's rule is that browsers never write tables, while the admin spec asks for writes under the staff session.

Today's Engine checks staff in two places, and both look only at `profiles.platform_role`:

- the RLS helpers (`app_auth.is_autoverse_staff()`, `can_manage_tenancy()`);
- the edge functions' `services/shared/staff.ts`, used by `validate-theme` and the job worker's manual run.

## Decision

### Who counts as staff

1. **The admin uses the same Supabase Auth**, through SSR cookies: password, emailed link or Google. Staff keep their passwords and TOTP factors.
2. **Staff means: a verified token, at aal2, with an active staff profile.** All three are checked in every place that decides:
   - **The database helpers** (`is_autoverse_staff`, `can_manage_tenancy`, and every new one) require `auth.jwt()->>'aal' = 'aal2'` and `profiles.active`.
     - They return `coalesce(..., false)`, so a missing claim is false, never NULL.
     - A missing `aal` is never treated as aal2.
     - Callers in plpgsql test `if helper() is not true then raise`.
   - **The edge functions:** one shared `requireStaff(jwt, area, action)` replaces `isTenancyManager`.
     - It reads verified claims (`auth.getClaims()` or a JWKS check), requires `aal === "aal2"`, an active profile and the role × area permission, and fails closed.
     - Every privileged function uses it.
   - **The admin app:** every route checks the same three. On the server it never trusts `getSession()`.
   - **Tests.** Staff fixtures carry `"aal": "aal2"`. Every staff policy, RPC and function is tested with an aal1 token, a missing `aal`, empty claims, an inactive profile, no profile, and a brand user.
3. **Switching someone off** sets `profiles.active = false` and revokes their sessions. Because the helpers check `active`, an access token that is still unexpired is refused at once.
4. **A profile is either staff or brand, never both.** A CHECK makes `platform_role` null or `brand_id` null.
5. **No staff profile is created on the Nmesis project before this lands** (DB-1, DB-2).
6. **During the dual-run, `accounts.staff` stays the one source of staff status.**
   - A trigger keeps `profiles` in step with it. **That trigger is a privilege path** (its writes arrive with server trust, past the profile guard), so:
     - it maps only through the fixed table in item 9, and an unknown role gives no staff role and an inactive profile;
     - it lives in `app_auth`, with EXECUTE revoked;
     - the Nmesis admin's own staff rules are checked against the guard's before DB-2 (no self-promotion; owner granted only by an owner).
   - When the System page takes over (A7b), the direction flips and `accounts.staff` becomes a view.
7. **The old emergency login** is not used by the Engine admin. It is retired **before Engine leads land (A8)**, not only at A27: its code path deleted. Its replacement is an owner-only procedure in the Supabase dashboard.

### Roles

8. **`platform_role`** is `superadmin`, `ops`, `finance`, `sales`, `content_editor`, `read_only`. `support` is kept until it is shown unused.
9. **Existing staff** map owner → superadmin, ops → ops, sales → sales, finance → finance, viewer → read_only.
10. **Permissions are a role × area table**, read by the helpers.
    - The areas are the ten in the Nmesis admin's permission table: overview, cars, leads, clients, plans, prices, finance, changes, settings and staff.
    - Every action declares its area, so a route shared by two areas can't widen either. Tested per action.
    - **Reads of personal data and money are area-aware too:** the lead tables and the finance tables use `app_auth.staff_may(area, 'r')`, not `is_autoverse_staff()`. Other reads stay open to every staff role.
    - Brand and market scope, and sign-off roles, come with Pipeline.

### Writes

11. **No table DML is granted to `authenticated`.**
    - DB-1 removes the existing write paths: `profiles_self_update`, the brands and profiles manager write policies, and their grants.
    - DB-1 restates the write pattern, as `20260921151103_rls_hardening.sql` did.
12. **The RPC is the security boundary.** Staff writes go through one typed SECURITY DEFINER RPC per resource, called under the user's JWT. Each RPC:
    - checks aal2, the active profile, role and area itself;
    - validates its arguments in SQL and rate-limits per `auth.uid()` (`app_auth.take_rate_limit`);
    - writes only an allow-list of columns, with no dynamic SQL built from argument names;
    - takes no actor, role, brand move or publish-state argument. `brand_id` is immutable by trigger, and publishing has its own function;
    - leaves the actor to the audit trigger, which reads `auth.uid()` (ADR 0031). It sets only the trace id, from `X-Trace-Id` validated by ADR 0013's pattern, with `set_config(..., true)`;
    - sets `search_path = ''` and qualifies every name;
    - has EXECUTE revoked from `public` and `anon`, and granted to `authenticated` only.
13. **`admin-mutate`** (A4b) is the admin's typed layer in front of the RPCs: Zod for clear messages, batching, the trace id. **It is not the boundary.** An aal2 staff token that calls an RPC directly gets the same checks.
14. **Privileged work gets its own function:** theme validation, key issuing, publishing, money, frame keys, and staff administration (`staff-admin`).
    - Each uses `requireStaff`, and holds the service role only inside the function.
    - **No anonymous caller can reach the service role** (production plan §3.1): `requireStaff` refuses before any service-role call, as `validate-theme` does today.
    - **`staff-admin` writes `profiles` only through the user-JWT RPC path**, so `guard_profile_privileges` sees the real caller. It uses the service role only for Auth admin calls (invite, sign out, reset a factor, delete).
    - Those calls follow the same rules: only a superadmin may act on a superadmin, and nobody on themselves. Tested with ops refused for each.
15. **The trust model is tightened in DB-1.**
    - `guard_profile_privileges` decides "manager" with `can_manage_tenancy()`, which is aal-aware.
    - `request_trust` treats a session with no role set as `server` only for `postgres` and `supabase_admin`.
16. **Deletes:**
    - Soft for 30 days, then purged by a job.
    - **Anything with leads or invoices is never purged: it is archived.** A purge would cascade into `leads` and `lead_activities`, which are never deleted.

## Alternatives considered

- **Fresh Engine accounts by invite.** Rejected: every staff member re-enrols TOTP for nothing.
- **Staff-write RLS policies with table DML.** Rejected: a staff token could write through PostgREST with no validation or rate limit.
- **`admin-mutate` as the only door**, with RPCs trusting it. Rejected: RPCs are reachable at `/rest/v1/rpc/*`, so the RPC has to defend itself.
- **One service-role function per mutation.** Rejected as the default: too many holders of the service role. It is kept for privileged work only.

## Consequences

- **The admin spec's "writes under the staff session with RLS"** becomes "writes under the staff JWT through RPCs that check themselves" (PR 0.3, D29).
- **Every resource needs its RPCs**, each tested per role, area and token state. Each page's DB PR adds them.
- **Changing the existing helpers** touches every staff policy and `services/shared/staff.ts` at once.
  - **DB-1** brings aal2 into the helpers, `requireStaff`, the write-path removals and the trust fixes, with a full isolation run and the function tests. Until DB-2, the helpers check aal2 only, and `requireStaff` uses today's manager rule (superadmin or ops) and refuses any area check, because the area table doesn't exist yet. DB-2 then adds `active` and the areas to both the helpers and `requireStaff`.
  - **DB-2** adds `profiles.active`, the role × area table and the area-aware reads, then creates the staff profiles.
- **Preview needs TOTP too.** Every Preview staff account needs a factor, and every SQL test fixture that fakes a staff JWT sets `aal`.
- **The RPC as the boundary** is this ADR's reading of D8, accepted by the owner on 2026-11-21. The alternative, a gateway secret (ADR 0013's pattern) that lets only `admin-mutate` call the RPCs, is not used.
