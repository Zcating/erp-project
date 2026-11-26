import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const packagesRoot = path.resolve(import.meta.dirname, "../../../..");

const serviceSource = readFileSync(
  path.join(packagesRoot, "kernel/src/features/posting/service.ts"),
  "utf8",
);

describe("过账的公共路径只有一处", () => {
  it("service.ts 只做装配与委托，不再包含状态写入、状态断言、过账前置与反向驱动", () => {
    expect(serviceSource).not.toContain("updateStatus(");
    expect(serviceSource).not.toContain("assertDocumentStatusTransition");
    expect(serviceSource).not.toContain("assertPostingPrerequisites");
    expect(serviceSource).not.toContain("reverseDocumentPostings");
  });
});
