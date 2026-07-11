import { describe, expect, it } from "vitest";
import { isEventKind, parseEventBatch } from "../src/schema";

describe("isEventKind", () => {
  it("accepts known kinds", () => {
    expect(isEventKind("active")).toBe(true);
    expect(isEventKind("heartbeat")).toBe(true);
  });
  it("rejects unknown values", () => {
    expect(isEventKind("busy")).toBe(false);
    expect(isEventKind(42)).toBe(false);
    expect(isEventKind(undefined)).toBe(false);
  });
});

describe("parseEventBatch", () => {
  it("parses a valid batch", () => {
    const batch = parseEventBatch({
      batch_seq: 7,
      events: [
        { ts: 1731412800000, kind: "active" },
        { ts: 1731416400000, kind: "idle" },
      ],
      machine: { hostname: "LAPTOP-1", os: "windows" },
    });
    expect(batch.batch_seq).toBe(7);
    expect(batch.events).toHaveLength(2);
    expect(batch.machine?.hostname).toBe("LAPTOP-1");
  });

  it("accepts an empty event list", () => {
    expect(parseEventBatch({ batch_seq: 0, events: [] }).events).toEqual([]);
  });

  // Fail-fast: malformed input must throw, never be coerced.
  it("rejects a negative batch_seq", () => {
    expect(() => parseEventBatch({ batch_seq: -1, events: [] })).toThrow();
  });
  it("rejects an invalid event kind", () => {
    expect(() =>
      parseEventBatch({ batch_seq: 1, events: [{ ts: 1, kind: "busy" }] }),
    ).toThrow(/kind/);
  });
  it("rejects a non-numeric ts", () => {
    expect(() =>
      parseEventBatch({ batch_seq: 1, events: [{ ts: "soon", kind: "active" }] }),
    ).toThrow(/ts/);
  });
  it("rejects a malformed machine descriptor", () => {
    expect(() =>
      parseEventBatch({ batch_seq: 1, events: [], machine: { hostname: "x" } }),
    ).toThrow(/machine/);
  });
});
