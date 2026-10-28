import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webSrcDir = path.resolve(import.meta.dirname, "../..");

const STATUS_LITERALS = ["DRAFT", "POSTED", "VOIDED"] as const;
const PHASE_LITERALS = ["OUT", "IN"] as const;
const SCANNED_LITERALS = [...STATUS_LITERALS, ...PHASE_LITERALS];

type AllowedLiteral = {
  literal: string;
  reason: string;
};

const ALLOWED_LITERALS_BY_FILE: Record<string, AllowedLiteral[]> = {
  "features/documents/lib/format.ts": [
    { literal: "DRAFT", reason: "展示层的中文状态标签表与状态选项" },
    { literal: "POSTED", reason: "展示层的中文状态标签表与状态选项" },
    { literal: "VOIDED", reason: "展示层的中文状态标签表与状态选项" },
    { literal: "OUT", reason: "展示层的调拨过账阶段常量" },
    { literal: "IN", reason: "展示层的调拨过账阶段常量" },
  ],
  "server/documents.ts": [
    { literal: "DRAFT", reason: "HTTP 契约里的单据状态联合类型" },
    { literal: "POSTED", reason: "HTTP 契约里的单据状态联合类型" },
    { literal: "VOIDED", reason: "HTTP 契约里的单据状态联合类型" },
  ],
};

type DecisionHit = {
  literal: string;
  line: number;
};

const decisionPatterns = (): RegExp[] => {
  const literalGroup = `(["'])(${SCANNED_LITERALS.join("|")})\\1`;
  return [
    new RegExp(`(?<![<>=!])[!=]==?\\s*${literalGroup}`, "g"),
    new RegExp(`${literalGroup}\\s*[!=]==?`, "g"),
    new RegExp(`case\\s+${literalGroup}\\s*:`, "g"),
    new RegExp(`\\.includes\\(\\s*${literalGroup}`, "g"),
  ];
};

function findDecisions(source: string): DecisionHit[] {
  const hits: DecisionHit[] = [];
  for (const pattern of decisionPatterns()) {
    for (const match of source.matchAll(pattern)) {
      const literal = match[2];
      if (literal === undefined) {
        continue;
      }
      hits.push({ literal, line: source.slice(0, match.index).split("\n").length });
    }
  }
  return hits;
}

function countOccurrences(source: string, literal: string): number {
  return source.match(new RegExp(`(["'])${literal}\\1`, "g"))?.length ?? 0;
}

const isTestFile = (name: string): boolean =>
  name.endsWith(".test.ts") || name.endsWith(".test.tsx");

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry) || isTestFile(entry)) {
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

const scannedFiles = (): string[] => collectSourceFiles(webSrcDir).sort();

const relativeToSrc = (file: string): string =>
  path.relative(webSrcDir, file).split(path.sep).join("/");

describe("前端单据状态判定守卫", () => {
  it("前端源码里没有把单据状态或调拨阶段与字面量比较来决定动作可用性的代码", () => {
    const offenders: string[] = [];

    for (const file of scannedFiles()) {
      const source = readFileSync(file, "utf8");
      for (const hit of findDecisions(source)) {
        offenders.push(`${relativeToSrc(file)}:${hit.line} 出现状态判定 ${hit.literal}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("状态与调拨阶段字面量只出现在登记在册的展示层与契约声明文件里", () => {
    const offenders: string[] = [];

    for (const file of scannedFiles()) {
      const relativePath = relativeToSrc(file);
      const allowed = new Set(
        (ALLOWED_LITERALS_BY_FILE[relativePath] ?? []).map((entry) => entry.literal),
      );
      const source = readFileSync(file, "utf8");
      for (const literal of SCANNED_LITERALS) {
        if (countOccurrences(source, literal) > 0 && !allowed.has(literal)) {
          offenders.push(`${relativePath} 出现 ${literal}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("扫描范围是前端源码目录下的非测试文件", () => {
    const files = scannedFiles();

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(relativeToSrc(file).startsWith("../")).toBe(false);
      expect(isTestFile(relativeToSrc(file))).toBe(false);
    }
    expect(files.map(relativeToSrc)).toContain("features/documents/components/posting-actions.tsx");
  });

  it("登记在册的每个文件与字面量都真实存在于前端源码里，每条登记都写明了允许的理由", () => {
    for (const [relativePath, entries] of Object.entries(ALLOWED_LITERALS_BY_FILE)) {
      const file = path.join(webSrcDir, relativePath);
      expect(scannedFiles()).toContain(file);
      const source = readFileSync(file, "utf8");
      for (const entry of entries) {
        expect(entry.reason.length).toBeGreaterThan(0);
        expect(SCANNED_LITERALS).toContain(entry.literal);
        expect(countOccurrences(source, entry.literal)).toBeGreaterThan(0);
      }
    }
  });

  it("判定检测器认得出状态比较与状态分支", () => {
    const hits = findDecisions(
      [
        'const a = document.status !== "DRAFT";',
        'const b = "POSTED" === document.status;',
        'switch (document.status) { case "VOIDED": break; }',
        'const c = postedPhases.includes("OUT");',
      ].join("\n"),
    );

    expect(hits.map((hit) => hit.literal)).toEqual(["DRAFT", "POSTED", "VOIDED", "OUT"]);
  });

  it("判定检测器不把展示用的标签表与类型声明当成判定", () => {
    const hits = findDecisions(
      [
        'export type DocumentStatus = "DRAFT" | "POSTED" | "VOIDED";',
        'export const DOCUMENT_STATUS_OPTIONS = ["DRAFT", "POSTED", "VOIDED"] as const;',
        "const label = DOCUMENT_STATUS_LABELS[document.status];",
        'const label = "草稿";',
      ].join("\n"),
    );

    expect(hits).toEqual([]);
  });

  it("判定检测器不把大于等于与箭头函数当成状态判定", () => {
    const hits = findDecisions(
      ['const a = count >= "3";', 'const b = (value) => "2";', 'const c = count != "4";'].join(
        "\n",
      ),
    );

    expect(hits.map((hit) => hit.literal)).toEqual([]);
  });

  it("只匹配引号包裹的 ASCII 字面量，中文文案里的已过账与已作废不被误伤", () => {
    expect(countOccurrences("单据已过账不能再次过账", "POSTED")).toBe(0);
    expect(countOccurrences("单据已作废不能再次作废", "VOIDED")).toBe(0);
    expect(countOccurrences("单据已过账不能再次过账", "DRAFT")).toBe(0);
    expect(findDecisions('const reason = "单据已过账，不能再次过账";')).toEqual([]);
  });
});
