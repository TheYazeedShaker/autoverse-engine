# BACKLOG

Ordered work queue. The agent takes the **first `queued` task whose dependencies are `done`** and only updates **Status**. Only the human adds, removes, or reorders tasks.

Status: `queued` · `in-progress` · `blocked` (reason required) · `done` · `awaiting-spec` (not startable; no spec exists yet)

| #   | Task ID                    | Spec                                                        | Depends on    | Status        | Notes                                                                                |
| --- | -------------------------- | ----------------------------------------------------------- | ------------- | ------------- | ------------------------------------------------------------------------------------ |
| 1   | ENGINE-CORE-1A             | specs/SPEC-engine-core-1A.md + REV-theming + REV2-hardening | 0-H merged    | done          | Slices 1–9, theming REV between 3 and 4                                              |
| 2   | AUTONOMOUS-LOOP-P1         | specs/SPEC-autonomous-loop.md (Part 1)                      | —             | in-progress   | Can run alongside #1; touches .claude/ → human-reviewed PR                           |
| 3   | AUTONOMOUS-LOOP-P2         | specs/SPEC-autonomous-loop.md (Part 2)                      | #1 phase gate | queued        | Runner, tiered auto-merge, digest                                                    |
| 4   | ENGINE-CORE-1B             | —                                                           | #1            | awaiting-spec | Pipeline: upload→render→content→publish, spec-sheet extraction, PostHog consent flow |
| 5   | STORYBOOK-TIER2            | —                                                           | #1            | awaiting-spec | Derived from page build specs' component inventory                                   |
| 6   | PAGE-CONSUMER-SHOWROOM     | —                                                           | #1, #5        | awaiting-spec | First page build spec                                                                |
| 7   | PAGE-CONSUMER-TRIM-DETAILS | —                                                           | #6            | awaiting-spec |                                                                                      |
| 8   | PAGE-CONSUMER-COMPARE      | —                                                           | #6            | awaiting-spec |                                                                                      |
| 9   | PAGE-CONSUMER-CONFIGURATOR | —                                                           | #6            | awaiting-spec |                                                                                      |
| 10  | ADMIN-PORTAL               | —                                                           | #1            | awaiting-spec | 9 pages                                                                              |
| 11  | BRAND-DASHBOARD            | —                                                           | #1            | awaiting-spec |                                                                                      |

## Blocked log

_(agent appends: date · task · reason · Slack thread link)_
