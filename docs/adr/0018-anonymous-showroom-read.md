# 0018 — the showroom reads its catalogue through one anon-only database function

**Status:** accepted — 2026-09-26 (owner, `#build-decisions`, option A with four conditions)

## Context

The consumer showroom is rendered server-side for anonymous visitors (spec
`PAGE-CONSUMER-SHOWROOM` §3: catalogue data fetched server-side, published rows only). Under the
catalogue's RLS, `anon` reads nothing: the published-read policies are `to authenticated`, and
`brand_themes` and `assets` have no public read at all. Production plan §3.1 and ADR 0013 keep
the service-role key off anything an anonymous caller can reach, and the Next server is exactly
that. No governing document decided how the page reads (architect, Tier A → Tier B).

Options weighed: (A) one narrow SECURITY DEFINER read function for anon; (B) the service-role key
in the Next server, which breaks §3.1 in spirit; (C) `to anon` published-read policies on every
table, which reverses the recorded "anon sees nothing" and widens RLS everywhere; (D) a
service-role snapshot job, which adds a moving part and still needs a read path.

## Decision

**A.** `public.showroom_catalog(p_subdomain text) returns jsonb`, in migration
`20260926170000_showroom_catalog_read.sql`. It follows ADR 0013's pattern:

- `SECURITY DEFINER`, `search_path = ''`, every reference schema-qualified.
- EXECUTE revoked from PUBLIC, authenticated and service_role (Supabase's default grants), and
  **granted to anon only**. The consumer server calls it with the anon key.
- **Table RLS is unchanged.** anon still can't select from any table, so the function is anon's
  only path to catalogue data.
- One brand-market, by its subdomain (unique across brands), and only when the **brand is live and
  the market is live**. Otherwise it returns NULL, the same for unknown, dormant and not-live, so a
  caller can't probe which brands or markets exist.

The owner's four conditions:

1. **Only the columns the page renders.** Each object is built key by key (`jsonb_build_object`),
   never `row_to_json(*)`, so a new column never leaks by default. No brand id. Model and trim ids
   are included because the page joins trims to models and prices to trims, and a lead or event
   names them. Nothing from `brand_market_private` (lead routing emails, webhook). Test 0022
   asserts the exact key set of every object.
2. **Asset paths only for the public, published bucket.** The images decision keeps drafts and
   pre-launch renders in a private bucket and copies them to the public one at publish, because
   brands launch under embargo. To enforce that in the database rather than by convention,
   `assets` gains **`public_path`**, the object key of the public copy. The publish step (1·B) sets
   it and unpublish clears it. The function returns `public_path` only, never `storage_path`, and
   only for image kinds on the card (`side`) and hero (`front-34`) views of published models and
   trims. A null `public_path` is never returned. `public_path` must be a safe relative key (no
   scheme, no leading slash, no `..`), and is unique.
3. **Paired cross-tenant test** (`supabase/tests/0022_showroom_catalog_read.test.sql`), run as
   anon, exactly as the page calls it:
   - brand A's subdomain never contains brand B's rows or ids, and the reverse;
   - a dormant market, a brand that isn't live, and an unknown or mis-cased subdomain all return
     NULL;
   - drafts and other markets' prices never appear;
   - anon still can't read the tables;
   - authenticated can't execute the function.
4. This ADR.

Also in the migration: `brand_markets.subdomain` must be a lower-case DNS label, the same rule as
the consumer's host parser (`apps/consumer/lib/showroom/host.ts`). Before this it was only `text
unique`, so `Demo` and `demo` could coexist, and neither would match a real, lower-cased host.

**No gateway secret, unlike ADR 0013.** ADR 0013's functions write, so a direct call that skipped
the edge function's bot check was an abuse path. This function only reads live, published data
the page shows to anyone anyway, so a direct call with the public anon key learns nothing new. Its
cost is bounded to one brand-market's catalogue per call, and anon's statement timeout applies.
If direct calls ever become a load problem, the answer is an edge cache in front of the page, not
a secret.

## Consequences

- The consumer's database-backed `CatalogSource` calls this function and validates the result with
  a **strict** Zod schema (unknown keys refused). The payload omits brand ids, status and publish
  state by design (condition 1). So the loader's old per-row brand-id, status and publish-state
  checks are **removed, never satisfied with placeholder values**, which would look like isolation
  checks while checking nothing. Cross-brand mixing is impossible by construction: one call
  returns one document for one brand-market. What stays, as real second-layer checks:
  - the returned `market.subdomain` must equal the host's subdomain;
  - every trim's and asset's `model_id` is a returned model;
  - every price's and asset's `trim_id` is a returned trim.

  The revalidation interval ADR 0017 left open is set with that source.

- Card and hero images are `render`/`image` kinds only. Per-colour renders are left out: without
  their colour key the page couldn't choose one, and colour belongs to the configurator.
- **The `page_showroom` flag gates the page, not the data.** Anyone holding the public anon key can
  call this function directly and get what a live page would show. Hiding catalogue data means
  unpublishing it, or taking the brand or market off live. The flag is not an embargo control.
- Adding a column to the page means changing this function: deliberate, reviewed, and visible in
  test 0022's key sets.
- The publish pipeline (1·B) owns `public_path`:
  - at publish, copy the render to the public bucket;
  - at unpublish, delete the object as well as clearing the column;
  - use unguessable object keys (for example a content hash) under a brand prefix, because the
    embargo depends on an unpublished object not being in the public bucket at all. The function's
    publish-state filter is the database-side backstop; test 0022 covers a draft model that
    wrongly keeps a public copy. Until 1·B exists, `public_path` is set by hand or by seed,
    and the page shows its placeholder for any image without one.
- A hosted pre-check is needed once, before this migration: every existing
  `brand_markets.subdomain` must already be a lower-case DNS label (the query is in the PR).
