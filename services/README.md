# services/

Edge functions — the only writers to the database from the outside world. Browsers never
write directly to tables (`CLAUDE.md`, "Data & tenancy").

Planned for Phase 1 (each arrives with its own spec, none built during `ENGINE-MIGRATION`):

| Service               | Responsibility                                                                         |
| --------------------- | -------------------------------------------------------------------------------------- |
| `event-ingest`        | validated, rate-limited event intake; idempotent `event_id`, DLQ, daily reconciliation |
| `leads`               | synchronous, acknowledged lead capture; any failure pages                              |
| `upload-watcher`      | reacts to the upload event (3D file + `manifest.yaml`) — the Engine's boundary         |
| `render-orchestrator` | job queue to the in-house Unreal render farm, scoped bucket key only                   |
| `content-generation`  | reference-conditioned image/video + copy blocks, behind the approval gate              |

Every service: Zod-validated payloads on both sides, timeout + retry policy (idempotent only),
a defined degraded mode, structured JSON logging with one trace ID, and at least one alert.
