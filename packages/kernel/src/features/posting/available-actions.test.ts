import { describe, expect, it } from "vitest";
import {
  DOCUMENT_STATUS_TRANSITIONS,
  DRAFT_DOCUMENT_TYPES,
  POSTED_DOCUMENT_STATUS,
  VOIDED_DOCUMENT_STATUS,
} from "../documents";
import type { Document, DocumentStatus, DraftDocumentType } from "../documents";
import { availableDocumentActions } from "./actions";
import { POSTING_PHASE_SEQUENCES } from "./phases";

const documentOf = (
  type: DraftDocumentType,
  status: DocumentStatus,
  overrides: Partial<Document> = {},
): Document => ({
  id: "doc-1",
  documentNo: "DOC-1",
  type,
  status,
  supplierId: null,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: null,
  warehouseId: null,
  lines: [],
  ...overrides,
});

const singlePhaseTypes = DRAFT_DOCUMENT_TYPES.filter((type) => type !== "TRANSFER");

describe("可用动作判定", () => {
  it("六类单据在草稿状态下通用作废都不可用", () => {
    for (const type of DRAFT_DOCUMENT_TYPES) {
      const actions = availableDocumentActions(documentOf(type, "DRAFT"), []);

      expect(actions.void).toEqual({
        label: "作废",
        enabled: false,
        reason: "单据尚未过账，不能作废",
      });
    }
  });

  it("六类单据在已过账状态下通用作废都可用", () => {
    for (const type of DRAFT_DOCUMENT_TYPES) {
      const actions = availableDocumentActions(documentOf(type, "POSTED"), []);

      expect(actions.void).toEqual({ label: "作废", enabled: true, reason: null });
    }
  });

  it("六类单据在已作废状态下两个动作都不可用，作废说明原因", () => {
    for (const type of DRAFT_DOCUMENT_TYPES) {
      const actions = availableDocumentActions(documentOf(type, "VOIDED"), []);

      expect(actions.void).toEqual({
        label: "作废",
        enabled: false,
        reason: "单据已作废，不能再次作废",
      });
    }
  });

  it("五类非调拨单在草稿状态下只有一条通用过账且可用", () => {
    for (const type of singlePhaseTypes) {
      const actions = availableDocumentActions(documentOf(type, "DRAFT"), []);

      expect(actions.post).toEqual([{ phase: null, label: "过账", enabled: true, reason: null }]);
    }
  });

  it("五类非调拨单在已过账状态下通用过账不可用", () => {
    for (const type of singlePhaseTypes) {
      const actions = availableDocumentActions(documentOf(type, "POSTED"), []);

      expect(actions.post).toEqual([
        { phase: null, label: "过账", enabled: false, reason: "单据已过账，不能再次过账" },
      ]);
    }
  });

  it("五类非调拨单在已作废状态下通用过账不可用", () => {
    for (const type of singlePhaseTypes) {
      const actions = availableDocumentActions(documentOf(type, "VOIDED"), []);

      expect(actions.post).toEqual([
        { phase: null, label: "过账", enabled: false, reason: "单据已作废，不能过账" },
      ]);
    }
  });

  it("非调拨单不出现调出与调入两条", () => {
    for (const type of singlePhaseTypes) {
      const actions = availableDocumentActions(documentOf(type, "POSTED"), ["OUT", "IN"]);

      expect(actions.post).toHaveLength(1);
      expect(actions.post[0]?.phase).toBeNull();
    }
  });

  it("调拨单在草稿状态下调出过账可用，调入过账不可用并说明缺少调出阶段", () => {
    const actions = availableDocumentActions(documentOf("TRANSFER", "DRAFT"), []);

    expect(actions.post).toEqual([
      { phase: "OUT", label: "调出过账", enabled: true, reason: null },
      { phase: "IN", label: "调入过账", enabled: false, reason: "调出阶段尚未完成，不能调入过账" },
    ]);
  });

  it("调拨单调出阶段完成后调出过账不可用，调入过账可用", () => {
    const actions = availableDocumentActions(documentOf("TRANSFER", "POSTED"), ["OUT"]);

    expect(actions.post).toEqual([
      { phase: "OUT", label: "调出过账", enabled: false, reason: "调出阶段已完成" },
      { phase: "IN", label: "调入过账", enabled: true, reason: null },
    ]);
    expect(actions.void).toEqual({ label: "作废", enabled: true, reason: null });
  });

  it("调拨单两个阶段都完成后两条过账动作都不可用，各自说明原因", () => {
    const actions = availableDocumentActions(documentOf("TRANSFER", "POSTED"), ["OUT", "IN"]);

    expect(actions.post).toEqual([
      { phase: "OUT", label: "调出过账", enabled: false, reason: "调出阶段已完成" },
      { phase: "IN", label: "调入过账", enabled: false, reason: "调入阶段已完成" },
    ]);
    expect(actions.void).toEqual({ label: "作废", enabled: true, reason: null });
  });

  it("调拨单已作废后两条过账动作都不可用，原因是单据已作废", () => {
    const actions = availableDocumentActions(documentOf("TRANSFER", "VOIDED"), ["OUT", "IN"]);

    expect(actions.post).toEqual([
      { phase: "OUT", label: "调出过账", enabled: false, reason: "单据已作废，不能调出过账" },
      { phase: "IN", label: "调入过账", enabled: false, reason: "单据已作废，不能调入过账" },
    ]);
  });

  it("调拨单的两条过账动作按过账阶段表的顺序给出", () => {
    const actions = availableDocumentActions(documentOf("TRANSFER", "DRAFT"), []);

    expect(actions.post.map((action) => action.phase)).toEqual([
      ...POSTING_PHASE_SEQUENCES.TRANSFER,
    ]);
  });

  it("通用过账与通用作废的可用性由单据状态迁移表决定", () => {
    for (const status of ["DRAFT", "POSTED", "VOIDED"] as const) {
      const actions = availableDocumentActions(documentOf("PURCHASE_INBOUND", status), []);

      expect(actions.post[0]?.enabled).toBe(
        DOCUMENT_STATUS_TRANSITIONS[status].includes(POSTED_DOCUMENT_STATUS),
      );
      expect(actions.void.enabled).toBe(
        DOCUMENT_STATUS_TRANSITIONS[status].includes(VOIDED_DOCUMENT_STATUS),
      );
    }
  });

  it("判定是纯函数：不改动入参，同样的输入给出同样的结果", () => {
    const document = documentOf("TRANSFER", "POSTED");
    const before = structuredClone(document);

    const first = availableDocumentActions(document, ["OUT"]);
    const second = availableDocumentActions(document, ["OUT"]);

    expect(document).toEqual(before);
    expect(first).toEqual(second);
  });
});
