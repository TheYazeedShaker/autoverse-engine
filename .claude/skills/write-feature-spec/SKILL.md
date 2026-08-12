---
name: write-feature-spec
description: Turn a requirement into a short, buildable Autoverse feature spec.
---

Produce a spec with exactly these sections, kept tight:

1. Goal — one sentence; which priority it serves.
2. Scope / Non-scope — bullet lists.
3. Surfaces touched — web / mobile / brand dash / autoverse dash / admin.
4. Data — tables read/written; new columns; new analytics events (names + props); RLS impact.
5. Flag — the PostHog flag name.
6. Acceptance criteria — testable bullets, including the relevant Definition-of-Done items.
7. Estimate — rough time, for the roadmap tracker.
   Save under docs/features/<slug>.md and link it from the docs portal.
