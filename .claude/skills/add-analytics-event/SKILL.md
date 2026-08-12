---
name: add-analytics-event
description: Add a first-party analytics event end-to-end, keeping the tracking plan coherent.
---

Use the product-tracking skills (instrument-new-feature) so the plan stays coherent.

1. Define the event name + props; add/extend the type in @autoverse/types (AnalyticsEvent usage).
2. Fire it from the relevant first-party control (our UI), not the configurator, unless it is a
   genuine in-canvas signal.
3. Ensure it lands in BOTH PostHog and the raw `events` table, tagged with brand/model/platform/session.
4. Document it (purpose, props, who can read it) in the docs portal data section.
