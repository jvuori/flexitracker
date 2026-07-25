import { describe, expect, it } from "vitest";
import { CLASSIFY_HELPERS_SRC } from "../src/ui/client-helpers";
import { renderApp } from "../src/ui/render";

// Same pattern as client-helpers.test.ts: the browser client is a plain string,
// so evaluating that same source here exercises exactly what ships.
type Period = { type: string; start: number; end: number };
type Op =
  | { op: "del" }
  | { op: "add"; ledger: string }
  | { op: "remove"; ledger: string }
  | { op: "move"; from: string };

const h = new Function(
  `${CLASSIFY_HELPERS_SRC}; return { countsNow, receiptSums, round30, dec30, transcriptionRows, classifyPlan };`,
)() as {
  countsNow: (p: Period) => boolean;
  receiptSums: (p: Period[]) => Record<string, number>;
  round30: (ms: number) => number;
  dec30: (ms: number) => string;
  transcriptionRows: (
    days: { workedMs: number }[],
    names: string[],
  ) => { rows: [string, string][]; total: string; tsv: string };
  classifyPlan: (p: Period, target: string, ledger: string) => Op[];
};

const M = 60_000;
const H = 3_600_000;
const per = (type: string, start: number, end: number): Period => ({ type, start, end });

describe("receiptSums", () => {
  it("sums each additive source separately", () => {
    const periods = [
      per("sensor", 0, 38 * M),
      per("auto_bridged", 38 * M, 56 * M),
      per("sensor", 56 * M, 56 * M + 2 * H),
      per("manual_added", 4 * H, 5 * H),
      per("gap", 6 * H, 7 * H),
      per("review", 7 * H, 9 * H),
      per("removed", 9 * H, 10 * H),
    ];
    expect(h.receiptSums(periods)).toEqual({
      sensor: 38 * M + 2 * H,
      auto_bridged: 18 * M,
      manual_added: 1 * H,
    });
  });

  it("reports zero for a source the day has none of, rather than omitting it", () => {
    // The receipt renders a placeholder row for a zero component so its shape
    // does not shift between days — that relies on the key still being present.
    expect(h.receiptSums([per("sensor", 0, H)])).toEqual({
      sensor: H,
      auto_bridged: 0,
      manual_added: 0,
    });
  });

  it("ignores non-counting periods entirely", () => {
    expect(h.receiptSums([per("gap", 0, H), per("review", H, 2 * H), per("removed", 2 * H, 3 * H)])).toEqual({
      sensor: 0,
      auto_bridged: 0,
      manual_added: 0,
    });
  });
});

describe("rounding is confined to transcription", () => {
  it("rounds to the nearest half hour", () => {
    expect(h.round30(7 * H + 46 * M)).toBe(8 * H);
    expect(h.round30(7 * H + 44 * M)).toBe(7 * H + 30 * M);
    expect(h.round30(0)).toBe(0);
  });

  it("renders decimal hours, the form timesheet systems take", () => {
    expect(h.dec30(7 * H + 46 * M)).toBe("8.0");
    expect(h.dec30(7 * H + 44 * M)).toBe("7.5");
    expect(h.dec30(4 * H)).toBe("4.0");
  });
});

describe("transcriptionRows", () => {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  it("lists only days with working time", () => {
    const days = [
      { workedMs: 8 * H },
      { workedMs: 7 * H + 46 * M },
      { workedMs: 0 },
      { workedMs: 7 * H + 44 * M },
      { workedMs: 4 * H },
      { workedMs: 0 },
      { workedMs: 0 },
    ];
    const t = h.transcriptionRows(days, names);
    expect(t.rows).toEqual([
      ["Mon", "8.0"],
      ["Tue", "8.0"],
      ["Thu", "7.5"],
      ["Fri", "4.0"],
    ]);
  });

  it("totals the ROUNDED days so the block adds up on its own", () => {
    // The exact sum here is 27h30m, which would round to 27.5 — but the values
    // a user actually types are 8.0+8.0+7.5+4.0. The block must be internally
    // consistent, since it is what gets transcribed.
    const days = [
      { workedMs: 7 * H + 46 * M },
      { workedMs: 7 * H + 46 * M },
      { workedMs: 7 * H + 44 * M },
      { workedMs: 4 * H },
    ];
    const t = h.transcriptionRows(days, names);
    expect(t.rows.map((r) => r[1])).toEqual(["8.0", "8.0", "7.5", "4.0"]);
    expect(t.total).toBe("27.5");
    expect(Number(t.total)).toBeCloseTo(
      t.rows.reduce((n, r) => n + Number(r[1]), 0),
      5,
    );
  });

  it("emits tab-separated rows plus a total row", () => {
    const t = h.transcriptionRows([{ workedMs: 8 * H }, { workedMs: 4 * H }], names);
    expect(t.tsv).toBe("Mon\t8.0\nTue\t4.0\nTotal\t12.0");
  });

  it("is empty for a week with no working time", () => {
    const t = h.transcriptionRows([{ workedMs: 0 }, { workedMs: 0 }], names);
    expect(t.rows).toEqual([]);
    expect(t.tsv).toBe("");
  });
});

// The classifier's state table. This is the whole point of keeping the decision
// pure: five retired verbs (Count as work / Exclude / Move to other side / Undo
// addition / Restore as work) collapse into three positions, and every cell has
// to map to the right corrections.
describe("classifyPlan", () => {
  const p = (type: string) => per(type, 9 * H, 10 * H);

  describe("a period that counts in the ledger being viewed", () => {
    it("is a no-op when classified as the ledger it already counts in", () => {
      expect(h.classifyPlan(p("sensor"), "work", "work")).toEqual([]);
      expect(h.classifyPlan(p("auto_bridged"), "work", "work")).toEqual([]);
      expect(h.classifyPlan(p("manual_added"), "work", "work")).toEqual([]);
    });

    it("moves measured and auto-bridged time atomically to the other ledger", () => {
      expect(h.classifyPlan(p("sensor"), "personal", "work")).toEqual([{ op: "move", from: "work" }]);
      expect(h.classifyPlan(p("auto_bridged"), "personal", "work")).toEqual([{ op: "move", from: "work" }]);
    });

    it("excludes measured and auto-bridged time from the current ledger only", () => {
      expect(h.classifyPlan(p("sensor"), "neither", "work")).toEqual([{ op: "remove", ledger: "work" }]);
      expect(h.classifyPlan(p("auto_bridged"), "neither", "work")).toEqual([{ op: "remove", ledger: "work" }]);
    });

    it("deletes a manual addition rather than overriding it with a remove_work", () => {
      // An add_work always wins within one ledger, so a remove_work here would
      // be a silent no-op — the addition has to be deleted.
      expect(h.classifyPlan(p("manual_added"), "neither", "work")).toEqual([{ op: "del" }]);
    });

    it("moves a manual addition by deleting it and re-adding on the other ledger", () => {
      expect(h.classifyPlan(p("manual_added"), "personal", "work")).toEqual([
        { op: "del" },
        { op: "add", ledger: "personal" },
      ]);
    });
  });

  describe("a period that counts nowhere in the ledger being viewed", () => {
    it("is a no-op when classified as neither", () => {
      expect(h.classifyPlan(p("gap"), "neither", "work")).toEqual([]);
      expect(h.classifyPlan(p("review"), "neither", "work")).toEqual([]);
      expect(h.classifyPlan(p("removed"), "neither", "work")).toEqual([]);
    });

    it("counts a gap or a reviewable break by adding on the chosen ledger", () => {
      expect(h.classifyPlan(p("gap"), "work", "work")).toEqual([{ op: "add", ledger: "work" }]);
      expect(h.classifyPlan(p("review"), "work", "work")).toEqual([{ op: "add", ledger: "work" }]);
    });

    it("assigns an uncounted gap to the other ledger without leaving the current one", () => {
      // Newly reachable: previously this required switching modes first.
      expect(h.classifyPlan(p("gap"), "personal", "work")).toEqual([{ op: "add", ledger: "personal" }]);
      expect(h.classifyPlan(p("review"), "personal", "work")).toEqual([{ op: "add", ledger: "personal" }]);
    });

    it("retracts an exclusion rather than stacking an add on top of it", () => {
      expect(h.classifyPlan(p("removed"), "work", "work")).toEqual([{ op: "del" }]);
    });

    it("keeps the exclusion when a removed period is sent to the other ledger", () => {
      // It must stop counting here AND start counting there; the existing
      // remove_work already achieves the first half.
      expect(h.classifyPlan(p("removed"), "personal", "work")).toEqual([{ op: "add", ledger: "personal" }]);
    });
  });

  describe("mirrors correctly while viewing the personal ledger", () => {
    it("treats personal as the current position for counted time", () => {
      expect(h.classifyPlan(p("sensor"), "personal", "personal")).toEqual([]);
      expect(h.classifyPlan(p("sensor"), "work", "personal")).toEqual([{ op: "move", from: "personal" }]);
      expect(h.classifyPlan(p("sensor"), "neither", "personal")).toEqual([{ op: "remove", ledger: "personal" }]);
    });

    it("restores a personal-ledger exclusion to the personal ledger", () => {
      expect(h.classifyPlan(p("removed"), "personal", "personal")).toEqual([{ op: "del" }]);
      expect(h.classifyPlan(p("removed"), "work", "personal")).toEqual([{ op: "add", ledger: "work" }]);
    });
  });

  it("never returns a plan that both adds and removes on the same ledger", () => {
    const types = ["sensor", "auto_bridged", "manual_added", "review", "removed", "gap"];
    for (const t of types) {
      for (const ledger of ["work", "personal"]) {
        for (const target of ["work", "personal", "neither"]) {
          const plan = h.classifyPlan(p(t), target, ledger);
          const adds = plan.filter((s): s is { op: "add"; ledger: string } => s.op === "add");
          const removes = plan.filter((s): s is { op: "remove"; ledger: string } => s.op === "remove");
          for (const a of adds) {
            expect(removes.some((r) => r.ledger === a.ledger)).toBe(false);
          }
        }
      }
    }
  });
});

// The client ships as a string inside the HTML, so TypeScript never parses it
// and the post-deploy E2E drives the JSON API rather than the DOM. A syntax
// error in it would therefore reach production as a blank page with nothing
// red anywhere. This is the only thing standing in that gap.
describe("the inlined browser client", () => {
  const html = renderApp(
    { email: "test@example.com" } as Parameters<typeof renderApp>[0],
    false,
    "acct-1",
    { status: "active", requested: true },
  );

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? "");
  const client = scripts[scripts.length - 1] ?? "";
  // The retired verbs are still named in the client's explanatory comments,
  // which ship with it — so strip comments before asserting they are gone as
  // user-visible labels. That is the property under test, not the prose.
  const code = client.replace(/^\s*\/\/.*$/gm, "");

  it("parses as valid JavaScript", () => {
    expect(scripts.length).toBeGreaterThan(1);
    expect(client).toContain("classifyPlan");
    expect(() => new Function(client)).not.toThrow();
  });

  it("inlines each helper source exactly once", () => {
    expect(html.split("function classifyPlan").length - 1).toBe(1);
    expect(html.split("function overlapsTypes").length - 1).toBe(1);
    expect(html.split("function minToHHMM").length - 1).toBe(1);
  });

  it("renders none of the retired verbs as a label", () => {
    for (const gone of ["Move to other side", "Mark private", "Undo addition", "Restore as work", "Count as work"]) {
      expect(code).not.toContain(gone);
    }
  });

  it("offers the three classifier positions instead", () => {
    expect(code).toContain("This time was");
    expect(code).toContain("'neither'");
  });

  it("no longer renders a legend", () => {
    expect(html).not.toContain('class="legend"');
    expect(html).not.toContain('class="swatch');
  });
});
