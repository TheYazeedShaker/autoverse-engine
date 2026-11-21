# Build Spec — Brand Dashboard (client app)

**Task ID:** `APP-BRAND-DASHBOARD`
**Depends on:** slice 9 (event capture) for analytics data; leads and lead activities (done); the adopted `accounts` plans and features (D13, `docs/merge-map/data.md` §5.3); the admin port (`docs/merge-map/order.md`, track E).
**Design source (read-only):** `design-approved/dashboard/*.dc.html` (owner copies them in, neutral names).
**Standing rules:** A (design wins on visuals), B (visual self-check), C (few PRs).

## Approach

Same resource-registry pattern as the admin portal where screens are lists/forms; custom screens for the journey map and analytics. Plain language, friendly density, car images as anchors, per the design.

## Security (non-negotiable)

- Brand users sign in; every query runs with their session under RLS, scoped to **their brand only**. Extend the isolation test: a brand user can never read another brand's leads, events, invoices or analytics.
- No PII in analytics views; lead PII only on the lead screens, for roles allowed to see it.
- Tier gating is enforced **server-side**, from `accounts.entitlements()` (the organisation's plan and features, D13) instead of `tier_modules`, not only hidden in the UI. Locked modules render the design's locked preview with no real data sent to the browser.
- Plan names come from `accounts.plans` (Starter / Growth / Enterprise, D13); the design's labels are sample copy.

## Phase 1

1. **Login + shell + Overview:** KPIs, models strip, mini funnel, latest leads, insights (from real data).
2. **Leads + lead profile:** list with filters/export; the lead page with journey map, timeline scrubber, step details (derived only from captured events), score breakdown, activity log and notes (append-only), CTA actions logging activities.
3. **Settings:** team invites and roles, lead notification settings, lead routing (edits go through a function with the same rules as admin).

## Phase 2

Analytics (funnel incl. trim stage, trim performance, colour interest, comparisons), Models detail, Plan & Billing (plans and features, upgrade request flow, invoices), Reports, Guide, Support.

## Acceptance

- [ ] Visual self-check against the design for each screen.
- [ ] Cross-brand isolation tests for every dashboard data source.
- [ ] Locked modules send no locked data to the browser.
- [ ] A test lead submitted on the showroom appears in the dashboard with its journey within a minute.
