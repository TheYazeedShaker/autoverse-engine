# 0029 — one configurator protocol: the `nmesis:*` wire, mapped from the Engine's typed protocol

**Status:** accepted — 2026-11-21 (owner; `docs/merge-map/decisions.md` D19). The owner also accepted point 4 the same day: commands only from listed hosts, and view-only with an empty list.

## Context

There are two protocols today:

- **The Engine's**, in `packages/types`. `ConfiguratorCommand` and `ConfiguratorSignal` carry `source: "autoverse"` / `"nmesis-configurator"` and `version: "1"`. The production plan calls this protocol v1.1, and §5.1 sets its rules: every command has a deadline; malformed messages are dropped, counted and alerted on; an unsupported version shows the fallback; origins are locked both ways.
  - Commands: `init`, `set_option`, `apply_config`, `set_view`, `set_lighting`, `play_feature`, `preload`, `request_snapshot`, `reset`.
  - Signals: `ready`, `state_applied`, `loading`, `error`, `canvas_interaction`, `session`, `snapshot`.
- **The showcase's embed**, which speaks another:
  - parent → iframe: `{ type: "nmesis:command", id, command, args }`;
  - iframe → parent: `{ type: "nmesis:result", id, ok, result?, error?, state }`, `{ type: "nmesis:event", event, detail }` and `{ type: "nmesis:hello", version, commands, events }`;
  - 17 engine methods as commands and 10 events.

The Engine's embed route carries the showcase's embed over (ADR 0028).

## Decision

1. **The wire stays `nmesis:*`.**
2. **The Engine keeps one typed protocol.** An adapter in `packages/types` maps it onto the wire. Each command is sent with an `id`, and its `state_applied` or `error` signal comes from the matching `nmesis:result` (`ok` true or false), within the command's deadline. It never comes from a `change` event, which also fires on drags.

   | Engine command     | `nmesis:*`                                                                                                                                                                                                                    |
   | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `init`             | Waits for `hello`, then runs the `apply_config` mapping. `lang` is passed as the embed URL's `lang` parameter. `mode: "pixel"` is not this adapter: it is the Enhanced iframe to the configurator server (`decisions.md` D17) |
   | `set_option`       | exterior_color → `setColour`; interior_color → `setInterior`; trim → `setTrim`; lighting `day`/`night` → `setDayNight`. Wheels, and any other lighting value, are refused with an `error` (the engine has neither)            |
   | `apply_config`     | The `set_option` mapping, in the order trim → colour → interior → lighting. `price` and `currency` are the page's own and are not sent                                                                                        |
   | `set_view`         | `setView`                                                                                                                                                                                                                     |
   | `set_lighting`     | As `set_option` lighting                                                                                                                                                                                                      |
   | `play_feature`     | `preloadInteraction`, then `playInteraction`                                                                                                                                                                                  |
   | `preload`          | Acknowledged with `state_applied` and nothing sent: the engine prewarms a trim's colours itself, and `ConfigState` carries no feature ids                                                                                     |
   | `request_snapshot` | Refused with an `error` (`snapshot_unsupported`). The image-sequence engine has no image snapshot; the current state is always in each result's `state`                                                                       |
   | `reset`            | `setTrim`, `setColour`, `setInterior` back to the manifest's defaults, then `setFrame(0)`                                                                                                                                     |

   | Engine signal        | From                                                                                 |
   | -------------------- | ------------------------------------------------------------------------------------ |
   | `ready`              | `nmesis:hello` (version checked) and the `ready` event                               |
   | `state_applied`      | `nmesis:result` with `ok: true`, by `id`                                             |
   | `error`              | `nmesis:result` with `ok: false`, by `id`, or the `error` event                      |
   | `loading`            | the `progress` event                                                                 |
   | `canvas_interaction` | the `interaction`, `frame` and `view` events                                         |
   | `session`            | not emitted (there is no streaming session); the page records its own journey events |
   | `snapshot`           | never emitted                                                                        |

3. **Validation (§5.1).** Both sides are Zod-validated. A malformed or unknown message is dropped, counted and alerted on, never thrown. A `hello` with an unsupported version shows the page's fallback (the poster and the static renders).
4. **Origins are locked both ways, never `*`.**
   - The Engine page posts to, and accepts from, only the embed's origin and window.
   - The embed accepts commands only from `window.parent` (it checks `event.source === window.parent` as well as `event.origin`), and only when the parent's origin is on the brand's allowed-host list (`embed_hosts`). The match is exact on scheme, host and port: never a suffix, a substring or a wildcard. It posts only to that origin.
   - With no list for the brand, the embed is view-only: it shows the car, takes no command and posts nothing.
   - No message carries personal data or a key.
5. **Naming and the contract test.**
   - **This ADR names the mapped protocol v1.2.** The envelope's `version` moves from `"1"` to `"1.2"` with the adapter (track C, PR C2).
   - The contract test (the merge wall's contract gate) replays a recorded, brand-free fixture of today's messages through the adapter, both ways.

## Alternatives considered

- **Move the embed to the Engine protocol.** Rejected: it breaks whatever uses the embed today, for no gain.
- **Two protocols with no adapter.** Rejected: the Engine pages would need to know both.

## Consequences

- **Wheels, image snapshots and streaming sessions** are not available through the image-sequence engine. The adapter says so with an `error`, never silently.
- **`ConfiguratorSignal`'s `snapshot` variant** stays in the type for the streaming mode, but is never emitted by this adapter.
- **The embed now needs an allowed-host list to talk to its parent.** Before it is filled, an embed still shows the car, but can't be driven.
- **A future wire change** means a new adapter version and a fixture update, both covered by the contract test.
