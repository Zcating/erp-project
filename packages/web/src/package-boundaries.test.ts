import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webPackageDir = path.resolve(import.meta.dirname, "..");

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const FORBIDDEN_DEPENDENCY_PATTERNS = [
  /^pg$/,
  /^pg-/,
  /^postgres/,
  /^postgresql/,
  /^drizzle-/,
  /^@erp-project\/kernel/,
  /^mysql2?$/,
  /^sqlite3?$/,
  /^mongodb$/,
  /^@mongodb/,
  /^typeorm$/,
  /^prisma/,
];

const IMPORT_PATTERN = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["']([^"']+)["']/g;

function readManifest(): PackageManifest {
  const raw = readFileSync(path.join(webPackageDir, "package.json"), "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, "")) as PackageManifest;
}

function collectSourceFiles(dir: string): Array<string> {
  const files: Array<string> = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectImportSpecifiers(): Array<string> {
  const specifiers: Array<string> = [];
  for (const file of collectSourceFiles(path.join(webPackageDir, "src"))) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
  }
  return specifiers;
}

describe("前端依赖边界", () => {
  it("依赖清单里不含任何数据库驱动，也不引用内核包与 Postgres 适配器包", () => {
    const manifest = readManifest();
    const dependencies = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    });

    const offenders = dependencies.filter((name) =>
      FORBIDDEN_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(name)),
    );

    expect(offenders).toEqual([]);
  });

  it("源码里不引用内核包、Postgres 适配器包与数据库驱动", () => {
    const offenders = collectImportSpecifiers().filter((specifier) =>
      FORBIDDEN_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(specifier)),
    );

    expect(offenders).toEqual([]);
  });
});
