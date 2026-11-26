import { describe, expect, it } from "vitest";
import { DOCUMENT_TYPE_CATALOG } from "../../shared/document-types";
import { NotFoundError, StateConflictError, ValidationError } from "../../shared/errors";
import * as documentsFeature from "./index";
import { createInMemoryDocumentRepository } from "./in-memory-repository";
import type { Document, DocumentInput } from "./model";
import { formatDocumentDate, formatDocumentNumber } from "./numbering";
import { createDocumentService } from "./service";
import { assertDocumentStatusTransition, canTransitionDocumentStatus } from "./state-machine";
import { assertDocumentType } from "./validation";

const FIXED_CLOCK = new Date("2026-01-02T03:04:05Z");

const createService = (
  options: { clock?: () => Date; timeZone?: string } = {},
): {
  repository: ReturnType<typeof createInMemoryDocumentRepository>;
  service: ReturnType<typeof createDocumentService>;
} => {
  const repository = createInMemoryDocumentRepository();
  let counter = 0;
  const service = createDocumentService(repository, {
    idGenerator: () => `doc-${++counter}`,
    clock: options.clock ?? (() => FIXED_CLOCK),
    timeZone: options.timeZone ?? "Asia/Shanghai",
  });
  return { repository, service };
};

const baseInput = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
  type: "PURCHASE_INBOUND",
  supplierId: "supplier-1",
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: "warehouse-1",
  warehouseId: null,
  lines: [{ itemId: "item-1", quantity: "3", unitPrice: "1.115", amount: null }],
  ...overrides,
});

const stocktakeInput = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
  type: "STOCKTAKE",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: null,
  warehouseId: "warehouse-1",
  lines: [{ itemId: "item-1", quantity: "0", unitPrice: null, amount: null }],
  ...overrides,
});

const transferInput = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
  type: "TRANSFER",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: "warehouse-1",
  targetWarehouseId: "warehouse-2",
  warehouseId: null,
  lines: [{ itemId: "item-1", quantity: "2", unitPrice: "1.5", amount: null }],
  ...overrides,
});

const saleOutboundInput = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
  type: "SALE_OUTBOUND",
  supplierId: null,
  customerId: "customer-1",
  sourceWarehouseId: "warehouse-1",
  targetWarehouseId: null,
  warehouseId: null,
  lines: [{ itemId: "item-1", quantity: "1", unitPrice: "2", amount: null }],
  ...overrides,
});

describe("单据编号策略", () => {
  it.each([
    ["PURCHASE_INBOUND", "PIN"],
    ["SALE_OUTBOUND", "SOUT"],
    ["SALE_RETURN", "SRET"],
    ["PURCHASE_RETURN", "PRET"],
    ["STOCKTAKE", "STK"],
    ["TRANSFER", "TRF"],
  ] as const)("单据类型 %s 的单号前缀是 %s", (type, prefix) => {
    expect(DOCUMENT_TYPE_CATALOG[type].numberPrefix).toBe(prefix);
    expect(formatDocumentNumber(type, "20260102", 7)).toBe(`${prefix}-20260102-007`);
  });

  it("单据域公开面不再带规则表、单号前缀表与类型标签表", () => {
    const retiredNames = [
      "DOCUMENT_TYPE_RULES",
      "DOCUMENT_NUMBER_PREFIXES",
      "DOCUMENT_TYPE_LABELS",
    ];

    expect(retiredNames.filter((name) => name in documentsFeature)).toEqual([]);
  });

  it("单据域公开面不再带重复的草稿类型层", () => {
    const retiredNames = ["DRAFT_DOCUMENT_TYPES", "isDraftDocumentType", "assertDraftDocumentType"];

    expect(retiredNames.filter((name) => name in documentsFeature)).toEqual([]);
  });

  it("单号形如 <前缀>-<YYYYMMDD>-<当日序号>", () => {
    expect(formatDocumentNumber("PURCHASE_INBOUND", "20260102", 1)).toBe("PIN-20260102-001");
    expect(formatDocumentNumber("TRANSFER", "20260102", 42)).toBe("TRF-20260102-042");
  });

  it("单号日期段取部署配置时区下的服务端当日日期", () => {
    const instant = new Date("2026-01-01T16:30:00Z");

    expect(formatDocumentDate(instant, "Asia/Shanghai")).toBe("20260102");
    expect(formatDocumentDate(instant, "UTC")).toBe("20260101");
  });

  it("同一时刻在两种时区下的单号日期段不同，说明日期由部署配置决定而非浏览器本地时区", async () => {
    const instant = new Date("2026-01-01T16:30:00Z");
    const shanghai = createService({ clock: () => instant, timeZone: "Asia/Shanghai" });
    const utc = createService({ clock: () => instant, timeZone: "UTC" });

    const shanghaiDocument = await shanghai.service.create(baseInput());
    const utcDocument = await utc.service.create(baseInput());

    expect(shanghaiDocument.documentNo).toBe("PIN-20260102-001");
    expect(utcDocument.documentNo).toBe("PIN-20260101-001");
  });
});

describe("单据类型运行时守卫", () => {
  it("缺少类型时抛校验错误，文案是「缺少单据类型」", () => {
    const input = baseInput({ type: "" as DocumentInput["type"] });

    expect(() => assertDocumentType(input)).toThrow(ValidationError);
    expect(() => assertDocumentType(input)).toThrow("缺少单据类型");
  });

  it("未知类型时抛校验错误，文案是「单据类型暂不支持创建草稿：X」", () => {
    const input = baseInput({ type: "UNKNOWN" as DocumentInput["type"] });

    expect(() => assertDocumentType(input)).toThrow(ValidationError);
    expect(() => assertDocumentType(input)).toThrow("单据类型暂不支持创建草稿：UNKNOWN");
  });
});

describe("单据草稿的创建", () => {
  it.each([
    ["PURCHASE_INBOUND", "PIN", baseInput()],
    ["SALE_OUTBOUND", "SOUT", saleOutboundInput()],
    ["STOCKTAKE", "STK", stocktakeInput()],
    ["TRANSFER", "TRF", transferInput()],
  ] as const)(
    "新建 %s 草稿后单号形如 %s-<YYYYMMDD>-<当日序号>，状态是草稿",
    async (type, prefix, input) => {
      const { service } = createService();

      const document = await service.create(input);

      expect(document.type).toBe(type);
      expect(document.status).toBe("DRAFT");
      expect(document.documentNo).toMatch(new RegExp(`^${prefix}-\\d{8}-\\d{3}$`));
      expect(document.documentNo.startsWith(`${prefix}-20260102-`)).toBe(true);
    },
  );

  it("同一天连续创建同类型单据，当日序号依次递增且互不重复", async () => {
    const { service } = createService();

    const first = await service.create(baseInput());
    const second = await service.create(baseInput());
    const third = await service.create(baseInput());

    expect(first.documentNo).toBe("PIN-20260102-001");
    expect(second.documentNo).toBe("PIN-20260102-002");
    expect(third.documentNo).toBe("PIN-20260102-003");
    expect(new Set([first.documentNo, second.documentNo, third.documentNo]).size).toBe(3);
  });

  it("不同类型的当日序号各自独立计数", async () => {
    const { service } = createService();

    const purchase = await service.create(baseInput());
    const sale = await service.create(saleOutboundInput());
    const transfer = await service.create(transferInput());

    expect(purchase.documentNo).toBe("PIN-20260102-001");
    expect(sale.documentNo).toBe("SOUT-20260102-001");
    expect(transfer.documentNo).toBe("TRF-20260102-001");
  });

  it("单据行金额按金额精度由数量与单价算出：单价 1.115、数量 3 得 3.35，数量 4 得 4.46", async () => {
    const { service } = createService();

    const document = await service.create(
      baseInput({ lines: [{ itemId: "item-1", quantity: "3", unitPrice: "1.115", amount: null }] }),
    );
    expect(document.lines[0]?.amount).toBe("3.35");

    const updated = await service.update(
      document.id,
      baseInput({ lines: [{ itemId: "item-1", quantity: "4", unitPrice: "1.115", amount: null }] }),
    );
    expect(updated.lines[0]?.amount).toBe("4.46");
  });

  it("单据行数量与单价按各自精度承载", async () => {
    const { service } = createService();

    const document = await service.create(baseInput());

    expect(document.lines[0]?.quantity).toBe("3.000");
    expect(document.lines[0]?.unitPrice).toBe("1.115000");
  });
});

describe("单据行校验", () => {
  it("行数量为 0 或负数时保存失败，错误消息指出数量这一项不合法", async () => {
    const { service } = createService();

    await expect(
      service.create(
        baseInput({ lines: [{ itemId: "item-1", quantity: "0", unitPrice: "1", amount: null }] }),
      ),
    ).rejects.toThrow(ValidationError);
    await expect(
      service.create(
        baseInput({ lines: [{ itemId: "item-1", quantity: "0", unitPrice: "1", amount: null }] }),
      ),
    ).rejects.toThrow("第 1 行数量必须大于 0：0");
    await expect(
      service.create(
        baseInput({ lines: [{ itemId: "item-1", quantity: "-1", unitPrice: "1", amount: null }] }),
      ),
    ).rejects.toThrow("第 1 行数量必须大于 0：-1");
  });

  it("行单价为负数时保存失败，错误消息指出单价这一项不合法", async () => {
    const { service } = createService();

    await expect(
      service.create(
        baseInput({ lines: [{ itemId: "item-1", quantity: "1", unitPrice: "-1", amount: null }] }),
      ),
    ).rejects.toThrow("第 1 行单价不能为负数：-1");
  });

  it("盘点行的实盘数量允许为 0", async () => {
    const { service } = createService();

    const document = await service.create(stocktakeInput());

    expect(document.lines[0]?.quantity).toBe("0.000");
    expect(document.lines[0]?.unitPrice).toBeNull();
    expect(document.lines[0]?.amount).toBeNull();
  });

  it("盘点行的实盘数量为负数时保存失败，错误消息指出实盘数量不能为负数", async () => {
    const { service } = createService();

    await expect(
      service.create(
        stocktakeInput({
          lines: [{ itemId: "item-1", quantity: "-1", unitPrice: null, amount: null }],
        }),
      ),
    ).rejects.toThrow("第 1 行实盘数量不能为负数：-1");
  });

  it("盘点行带单价时保存失败，错误消息指出盘点行不含单价与金额", async () => {
    const { service } = createService();

    await expect(
      service.create(
        stocktakeInput({
          lines: [{ itemId: "item-1", quantity: "1", unitPrice: "1.5", amount: null }],
        }),
      ),
    ).rejects.toThrow("第 1 行盘点行不含单价与金额");
  });

  it("盘点行带金额时保存失败，错误消息指出盘点行不含单价与金额", async () => {
    const { service } = createService();

    await expect(
      service.create(
        stocktakeInput({
          lines: [{ itemId: "item-1", quantity: "1", unitPrice: null, amount: "1.50" }],
        }),
      ),
    ).rejects.toThrow("第 1 行盘点行不含单价与金额");
  });

  it("盘点单内同一商品重复出现时保存失败，错误消息指出重复的商品", async () => {
    const { service } = createService();

    await expect(
      service.create(
        stocktakeInput({
          lines: [
            { itemId: "item-1", quantity: "1", unitPrice: null, amount: null },
            { itemId: "item-1", quantity: "2", unitPrice: null, amount: null },
          ],
        }),
      ),
    ).rejects.toThrow("盘点单内同一商品不能重复出现：item-1（第 1 行与第 2 行）");
  });

  it("其他单据类型允许同一商品出现多行，重复检查只作用在盘点单上", async () => {
    const { service } = createService();

    const document = await service.create(
      saleOutboundInput({
        lines: [
          { itemId: "item-1", quantity: "1", unitPrice: "2", amount: null },
          { itemId: "item-1", quantity: "2", unitPrice: "2", amount: null },
        ],
      }),
    );

    expect(document.lines).toHaveLength(2);
  });

  it("行缺少商品时保存失败，错误消息指出缺少商品", async () => {
    const { service } = createService();

    await expect(
      service.create(
        baseInput({ lines: [{ itemId: "", quantity: "1", unitPrice: "1", amount: null }] }),
      ),
    ).rejects.toThrow("第 1 行缺少商品");
  });

  it("行金额与数量×单价不一致时保存失败，错误消息指出金额不一致", async () => {
    const { service } = createService();

    await expect(
      service.create(
        baseInput({
          lines: [{ itemId: "item-1", quantity: "3", unitPrice: "1.115", amount: "9.99" }],
        }),
      ),
    ).rejects.toThrow("第 1 行金额与数量×单价不一致：9.99");
  });
});

describe("单据参与方与仓库校验", () => {
  it("采购入库单不填供应商时保存失败，错误消息指出缺少供应商", async () => {
    const { service } = createService();

    await expect(service.create(baseInput({ supplierId: null }))).rejects.toThrow("缺少供应商");
  });

  it("采购入库单不填目标仓库时保存失败，错误消息指出缺少目标仓库", async () => {
    const { service } = createService();

    await expect(service.create(baseInput({ targetWarehouseId: null }))).rejects.toThrow(
      "缺少目标仓库",
    );
  });

  it("销售出库单不填客户时保存失败，错误消息指出缺少客户", async () => {
    const { service } = createService();

    await expect(service.create(saleOutboundInput({ customerId: null }))).rejects.toThrow(
      "缺少客户",
    );
  });

  it("销售出库单不填来源仓库时保存失败，错误消息指出缺少来源仓库", async () => {
    const { service } = createService();

    await expect(service.create(saleOutboundInput({ sourceWarehouseId: null }))).rejects.toThrow(
      "缺少来源仓库",
    );
  });

  it("盘点单不填仓库时保存失败，错误消息指出缺少仓库", async () => {
    const { service } = createService();

    await expect(service.create(stocktakeInput({ warehouseId: null }))).rejects.toThrow("缺少仓库");
  });

  it("调拨单不填源仓时保存失败，错误消息指出缺少源仓", async () => {
    const { service } = createService();

    await expect(service.create(transferInput({ sourceWarehouseId: null }))).rejects.toThrow(
      "缺少源仓",
    );
  });

  it("调拨单不填目标仓时保存失败，错误消息指出缺少目标仓", async () => {
    const { service } = createService();

    await expect(service.create(transferInput({ targetWarehouseId: null }))).rejects.toThrow(
      "缺少目标仓",
    );
  });

  it("源仓与目标仓相同的调拨单保存失败，错误消息指出源仓与目标仓必须不同", async () => {
    const { service } = createService();

    await expect(
      service.create(transferInput({ targetWarehouseId: "warehouse-1" })),
    ).rejects.toThrow("源仓与目标仓必须不同");
  });

  it("销售退货单不给原单行引用时保存失败，错误消息指出缺少原单据行引用", async () => {
    const { service } = createService();

    await expect(service.create(baseInput({ type: "SALE_RETURN" }))).rejects.toThrow(
      "第 1 行缺少原单据行引用",
    );
  });
});

describe("草稿的编辑与删除", () => {
  it("草稿状态下修改单据行的数量与单价成功，重新打开该草稿能看到修改后的数量与单价", async () => {
    const { service } = createService();
    const created = await service.create(baseInput());

    const updated = await service.update(
      created.id,
      baseInput({
        lines: [{ itemId: "item-1", quantity: "4", unitPrice: "1.115", amount: null }],
      }),
    );
    expect(updated.lines[0]?.quantity).toBe("4.000");
    expect(updated.lines[0]?.unitPrice).toBe("1.115000");
    expect(updated.lines[0]?.amount).toBe("4.46");

    const reopened = await service.get(created.id);
    expect(reopened.lines[0]?.quantity).toBe("4.000");
    expect(reopened.lines[0]?.unitPrice).toBe("1.115000");
  });

  it("删除草稿单据成功，单据列表中不再显示被删的草稿", async () => {
    const { service } = createService();
    const created = await service.create(baseInput());

    await service.remove(created.id);

    await expect(service.list()).resolves.toEqual([]);
    await expect(service.get(created.id)).rejects.toThrow(NotFoundError);
  });

  it("列表可以按类型筛选，筛选结果只含该类型单据", async () => {
    const { service } = createService();
    await service.create(baseInput());
    await service.create(saleOutboundInput());
    await service.create(transferInput());

    const purchaseInbounds = await service.list({ type: "PURCHASE_INBOUND", status: null });

    expect(purchaseInbounds).toHaveLength(1);
    expect(purchaseInbounds[0]?.type).toBe("PURCHASE_INBOUND");
    expect(purchaseInbounds[0]?.status).toBe("DRAFT");
  });

  it("列表可以按状态筛选", async () => {
    const { service } = createService();
    await service.create(baseInput());

    const drafts = await service.list({ type: null, status: "DRAFT" });
    const posted = await service.list({ type: null, status: "POSTED" });

    expect(drafts).toHaveLength(1);
    expect(posted).toHaveLength(0);
  });
});

describe("单据状态机守卫", () => {
  const postedDocument: Document = {
    id: "doc-posted",
    documentNo: "PIN-20260102-009",
    type: "PURCHASE_INBOUND",
    status: "POSTED",
    supplierId: "supplier-1",
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: "warehouse-1",
    warehouseId: null,
    lines: [],
  };

  it("已过账单据不可改行", async () => {
    const { repository, service } = createService();
    await repository.insert(postedDocument);

    await expect(service.update("doc-posted", baseInput())).rejects.toThrow(StateConflictError);
    await expect(service.update("doc-posted", baseInput())).rejects.toThrow(
      "单据不是草稿状态，不能修改或删除：PIN-20260102-009",
    );
  });

  it("已过账单据不可删除", async () => {
    const { repository, service } = createService();
    await repository.insert(postedDocument);

    await expect(service.remove("doc-posted")).rejects.toThrow(StateConflictError);
    await expect(service.get("doc-posted")).resolves.toBeDefined();
  });

  it("已作账单据不可改行也不可删除", async () => {
    const { repository, service } = createService();
    await repository.insert({ ...postedDocument, id: "doc-voided", status: "VOIDED" });

    await expect(service.update("doc-voided", baseInput())).rejects.toThrow(StateConflictError);
    await expect(service.remove("doc-voided")).rejects.toThrow(StateConflictError);
  });

  it("状态机只允许草稿到已过账、已过账到已作废，已作废不可再作废", () => {
    expect(canTransitionDocumentStatus("DRAFT", "POSTED")).toBe(true);
    expect(canTransitionDocumentStatus("DRAFT", "VOIDED")).toBe(false);
    expect(canTransitionDocumentStatus("POSTED", "VOIDED")).toBe(true);
    expect(canTransitionDocumentStatus("VOIDED", "VOIDED")).toBe(false);
    expect(canTransitionDocumentStatus("VOIDED", "POSTED")).toBe(false);
  });

  it("非法状态流转报状态冲突", () => {
    expect(() => assertDocumentStatusTransition("VOIDED", "POSTED")).toThrow(StateConflictError);
    expect(() => assertDocumentStatusTransition("DRAFT", "VOIDED")).toThrow(
      "单据状态不能从草稿变为已作废",
    );
  });
});

describe("单据与主数据的引用关系", () => {
  it("能查出引用了某个供应商、客户或仓库的单据号", async () => {
    const { service } = createService();
    const created = await service.create(baseInput());

    const supplierReferences = await service.findMasterDataReferences("supplier-1");
    const warehouseReferences = await service.findMasterDataReferences("warehouse-1");
    const otherReferences = await service.findMasterDataReferences("supplier-2");

    expect(supplierReferences).toEqual([{ documentNo: created.documentNo }]);
    expect(warehouseReferences).toEqual([{ documentNo: created.documentNo }]);
    expect(otherReferences).toEqual([]);
  });

  it("草稿被删除后不再算作引用", async () => {
    const { service } = createService();
    const created = await service.create(baseInput());

    await service.remove(created.id);

    await expect(service.findMasterDataReferences("supplier-1")).resolves.toEqual([]);
  });
});
