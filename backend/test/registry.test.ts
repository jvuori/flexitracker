import { describe, expect, it } from "vitest";
import { partitionByLedgerRole, type MachineRole } from "../src/registry";

describe("partitionByLedgerRole", () => {
  it("buckets each machine under its assigned role", () => {
    const roles = new Map<string, MachineRole>([
      ["m1", "work"],
      ["m2", "personal"],
      ["m3", "work"],
    ]);
    expect(partitionByLedgerRole(["m1", "m2", "m3"], roles)).toEqual({
      work: ["m1", "m3"],
      personal: ["m2"],
    });
  });

  it("defaults an unknown/unassigned role to work, never personal", () => {
    // The safe default: an ingest race between a fresh Machine row and its
    // first events must never silently inflate a personal total.
    const roles = new Map<string, MachineRole>();
    expect(partitionByLedgerRole(["m1"], roles)).toEqual({ work: ["m1"], personal: [] });
  });

  it("returns empty buckets for an empty machine list", () => {
    expect(partitionByLedgerRole([], new Map())).toEqual({ work: [], personal: [] });
  });

  it("keeps a ledger's bucket empty when no machine holds that role — the toggle-visibility signal", () => {
    const roles = new Map<string, MachineRole>([["m1", "work"]]);
    const result = partitionByLedgerRole(["m1"], roles);
    expect(result.personal).toEqual([]);
    expect(result.work).toEqual(["m1"]);
  });
});
