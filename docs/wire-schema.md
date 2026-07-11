# Wire schema (daemon ↔ backend)

Single source of truth for the payload exchanged between the Rust daemon and the
Cloudflare Worker. Kept in sync by hand in two places:

- TypeScript: `backend/src/schema.ts`
- Rust: `daemon/crates/flexi-core/src/lib.rs`

Any change here MUST be applied to both. The payload is intentionally tiny.

## Authentication

The per-machine **access key** travels in the `Authorization: Bearer <key>`
header — never in the body, never in a URL. The backend resolves the key to
`(account_id, machine_id)` via the global registry. The daemon therefore does
not send `account_id` or `machine_id` in the body; they are implied by the key.

## `POST /ingest`

Request body (`EventBatch`):

```jsonc
{
  "batch_seq": 42,            // monotonic per machine; used for idempotent dedupe
  "events": [                 // 0..N events, ordered by ts ascending
    { "ts": 1731412800000, "kind": "active" },
    { "ts": 1731416400000, "kind": "idle" }
  ],
  "machine": {               // OPTIONAL: sent on first contact / when it changes
    "hostname": "LAPTOP-1",
    "os": "windows"
  }
}
```

Response body (`IngestAck`):

```jsonc
{ "ok": true, "batch_seq": 42, "duplicate": false }
```

`duplicate: true` means this `batch_seq` was already recorded for this machine;
the request is acknowledged as a no-op (idempotency — see event-ingestion spec).

## Fields

### `ActivityEvent`
| field  | type   | notes |
|--------|--------|-------|
| `ts`   | number | Back-dated true transition time, unix epoch **milliseconds**, daemon clock. The backend also records its own `received_at` (trust boundary). |
| `kind` | string | One of the `EventKind` values below. |

### `EventKind`
`active` · `idle` · `lock` · `unlock` · `login` · `logout` · `heartbeat`

- `active` / `idle`: debounced, back-dated presence transitions.
- `lock` / `unlock` / `login` / `logout`: session-state transitions.
- `heartbeat`: periodic liveness while active, to bound crash/sleep damage.

### `MachineDescriptor`
| field      | type   | notes |
|------------|--------|-------|
| `hostname` | string | Human-readable machine name (display only). |
| `os`       | string | e.g. `windows`, `linux`. |

## Timestamps

All timestamps are UTC epoch milliseconds. Day/week boundaries and rules are
evaluated in the account timezone by the backend — never derived from the wire
values' local interpretation.
