import { describe, expect, it } from "vitest";
import { DOCUMENT_TYPES } from "../../shared/document-types";
import type { DocumentType } from "../../shared/document-types";
import { DuplicateError, ValidationError } from "../../shared/errors";
import { assertPostingHandlerCoverage } from "./handler-coverage";
import type { PostingTypeHandler } from "./model";

const handlerOfType = (type: string): PostingTypeHandler => ({
  type: type as DocumentType,
  policy: { saveMode: "after-loop", ensureZeroBalances: false },
  apply: async () => [],
});

const fullHandlers = (): PostingTypeHandler[] => DOCUMENT_TYPES.map(handlerOfType);

describe("过账 handler 完备性检查", () => {
  it("覆盖目录里的全部单据类型时通过", () => {
    expect(() => assertPostingHandlerCoverage(fullHandlers())).not.toThrow();
  });

  it("缺少某个单据类型的 handler 时报出缺少的类型", () => {
    const handlers = fullHandlers().filter((handler) => handler.type !== "STOCKTAKE");

    expect(() => assertPostingHandlerCoverage(handlers)).toThrow(ValidationError);
    expect(() => assertPostingHandlerCoverage(handlers)).toThrow(
      "过账 handler 缺少单据类型：STOCKTAKE",
    );
  });

  it("同一单据类型注册多个 handler 时报出重复的类型", () => {
    const handlers = [...fullHandlers(), handlerOfType("PURCHASE_INBOUND")];

    expect(() => assertPostingHandlerCoverage(handlers)).toThrow(DuplicateError);
    expect(() => assertPostingHandlerCoverage(handlers)).toThrow(
      "过账 handler 重复注册单据类型：PURCHASE_INBOUND",
    );
  });

  it("注册了单据类型目录之外的类型时报出该类型", () => {
    const handlers = [...fullHandlers(), handlerOfType("UNKNOWN_DOCUMENT")];

    expect(() => assertPostingHandlerCoverage(handlers)).toThrow(ValidationError);
    expect(() => assertPostingHandlerCoverage(handlers)).toThrow(
      "过账 handler 注册了目录外的单据类型：UNKNOWN_DOCUMENT",
    );
  });
});
