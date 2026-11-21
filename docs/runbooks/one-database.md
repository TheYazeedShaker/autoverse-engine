# Runbook — one database: bring the Engine into the Nmesis project (ADR 0027)

**Who:** the owner. Every step here is a hosted action; the agent can't run any of it.

**When:** after PR 0.2 merges, before A1 (DB-1).

**Order:** H1 → Before you start → H2 → H3 → H4 → Verify. Then _After A1_ once A1 merges, and H5 (the data-only repository) before A11.

**H1** is a private pre-step the owner already has. Do it first.

**Placeholders:**

- `<nmesis-ref>` is the Nmesis project's ref, and `<engine-ref>` the Engine's current project (Preview from H4 on).
- `$NMESIS_DB_URL` and `$ENGINE_DB_URL` are their connection strings.
- Never write a real ref, URL or count into this repo, `PROGRESS.md` included: record pass or fail only.

## Before you start

- **Backup.** Note the time of the Nmesis project's latest daily backup, and whether point-in-time recovery is on. Then take your own dump of the four schemas' data (`pg_dump "$NMESIS_DB_URL" -n accounts -n ops -n analytics -n brochures -f <path outside the repo>`), kept off the repo and off chat. It holds PII, payments and wrapped keys: keep it encrypted, and delete it when the rollback window closes.
- **Freeze.** Make no schema change from the Nmesis repo from H2 until A1 merges. A change in that window invalidates the baseline's dump.
- **Nothing in H2–H4 changes or moves an existing Nmesis object.** H4 only adds the Engine's schema; the rollback removes exactly that.
- **No staff profile is created on the Nmesis project in this runbook.** Profiles come with DB-2, after the aal2 rules of DB-1 (ADR 0032).

## H2 — inventory, exposure and the schema dump

1. **Inventory.** List every non-system schema and every object in the four schemas to adopt.
   - Compare it with the AI Studio's list in ADR 0027 (D30). Every object in `accounts` is either adopted or on that list; report any that is on neither to the A1 session.
   - Mark the key-handling functions; they are not committed to the baseline.

   ```sql
   select nspname from pg_namespace
   where nspname not like 'pg\_%' and nspname not in ('information_schema')
   order by 1;

   select n.nspname as schema, c.relname as name, c.relkind as kind
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('accounts', 'ops', 'analytics', 'brochures')
     and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
   order by 1, 2;

   select n.nspname as schema, p.proname as name,
          pg_get_function_identity_arguments(p.oid) as args,
          p.prosecdef as security_definer, p.proconfig as settings
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('accounts', 'ops', 'analytics', 'brochures')
   order by 1, 2;

   -- Types, policies, cron jobs, and every trigger on auth.users
   select n.nspname, t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
   where n.nspname in ('accounts', 'ops', 'analytics', 'brochures') and t.typtype in ('e', 'c', 'd');
   select schemaname, tablename, policyname, roles, cmd, qual, with_check from pg_policies
   where schemaname in ('accounts', 'ops', 'analytics', 'brochures', 'storage', 'public');
   select jobname, schedule, command from cron.job;
   select tgname from pg_trigger
   where tgrelid = 'auth.users'::regclass and not tgisinternal;
   ```

   **The AI Studio's access to the shared objects today** (ADR 0027, decision 10). A1 grants `studio_app`, by name, exactly what it can do in effect today (the `studio_app_*` columns), on the shared objects only. The ACL rows only show where each privilege comes from: A1 never copies another grantee's privileges to `studio_app`. On every other adopted object, `studio_app`'s access through PUBLIC ends. Save the output privately for the A1 session:

   ```sql
   -- The role, and its memberships both ways. Add the roles that the configurator server,
   -- the Nmesis backend and the Studio's migration runner connect as (ADR 0027, points 9 and 10).
   select rolname, rolcanlogin, rolsuper, rolbypassrls, rolinherit
   from pg_roles where rolname in ('studio_app');
   select r.rolname as role, m.rolname as member
   from pg_auth_members am
   join pg_roles r on r.oid = am.roleid join pg_roles m on m.oid = am.member
   where r.rolname = 'studio_app' or m.rolname = 'studio_app';
   -- Indirect membership too. The authenticator row also shows whether the Studio connects
   -- through the Data API.
   select v.r, pg_has_role(v.r::name, 'studio_app'::name, 'MEMBER') as is_member
   from (values ('anon'), ('authenticated'), ('authenticator')) v(r);

   select has_schema_privilege('studio_app', 'accounts', 'USAGE') as accounts_usage;

   -- What studio_app can do on the shared tables and view in effect: A1 grants exactly this
   select c.relname,
          has_table_privilege('studio_app', c.oid, 'SELECT') as studio_app_select,
          has_table_privilege('studio_app', c.oid, 'INSERT') as studio_app_insert,
          has_table_privilege('studio_app', c.oid, 'UPDATE') as studio_app_update,
          has_table_privilege('studio_app', c.oid, 'DELETE') as studio_app_delete
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'accounts' and c.relname in ('members', 'usage_ledger', 'cars', 'people');

   -- Where those privileges come from: exact grants on the shared tables and view
   -- (grantee PUBLIC shows as PUBLIC). Read only; never copy these to studio_app.
   select c.relname, coalesce(g.rolname, 'PUBLIC') as grantee, a.privilege_type
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   left join pg_roles g on g.oid = a.grantee
   where n.nspname = 'accounts' and c.relname in ('members', 'usage_ledger', 'cars', 'people')
   order by 1, 2, 3;

   -- Column-level grants on them, if any
   select c.relname, att.attname, att.attacl
   from pg_attribute att join pg_class c on c.oid = att.attrelid
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'accounts' and c.relname in ('members', 'usage_ledger', 'cars', 'people')
     and att.attacl is not null;

   -- Exact grants on the shared functions, and what studio_app can run in effect
   -- (A1 grants EXECUTE where studio_app_can_execute is true)
   select p.proname, pg_get_function_identity_arguments(p.oid) as args,
          coalesce(g.rolname, 'PUBLIC') as grantee,
          has_function_privilege('studio_app', p.oid, 'EXECUTE') as studio_app_can_execute
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   left join pg_roles g on g.oid = a.grantee
   where n.nspname = 'accounts' and p.proname in (
     'entitlements', 'credits_balance', 'record_usage', 'seats', 'save_member',
     'user_for_email', 'org_for_brand')
   order by 1, 2, 3;
   ```

   **What the Studio's objects depend on.** Anything adopted that they read and that isn't on the shared list goes to the A1 session, and to you, to join the list (ADR 0027, decision 10):

   ```sql
   -- Adopted relations that the Studio's views read
   select distinct v.relname as studio_view, dn.nspname as reads_schema, d.relname as reads
   from pg_rewrite rw
   join pg_class v on v.oid = rw.ev_class
   join pg_namespace vn on vn.oid = v.relnamespace
   join pg_depend dep on dep.objid = rw.oid
     and dep.classid = 'pg_rewrite'::regclass and dep.refclassid = 'pg_class'::regclass
   join pg_class d on d.oid = dep.refobjid
   join pg_namespace dn on dn.oid = d.relnamespace
   where (vn.nspname = 'studio' or (vn.nspname = 'accounts' and v.relname like 'studio\_%'))
     and d.oid <> v.oid
     and dn.nspname in ('accounts', 'ops', 'analytics', 'brochures', 'public')
   order by 1, 3;

   -- Adopted functions that the Studio's views call
   select distinct v.relname as studio_view, pn.nspname as calls_schema, p.proname as calls
   from pg_rewrite rw
   join pg_class v on v.oid = rw.ev_class
   join pg_namespace vn on vn.oid = v.relnamespace
   join pg_depend dep on dep.objid = rw.oid
     and dep.classid = 'pg_rewrite'::regclass and dep.refclassid = 'pg_proc'::regclass
   join pg_proc p on p.oid = dep.refobjid
   join pg_namespace pn on pn.oid = p.pronamespace
   where (vn.nspname = 'studio' or (vn.nspname = 'accounts' and v.relname like 'studio\_%'))
     and pn.nspname in ('accounts', 'ops', 'analytics', 'brochures', 'public')
   order by 1, 3;

   -- Studio functions whose bodies, or whose search_path, name an adopted schema: read each one
   select n.nspname, p.proname, p.proconfig
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where (n.nspname = 'studio' or (n.nspname = 'accounts' and p.proname like 'studio\_%'))
     and (p.prosrc ~ '(accounts|ops|analytics|brochures)\.'
          or coalesce(pg_get_function_sqlbody(p.oid), '') ~ '(accounts|ops|analytics|brochures)\.'
          or coalesce(array_to_string(p.proconfig, ','), '')
             ~ 'search_path=.*(accounts|ops|analytics|brochures|public)');

   -- Triggers on adopted tables that call a Studio function
   select n.nspname, c.relname, t.tgname, f.proname
   from pg_trigger t
   join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   join pg_proc f on f.oid = t.tgfoid join pg_namespace fn on fn.oid = f.pronamespace
   where not t.tgisinternal and n.nspname in ('accounts', 'ops', 'analytics', 'brochures')
     and (fn.nspname = 'studio' or f.proname like 'studio\_%');
   ```

   Also read the policies listed above for any that names a Studio role or function.

   **How the Studio connects.** Confirm from the Studio's code (every client it creates, and which key or JWT role each one uses) that it reaches `accounts` only as `studio_app`. API logs alone miss rare flows, such as invites. Note the role its migration runner uses. Tell the A1 session if any of these holds, since A1 stops there for you (ADR 0027, decision 10):

   - the Studio reaches an `accounts` object as `anon` or `authenticated`, directly or through a Studio function or view that runs as the caller;
   - `anon` or `authenticated` is a member of `studio_app`.

2. **Exposure.** Measure what `anon` and `authenticated` can reach today.
   - Every row is an exposure. **Nothing is revoked by hand:** A1's migration closes them, tested in CI, and the consumer app is pointed at this project only after that (_After A1_).
   - Rows for the AI Studio's own objects are listed too. A1 doesn't change them (D30); _After A1_ asks you to confirm each one.
   - Save the output privately for the A1 session.

   ```sql
   -- Schema usage
   select n.nspname, r.rolname
   from pg_namespace n cross join (values ('anon'), ('authenticated')) r(rolname)
   where n.nspname in ('accounts', 'ops', 'analytics', 'brochures', 'catalog', 'public', 'studio')
     and has_schema_privilege(r.rolname, n.oid, 'USAGE');

   -- Function EXECUTE
   select n.nspname, p.proname, r.rolname, p.prosecdef
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   cross join (values ('anon'), ('authenticated')) r(rolname)
   where n.nspname in ('accounts', 'ops', 'analytics', 'brochures', 'catalog', 'public', 'studio')
     and has_function_privilege(r.rolname, p.oid, 'EXECUTE');

   -- Table, view and column privileges, with RLS (tables) and security_invoker (views)
   select n.nspname, c.relname, c.relkind, r.rolname, c.relrowsecurity,
          coalesce(array_to_string(c.reloptions, ',') ~ '(^|,)security_invoker=(true|on|1|yes)(,|$)',
                   false) as security_invoker
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   cross join (values ('anon'), ('authenticated')) r(rolname)
   where n.nspname in ('accounts', 'ops', 'analytics', 'brochures', 'catalog', 'public', 'studio')
     and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and (has_any_column_privilege(r.rolname, c.oid, 'SELECT, INSERT, UPDATE')
          or has_table_privilege(r.rolname, c.oid, 'DELETE, TRUNCATE'));

   -- Sequences
   select n.nspname, c.relname, r.rolname
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   cross join (values ('anon'), ('authenticated')) r(rolname)
   where n.nspname in ('accounts', 'ops', 'analytics', 'brochures', 'catalog', 'public', 'studio')
     and c.relkind = 'S'
     and has_sequence_privilege(r.rolname, c.oid, 'USAGE, SELECT, UPDATE');

   -- Who calls each function today, so A1's revokes break nothing
   -- (needs track_functions = 'pl' or 'all'; otherwise read the API logs for /rest/v1/rpc/*)
   select schemaname, funcname, calls from pg_stat_user_functions
   where schemaname in ('accounts', 'ops', 'analytics', 'brochures', 'catalog')
   order by calls desc;
   ```

   Also note the Data API's exposed schemas (`public` must be one) and whether GraphQL is on (Dashboard → API settings).

3. **Sign-ups.** Dashboard → Authentication: sign-ups off, or confirmed as intended. Everyone who signs up becomes `authenticated` on the database that will hold the Engine's leads.

4. **The schema-only dump** the A1 baseline is generated from. Use `pg_dump` 17 (install the PostgreSQL 17 client tools), since `supabase db dump` needs Docker. Write it **outside the repo** (the OS temp folder) and hand it to the A1 session as a local file:

   ```bash
   pg_dump "$NMESIS_DB_URL" --schema-only -n accounts -n ops -n analytics -n brochures -f "${TMPDIR:-$TEMP}/nmesis-schema.sql"
   ```

   Before anything from it is committed:
   - the AI Studio's `accounts` objects are stripped by the ADR 0027 list, and a check fails if one is left;
   - its ACL lines are stripped;
   - it is scanned for secrets, infrastructure identifiers (hosts, URLs, bucket and CDN names, refs, emails) and real names;
   - the secret scan runs on the resulting baseline.

## H3 — pre-checks (each must return what it says)

```sql
-- 0. Postgres major version matches supabase/config.toml. Expect 17.
show server_version;

-- 1. No Engine table name is taken in public. Expect 0 rows.
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'brands','profiles','brand_markets','models','trims','trim_prices','vocabulary_registry',
  'option_assignments','spec_tabs','spec_groups','spec_rows','tier_modules','subscriptions',
  'invoices','brand_market_private','brand_themes','model_versions','assets','content_blocks',
  'banner_video','leads','lead_activities','events','event_dlq','lead_dlq','jobs',
  'brand_publishable_keys','consent_texts');

-- 2. No Engine type name is taken in public. Expect 0 rows.
select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typname in (
  'platform_role','brand_role','brand_status','tier_level','billing_state','publish_state',
  'efficiency_icon_kind','option_kind','spec_row_scope','invoice_status','asset_kind',
  'content_block_kind','lead_type','lead_status','activity_kind','job_status');

-- 3. No Engine function name is taken in public, including the three that the first two
--    migrations create and then move or drop. Expect 0 rows.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'current_brand_id','is_autoverse_staff','profiles_guard_privileged_cols',
  'capture_lead','capture_lead_public','ingest_events_public','claim_jobs','complete_job',
  'reap_expired_jobs','issue_publishable_key','enqueue_dlq_sweeps','reconciliation_report',
  'lead_routing','showroom_catalog');

-- 4. The Engine's helper schema doesn't exist yet. Expect 0 rows.
select nspname from pg_namespace where nspname = 'app_auth';

-- 5. Both extensions are available. Expect 2 rows; note whether pg_net is already installed.
select name, installed_version from pg_available_extensions where name in ('pg_cron', 'pg_net');

-- 6. No cron job name clashes. Expect neither 'job-worker' nor 'daily-reconciliation'.
select jobname from cron.job;

-- 7. No Engine Vault name is taken. Expect 0 rows. A stray job_worker_url would make pg_cron
--    send the cron secret to whatever URL it holds.
select name from vault.secrets
where name in ('capture_gateway_secret', 'job_worker_url', 'job_worker_cron_secret')
   or name like 'lead_webhook:%';

-- 8. The Engine's bucket name is free, and no storage policy spans every bucket. Expect 0 rows
--    from the first query; read the second for any policy without a bucket_id condition.
select id from storage.buckets where id = 'showroom-public';
select policyname, qual, with_check from pg_policies
where schemaname = 'storage' and tablename = 'objects';

-- 9. No Nmesis function would silently start resolving to the new public tables: functions in the
--    adopted schemas with no pinned search_path, or one that includes public. Read their bodies
--    for an unqualified Engine table name (leads, events, invoices, subscriptions, assets, jobs, ...).
select n.nspname, p.proname, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('accounts', 'ops', 'analytics', 'brochures')
  and (p.proconfig is null
       or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
       or exists (select 1 from unnest(p.proconfig) c
                  where c like 'search_path=%' and c like '%public%'));

-- 10. Migration history. Expect 0 rows, or only versions that exist in supabase/migrations/.
select version, name from supabase_migrations.schema_migrations order by version;

-- 11. The AI Studio's role exists. Expect 1 row.
select rolname from pg_roles where rolname = 'studio_app';

-- 12. The AI Studio's listed objects in accounts all exist (ADR 0027). Expect 17 rows; more only
--     if a function has overloads (list them for A1).
select p.proname as name, 'function' as kind
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'accounts' and p.proname in (
  'studio_accept_membership','studio_support_access','studio_team_check',
  'studio_team_invite','studio_team_remove','studio_team_set_role')
union all
select c.relname, 'view'
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'accounts' and c.relkind = 'v' and c.relname in (
  'studio_brands','studio_cars','studio_credit_packs','studio_live_cars','studio_memberships',
  'studio_organisations','studio_people','studio_price_book','studio_staff',
  'studio_team_changes','studio_usage');

-- 13. No studio_* object in accounts is missing from the list. Expect 0 rows. Any row joins the
--     list through an Engine PR before A1.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'accounts' and p.proname like 'studio\_%' and p.proname not in (
  'studio_accept_membership','studio_support_access','studio_team_check',
  'studio_team_invite','studio_team_remove','studio_team_set_role')
union all
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'accounts' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
  and c.relname like 'studio\_%' and c.relname not in (
  'studio_brands','studio_cars','studio_credit_packs','studio_live_cars','studio_memberships',
  'studio_organisations','studio_people','studio_price_book','studio_staff',
  'studio_team_changes','studio_usage');
```

**Function slugs and secrets** are shared by every function in a project, so check that none of the Engine's are taken:

```bash
supabase functions list --project-ref <nmesis-ref>   # expect none of: capture-lead, ingest-event, validate-theme, job-worker
supabase secrets list --project-ref <nmesis-ref>     # expect none of: TURNSTILE_SECRET_KEY, RESEND_API_KEY, LEAD_EMAIL_FROM,
                                                     #   CAPTURE_GATEWAY_SECRET, CLIENT_HASH_SECRET, JOB_WORKER_CRON_SECRET
```

- **If check 10 returns versions the repo doesn't have**, stop. The GitHub integration refuses a remote history it doesn't know. The usual fix is to mark those versions reverted in the history only (`supabase migration repair --db-url "$NMESIS_DB_URL" --status reverted <version>`), because the A1 baseline will carry their schema. Decide that with the agent before H4.
- **If check 9 finds a body that names an Engine table without a schema**, stop. That function is pinned in A1 before H4.
- **If any other check fails**, stop and report it.

Also confirm that **no other pipeline** applies migrations to the Nmesis project (for example from the Nmesis repo). If one does, it is disconnected in H4 step 1. The one exception is the AI Studio's own runner, bounded by ADR 0027 decision 10: note the role it runs as (H2).

## H4 — repoint

1. **Integration.** Connect this repo's `supabase/` to the Nmesis project, with production branch `main`.
   - Disconnect any other migration pipeline aimed at it, except the AI Studio's own (ADR 0027, decision 10).
   - Keep the Engine project receiving the same migrations, so Preview stays in step: either connect it as well, or run `supabase db push --db-url "$ENGINE_DB_URL"` after each merge.
   - Then trigger the apply with the integration's manual deploy, or by merging a PR (never a direct push to `main`). Confirm first that the integration reacts to a merge that doesn't touch `supabase/`. Watch all 27 migrations finish.
2. **Function secrets and Vault** on the Nmesis project:
   - **New random values** (`openssl rand -hex 32`) for `CAPTURE_GATEWAY_SECRET` (and the same value in Vault `capture_gateway_secret`), `CLIENT_HASH_SECRET` and `JOB_WORKER_CRON_SECRET` (and Vault `job_worker_cron_secret`), per `docs/runbooks/public-capture-rollout.md` §1 and `job-worker-secret-rotation.md`.
   - Vault `job_worker_url`: the Nmesis project's `job-worker` URL.
   - `TURNSTILE_SECRET_KEY`: the secret of the widget whose site key Production uses. A mismatch fails every lead, closed.
   - `RESEND_API_KEY`: a new Resend key. `LEAD_EMAIL_FROM`: the sender address.
   - Never copy a secret between projects.
3. **Deploy the four existing functions** to the Nmesis project, after their secrets (they fail closed without them): `capture-lead`, `ingest-event`, `validate-theme`, `job-worker`.
4. **Lead webhook secrets** (ADR 0012), only for brand-markets that have a webhook. Production has none yet.
5. **Storage.** Create the public bucket `showroom-public` with **no SELECT or list policy** on `storage.objects` (ADR 0020). Logos follow ADR 0024.
6. **Turnstile.** Hostnames are unchanged; the secret key is set in step 2.
7. **Vercel stays where it is for now.** Production and Preview both keep pointing at the Engine project until A1 has merged (_After A1_). H4 changes no permission on the live project.
8. **Demo tenant.** The demo seed stays on the Engine project (Preview). The Nmesis project starts with no brand.

## Verify

```sql
-- On the Nmesis project. Expect 7.
select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'brands','profiles','leads','events','jobs','consent_texts','brand_publishable_keys');

-- Expect 2 rows.
select jobname, schedule from cron.job where jobname in ('job-worker', 'daily-reconciliation');

select count(*) from public.brands;              -- expect 0 on the Nmesis project
select public.showroom_catalog('no-such-brand'); -- expect null

-- The worker is called every minute and answers 200 (an empty queue proves nothing by itself):
select status, start_time from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'job-worker')
order by start_time desc limit 3;
select status_code, created from net._http_response order by created desc limit 3;
```

- **CORS preflight**, for both `capture-lead` and `ingest-event`, answers `204` with the three `access-control-allow-*` headers. Use the exact command in `public-capture-rollout.md`.
- **The Nmesis side is unaffected:**
  - the configurator server's health endpoint answers;
  - the Nmesis admin's Overview loads;
  - new visitor events keep arriving: `select max(at) from analytics.events;` moves.

Record pass or fail and the date in `PROGRESS.md`, with no refs, URLs or counts.

## After A1 — point the consumer app at the Nmesis project

A1 (DB-1) closes the exposure H2 measured: its grant rules and asserting block, tested in CI (ADR 0027). Only after it has merged and applied:

1. **Re-run H2 step 2's queries.** They return only rows on A1's allow-list (the Engine's own anon functions in `public` among them), or rows for the AI Studio's own objects (ADR 0027, decision 10).
   - **For each Studio row, confirm with the Studio** that:
     - a table has RLS on, and no policy is true for a signed-in user in none of its organisations;
     - a view is `security_invoker`, or filters to the caller's organisations;
     - a SECURITY DEFINER function checks the caller itself.
   - Engine brand and staff users are `authenticated` here too, and the Studio never planned for them.
   - Save the confirmed list privately: the drift check alerts on any change from it.
   - If a row fails, stop here. The Studio fixes it, since the Engine leaves its objects alone.
2. **Point the Vercel production env vars** (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ASSET_BASE_URL`) at the Nmesis project, and redeploy. Preview stays on the Engine project.
3. **Re-run the verify block above**, and the showroom's own preview checks.
4. **Record pass or fail** in `PROGRESS.md`. The next PR marks ADR 0019 superseded and BACKLOG #13 done.

## Rollback (H4 only)

The Engine's objects are new and separate, so the rollback removes only them. Do it in this order:

1. **Stop the traffic first.**
   - If _After A1_ has run, point the Vercel production env vars back and redeploy.
   - Remove the four functions and their secrets.
2. **Stop if Engine tables hold data.** If `public.leads`, `public.lead_activities`, `public.lead_dlq` or `public.events` have rows, export them first: real leads may have arrived, and the dead-letter queue holds full lead payloads.
3. **Unschedule the Engine's cron jobs.** This form doesn't error if a job was never created:

   ```sql
   select cron.unschedule(jobid) from cron.job where jobname in ('job-worker', 'daily-reconciliation');
   ```

4. **Drop the Engine's objects explicitly, without `cascade`, in this order:**
   1. the `public` functions from H3 check 3 that exist (`claim_jobs` and `complete_job` return `public.jobs`, so they go before the tables);
   2. the 28 tables from check 1, in **one** `drop table` statement (their foreign keys to each other are resolved within it);
   3. the 16 types from check 2;
   4. every function in `app_auth`, and `app_auth.rate_limit_hits` (after the tables, whose CHECKs and triggers use them);
   5. `drop schema app_auth restrict;`.

   If a statement fails because something outside the Engine depends on it, stop and report it.

5. **Remove the rest:**
   - the Vault entries from H4 step 2;
   - the `showroom-public` bucket;
   - `pg_net`, only if H3 check 5 showed it was not installed before. Never drop `pg_cron`.
6. **Repair the history.** Mark the 27 migration rows reverted: `supabase migration repair --db-url "$NMESIS_DB_URL" --status reverted <version>`, for each. A later H4 then applies them again.
7. **Point the integration's production target back** at the Engine project.

Restoring the backup is the last resort: it would lose the configurator events written since the backup.

## H5 — the data-only repository for `publish-config` (before A11, ADR 0030)

The owner's choice (D27): a separate private repository that holds nothing but the configurator server's data files. Nothing here needs a paid GitHub feature.

1. **Create the repository.** A new private repository with no code and no other collaborators. In its settings, Actions are disabled, and there are no webhooks, deploy keys or other Apps.
   - **Copy the data branch** so that every file and path stays identical. The branch is the one in the server's `GITHUB_DATA_BRANCH`, or `data` if that isn't set.
   - **Copy its history only if it holds nothing but data files.** The server creates that branch from `main` when it is missing, so it may carry the server's whole code history, and any secret ever committed there. In a full clone of the Nmesis repo, list every path the branch's history ever touched: `git log --format= --name-only <branch> | sort -u`.
     - Only data-file paths: `git push <data repository> <branch>:<branch>`.
     - Any other path, or any error: copy the files only, as one first commit on a fresh branch of the same name.
   - Check first that nothing else reads the old data branch. Anything that does moves with it.
2. **The identity.** Create a GitHub App with only these repository permissions: **Contents: read and write**, **Metadata: read**. Its webhook is inactive. Install it on the data repository alone.
   - **Not** a personal token, and not installed on any other repository.
   - It has no administration permission, so it can't change the repository's settings.
3. **Where its key lives.** Store the App's private key as a secret of the `publish-config` function (the name is set in A11).
   - Function secrets are project-wide (H3), so every function deployed to that project can read it. Before A11, every function deployed there is reviewed in this repo, or `publish-config` runs where only it holds the key (ADR 0030 point 3).
   - `publish-config` requests an installation token for each publish, for the data repository alone, with the fewest permissions (Contents read for the reconciliation job). The token lasts an hour.
4. **Point the configurator server at it.** On that server's host, set `GITHUB_REPO` to the data repository, with the server's own credential for that repository alone: a fine-grained token, never the one that reaches the server's code repository.
   - The token has Contents read and write while the Nmesis admin still writes the catalogue. It becomes read-only at the catalogue's switch-over, when the Nmesis admin's catalogue writes are refused (D14 step 2).
   - When the rollback window closes, revoke the server's old token for the Nmesis repository.
   - Redeploy. Then check that the boot restore succeeded: the server's health endpoint reports the restore as done, and a configurator loads as before.
   - Keep the old data branch untouched, as a backup, until the catalogue's switch-over.
   - **Rollback:** set `GITHUB_REPO` back and redeploy. Nothing was deleted.
5. **Re-reading on change.** Today the server reads its data files only at boot, so a publish would reach visitors only after a restart. ADR 0030 point 2 has it re-read the data repository when the branch moves by a fast-forward, through the same checks `publish-config` applies, swapping the whole set at once. That change is made on that server, before A11.
6. **Rotation.** Rotate the App's key on the same schedule as the other function secrets. A publish with a revoked key fails closed: the configurator keeps its last good files, and an alert fires.
