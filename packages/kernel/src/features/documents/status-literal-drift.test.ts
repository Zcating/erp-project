import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const packagesRoot = path.resolve(import.meta.dirname, "../../../..");

const SCAN_ROOTS = ["kernel/src", "kernel-pg/src"].map((relative) =>
  path.join(packagesRoot, relative),
);

const SCANNED_LITERALS = [
  "DRAFT",
  "POSTED",
  "VOIDED",
  "IN_TRANSIT",
  "RECEIVED",
  "OUT",
  "IN",
] as const;

const EXCLUDED_LITERALS = ["POST", "REVERSAL"] as const;

const DECLARATION_POINT_FILES = [
  "kernel/src/features/documents/model.ts",
  "kernel/src/features/documents/state-machine.ts",
  "kernel/src/features/transfer/model.ts",
  "kernel/src/features/inventory/model.ts",
];

type AllowedLiteral = {
  literal: string;
  reason: string;
};

const ALLOWED_LITERALS_BY_FILE: Record<string, AllowedLiteral[]> = {
  "kernel/src/features/documents/service.ts": [
    { literal: "DRAFT", reason: "新建单据时写入的初始状态" },
    { literal: "POSTED", reason: "退货引用校验要求原单据行已过账" },
  ],
  "kernel/src/features/documents/in-memory-repository.ts": [
    { literal: "DRAFT", reason: "判断引用了商品的单据不是草稿" },
    { literal: "POSTED", reason: "累计已过账退货单引用的行数量" },
  ],
  "kernel/src/features/posting/service.ts": [
    { literal: "DRAFT", reason: "过账时以草稿为前置状态做 CAS 写入" },
    { literal: "POSTED", reason: "过账的目标状态与已过账幂等短路" },
    { literal: "VOIDED", reason: "作废的目标状态与非法迁移拒绝" },
  ],
  "kernel/src/features/purchase-return/purchase-return-posting.ts": [
    { literal: "POSTED", reason: "退货引用校验要求原采购入库单行已过账" },
  ],
  "kernel/src/features/sales-return/sale-return-posting.ts": [
    { literal: "POSTED", reason: "退货成本回冲要求原销售出库单行已过账" },
  ],
  "kernel/src/features/transfer/posting.ts": [
    { literal: "IN_TRANSIT", reason: "调出过账写入在途记录、调入过账筛选在途记录" },
    { literal: "RECEIVED", reason: "调入过账把在途记录置为已接收" },
  ],
  "kernel/src/features/transfer/service.ts": [
    { literal: "RECEIVED", reason: "判断调拨单是否已经调入完成" },
  ],
  "kernel/src/features/transfer/in-memory-repository.ts": [
    { literal: "IN_TRANSIT", reason: "统计在途数量时只算仍在途的记录" },
  ],
  "kernel-pg/src/features/documents/repository.ts": [
    { literal: "POSTED", reason: "查询已过账单据及其单据行" },
    { literal: "VOIDED", reason: "查询已过账或已作账单据引用过的商品" },
  ],
  "kernel-pg/src/features/transfer/repository.ts": [
    { literal: "IN_TRANSIT", reason: "查询仍在途的调拨记录" },
  ],
};

const isTestFile = (name: string): boolean =>
  name.endsWith(".test.ts") ||
  name.endsWith(".test.tsx") ||
  name.endsWith(".e2e.ts") ||
  name.endsWith(".e2e.tsx") ||
  name.endsWith(".pw.ts") ||
  name.endsWith(".pw.tsx");

const collectSourceFiles = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !isTestFile(entry)) {
      files.push(fullPath);
    }
  }
  return files;
};

const scannedFiles = (): string[] => SCAN_ROOTS.flatMap((root) => collectSourceFiles(root)).sort();

const relativeToPackages = (file: string): string =>
  path.relative(packagesRoot, file).split(path.sep).join("/");

const occurrencesOf = (content: string, literal: string): number =>
  content.match(new RegExp(`(["'])${literal}\\1`, "g"))?.length ?? 0;

const allowedLiteralsOf = (relativePath: string): Set<string> => {
  if (DECLARATION_POINT_FILES.includes(relativePath)) {
    return new Set<string>(SCANNED_LITERALS);
  }
  return new Set((ALLOWED_LITERALS_BY_FILE[relativePath] ?? []).map((entry) => entry.literal));
};

describe("状态字面量漂移守卫", () => {
  it("状态字面量只出现在内核的声明点与登记在册的文件里，白名单之外的出现即失败", () => {
    const offenders: string[] = [];
    for (const file of scannedFiles()) {
      const relativePath = relativeToPackages(file);
      const allowed = allowedLiteralsOf(relativePath);
      const content = readFileSync(file, "utf8");
      for (const literal of SCANNED_LITERALS) {
        if (occurrencesOf(content, literal) > 0 && !allowed.has(literal)) {
          offenders.push(`${relativePath} 出现 ${literal}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("扫描范围限定在内核与 Postgres 适配器的非测试文件，前端不在扫描范围内", () => {
    const files = scannedFiles();

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const relativePath = relativeToPackages(file);
      expect(
        relativePath.startsWith("kernel/src/") || relativePath.startsWith("kernel-pg/src/"),
      ).toBe(true);
      expect(isTestFile(relativePath)).toBe(false);
    }
  });

  it("登记在册的文件与声明点文件都真实存在，每条登记都写明了允许的理由", () => {
    const registered = Object.keys(ALLOWED_LITERALS_BY_FILE).sort();

    expect(registered).toEqual(
      registered.filter((relativePath) =>
        scannedFiles().some((file) => relativeToPackages(file) === relativePath),
      ),
    );
    expect(
      DECLARATION_POINT_FILES.every((relativePath) =>
        scannedFiles().some((file) => relativeToPackages(file) === relativePath),
      ),
    ).toBe(true);
    for (const entries of Object.values(ALLOWED_LITERALS_BY_FILE)) {
      for (const entry of entries) {
        expect(entry.reason.length).toBeGreaterThan(0);
        expect(SCANNED_LITERALS).toContain(entry.literal);
      }
    }
  });

  it("调拨阶段字面量 OUT 与 IN 不会被 HTTP 动词误伤：它们只出现在调拨阶段的声明点", () => {
    const filesWithPhases = scannedFiles().filter((file) => {
      const content = readFileSync(file, "utf8");
      return occurrencesOf(content, "OUT") > 0 || occurrencesOf(content, "IN") > 0;
    });

    expect(filesWithPhases.map(relativeToPackages)).toEqual([
      "kernel/src/features/transfer/model.ts",
    ]);
  });

  it("库存流水方向的 POST 与 REVERSAL 不纳入字面量扫描", () => {
    expect(SCANNED_LITERALS).not.toContain("POST");
    expect(SCANNED_LITERALS).not.toContain("REVERSAL");
    expect(EXCLUDED_LITERALS).toEqual(["POST", "REVERSAL"]);

    const directionFiles = scannedFiles().filter((file) => {
      const content = readFileSync(file, "utf8");
      return EXCLUDED_LITERALS.some((literal) => occurrencesOf(content, literal) > 0);
    });

    expect(directionFiles.map(relativeToPackages)).toContain(
      "kernel/src/features/inventory/model.ts",
    );
    expect(directionFiles.length).toBeGreaterThan(1);
  });

  it("只匹配引号包裹的 ASCII 字面量，中文错误消息里的已过账与已作废不被误伤", () => {
    expect(occurrencesOf("单据不能从已过账变为已作废", "DRAFT")).toBe(0);
    expect(occurrencesOf("单据不能从已过账变为已作废", "POSTED")).toBe(0);
    expect(occurrencesOf("单据不能从已过账变为已作废", "VOIDED")).toBe(0);
    expect(occurrencesOf("单据不能从已过账变为已作废", "IN_TRANSIT")).toBe(0);

    const chineseOccurrences = scannedFiles().reduce((total, file) => {
      const content = readFileSync(file, "utf8");
      return total + (content.match(/已过账|已作废/g)?.length ?? 0);
    }, 0);

    expect(chineseOccurrences).toBeGreaterThan(0);
  });
});
