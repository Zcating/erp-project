import { describe, expect, it } from "vitest";
import { DOCUMENT_TYPE_CATALOG } from "../../shared/document-types";
import { POSTING_PHASE_SEQUENCES } from "./phases";

describe("单据类型目录与过账阶段表", () => {
  it("目录覆盖的类型集合与过账阶段表的类型集合一致", () => {
    expect(Object.keys(DOCUMENT_TYPE_CATALOG).sort()).toEqual(
      Object.keys(POSTING_PHASE_SEQUENCES).sort(),
    );
  });
});
