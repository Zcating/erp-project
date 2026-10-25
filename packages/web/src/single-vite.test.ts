import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..", "..");

const workspacePackageDirs = [
  ".",
  "packages/shared",
  "packages/kernel",
  "packages/kernel-pg",
  "packages/app",
  "packages/web",
];

function resolveVitePackageJson(packageDir: string): string {
  const require = createRequire(path.join(workspaceRoot, packageDir, "package.json"));
  return require.resolve("vite/package.json");
}

describe("单一 vite 副本", () => {
  it("每个包解析出的 vite 指向同一物理路径", () => {
    const resolved = workspacePackageDirs.map(resolveVitePackageJson);

    expect(new Set(resolved).size).toBe(1);
  });

  it("解析到的是 vite-plus 内置的 Vite 实现，而不是 npm 上的标准 vite", () => {
    const manifest = JSON.parse(readFileSync(resolveVitePackageJson("."), "utf8")) as {
      name: string;
      version: string;
    };

    expect(manifest.name).toBe("@voidzero-dev/vite-plus-core");
    expect(manifest.version).toBe("1.0.0");
  });
});
