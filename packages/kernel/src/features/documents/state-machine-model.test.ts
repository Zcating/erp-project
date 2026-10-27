import { describe, expect, it } from "vitest";
import { DOCUMENT_STATUSES } from "./model";
import { DOCUMENT_STATUS_TRANSITIONS } from "./state-machine";

const ORACLE_DRAFT = "DRAFT";
const ORACLE_POSTED = "POSTED";
const ORACLE_VOIDED = "VOIDED";
const ORACLE_REACHABLE_STATUSES = [ORACLE_DRAFT, ORACLE_POSTED, ORACLE_VOIDED];

type TransitionTable = Readonly<Record<string, readonly string[]>>;

const edgesOf = (
  transitions: Readonly<Record<string, readonly string[]>>,
): Map<string, readonly string[]> => new Map(Object.entries(transitions));

const reachableFrom = (start: string, edges: Map<string, readonly string[]>): Set<string> => {
  const reached = new Set<string>([start]);
  const pending: string[] = [start];
  while (pending.length > 0) {
    const current = pending.shift() as string;
    for (const next of edges.get(current) ?? []) {
      if (reached.has(next)) {
        continue;
      }
      reached.add(next);
      pending.push(next);
    }
  }
  return reached;
};

const startStatesOf = (edges: Map<string, readonly string[]>): string[] => {
  const targets = new Set<string>();
  for (const nexts of edges.values()) {
    for (const next of nexts) {
      targets.add(next);
    }
  }
  return [...edges.keys()].filter((state) => !targets.has(state));
};

const findCycle = (edges: Map<string, readonly string[]>): string[] | null => {
  const visiting = new Set<string>();
  const settled = new Set<string>();
  const walk = (node: string, path: string[]): string[] | null => {
    if (visiting.has(node)) {
      return [...path, node];
    }
    if (settled.has(node)) {
      return null;
    }
    visiting.add(node);
    for (const next of edges.get(node) ?? []) {
      const cycle = walk(next, [...path, node]);
      if (cycle !== null) {
        return cycle;
      }
    }
    visiting.delete(node);
    settled.add(node);
    return null;
  };
  for (const node of edges.keys()) {
    const cycle = walk(node, []);
    if (cycle !== null) {
      return cycle;
    }
  }
  return null;
};

const transitions: TransitionTable = DOCUMENT_STATUS_TRANSITIONS;

const byText = (left: string, right: string): number => left.localeCompare(right);

describe("单据状态迁移表的可达性穷举", () => {
  it("迁移表恰好声明草稿、已过账、已作废三个状态，没有第四个状态", () => {
    expect(Object.keys(transitions).sort(byText)).toEqual(
      [...ORACLE_REACHABLE_STATUSES].sort(byText),
    );
  });

  it("迁移表覆盖全部已声明的状态，每条边的目标都是已声明的状态", () => {
    expect(Object.keys(transitions).sort(byText)).toEqual([...DOCUMENT_STATUSES].sort(byText));
    for (const targets of Object.values(transitions)) {
      for (const target of targets) {
        expect(DOCUMENT_STATUSES).toContain(target);
      }
    }
  });

  it("从初态出发的可达集恰为草稿、已过账、已作废", () => {
    const edges = edgesOf(transitions);
    const starts = startStatesOf(edges);

    expect(starts).toEqual([ORACLE_DRAFT]);
    expect([...reachableFrom(starts[0] as string, edges)].sort(byText)).toEqual(
      [...ORACLE_REACHABLE_STATUSES].sort(byText),
    );
  });

  it("已作废是吸收态：可达状态里只有一个出度为零，且每个可达状态都能走到它", () => {
    const edges = edgesOf(transitions);
    const reachable = [...reachableFrom(startStatesOf(edges)[0] as string, edges)];
    const sinks = reachable.filter((state) => (edges.get(state) ?? []).length === 0);

    expect(sinks).toEqual([ORACLE_VOIDED]);
    for (const state of reachable) {
      expect([...reachableFrom(state, edges)]).toContain(ORACLE_VOIDED);
    }
  });

  it("迁移表无自环：任何状态都不指向自己", () => {
    for (const [from, targets] of edgesOf(transitions)) {
      expect(targets).not.toContain(from);
    }
  });

  it("迁移表无环：整张迁移表是有向无环图", () => {
    expect(findCycle(edgesOf(transitions))).toBeNull();
  });

  it("已过账只能走向已作废，草稿只能走向已过账", () => {
    const edges = edgesOf(transitions);

    expect(edges.get(ORACLE_DRAFT)).toEqual([ORACLE_POSTED]);
    expect(edges.get(ORACLE_POSTED)).toEqual([ORACLE_VOIDED]);
    expect(edges.get(ORACLE_VOIDED)).toEqual([]);
  });
});
