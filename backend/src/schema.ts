// Wire schema shared with the Rust daemon. Mirror of docs/wire-schema.md and
// daemon/crates/flexi-core/src/lib.rs — keep all three in sync.

export const EVENT_KINDS = [
  "active",
  "idle",
  "lock",
  "unlock",
  "login",
  "logout",
  "heartbeat",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export function isEventKind(value: unknown): value is EventKind {
  return typeof value === "string" && (EVENT_KINDS as readonly string[]).includes(value);
}

export interface ActivityEvent {
  /** Back-dated true transition time, unix epoch milliseconds (daemon clock). */
  ts: number;
  kind: EventKind;
}

export interface MachineDescriptor {
  hostname: string;
  os: string;
}

export interface EventBatch {
  /** Monotonic per-machine sequence for idempotent deduplication. */
  batch_seq: number;
  /** Events ordered by ts ascending. */
  events: ActivityEvent[];
  /** Sent on first contact or when the descriptor changes. */
  machine?: MachineDescriptor;
}

export interface IngestAck {
  ok: true;
  /** Echoes the accepted (or already-known) batch_seq. */
  batch_seq: number;
  /** True when this batch_seq was already recorded (idempotent no-op). */
  duplicate: boolean;
}

/**
 * Parse and validate an untrusted request body into an EventBatch.
 * Fail-fast: throws on anything malformed rather than coercing or guessing.
 */
export function parseEventBatch(body: unknown): EventBatch {
  if (typeof body !== "object" || body === null) {
    throw new Error("event batch must be an object");
  }
  const b = body as Record<string, unknown>;

  if (typeof b.batch_seq !== "number" || !Number.isInteger(b.batch_seq) || b.batch_seq < 0) {
    throw new Error("batch_seq must be a non-negative integer");
  }
  if (!Array.isArray(b.events)) {
    throw new Error("events must be an array");
  }

  const events: ActivityEvent[] = b.events.map((raw, i) => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`event[${i}] must be an object`);
    }
    const e = raw as Record<string, unknown>;
    if (typeof e.ts !== "number" || !Number.isFinite(e.ts)) {
      throw new Error(`event[${i}].ts must be a finite number`);
    }
    if (!isEventKind(e.kind)) {
      throw new Error(`event[${i}].kind is not a valid EventKind`);
    }
    return { ts: e.ts, kind: e.kind };
  });

  let machine: MachineDescriptor | undefined;
  if (b.machine !== undefined) {
    if (typeof b.machine !== "object" || b.machine === null) {
      throw new Error("machine must be an object when present");
    }
    const m = b.machine as Record<string, unknown>;
    if (typeof m.hostname !== "string" || typeof m.os !== "string") {
      throw new Error("machine.hostname and machine.os must be strings");
    }
    machine = { hostname: m.hostname, os: m.os };
  }

  return { batch_seq: b.batch_seq, events, machine };
}
