import { describe, expect, it } from "vitest";
import { createInMemoryDocumentRepository } from "../documents/in-memory-repository.js";
import type { DocumentInput } from "../documents/model.js";
import { createDocumentService } from "../documents/service.js";
import { createInMemoryItemMasterRepository } from "../item-master/in-memory-repository.js";
import { createItemMasterService } from "../item-master/service.js";
import { createInMemoryStockLedgerRepository } from "../inventory/in-memory-repository.js";
import { createPostingService } from "../posting/service.js";
import { createPurchaseInboundPostingHandler } from "./purchase-inbound-posting.js";

const FIXED_CLOCK = new Date("2026-01-02T03:04:05Z");

const createFixture = async () => {
  const documents = createInMemoryDocumentRepository();
  const ledger = createInMemoryStockLedgerRepository();
  const items = createInMemoryItemMasterRepository();
  const itemService = createItemMasterService(items);
  let counter = 0;
  const documentService = createDocumentService(documents, {
    idGenerator: () => `doc-${++counter}`,
    clock: () => FIXED_CLOCK,
    timeZone: "Asia/Shanghai",
    itemLookup: items,
  });
  const postingService = createPostingService({
    documents,
    ledger,
    handlers: [createPurchaseInboundPostingHandler(ledger)],
  });
  const item = await itemService.create({
    code: "SKU-001",
    barcode: null,
    name: "可口可乐",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }],
  });
  return { documents, ledger, documentService, postingService, item };
};

const purchaseInboundInput = (
  itemId: string,
  overrides: Partial<DocumentInput> = {},
): DocumentInput => ({
  type: "PURCHASE_INBOUND",
  supplierId: "supplier-1",
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: "warehouse-1",
  warehouseId: null,
  lines: [{ itemId, quantity: "12", unitPrice: "1.115", amount: null }],
  ...overrides,
});

describe("采购入库过账的库存影响", () => {
  it("过账后目标仓该商品的账面库存增加该行数量", async () => {
    const { ledger, documentService, postingService, item } = await createFixture();
    const document = await documentService.create(purchaseInboundInput(item.id));

    await postingService.post(document.id);

    const balance = await ledger.findBalance("warehouse-1", item.id);
    expect(balance?.quantity).toBe("12.000");
  });

  it("过账前没有库存时，过账后的加权平均成本等于该行的入库单价", async () => {
    const { ledger, documentService, postingService, item } = await createFixture();
    const document = await documentService.create(purchaseInboundInput(item.id));

    await postingService.post(document.id);

    const balance = await ledger.findBalance("warehouse-1", item.id);
    expect(balance?.unitCost).toBe("1.115000");
  });

  it("目标仓该商品原有 6 瓶、加权平均成本 2.00 时，再过账 6 瓶、单价 4.00，加权平均成本变为 3.00", async () => {
    const { ledger, documentService, postingService, item } = await createFixture();
    const first = await documentService.create(
      purchaseInboundInput(item.id, {
        lines: [{ itemId: item.id, quantity: "6", unitPrice: "2", amount: null }],
      }),
    );
    await postingService.post(first.id);

    const second = await documentService.create(
      purchaseInboundInput(item.id, {
        lines: [{ itemId: item.id, quantity: "6", unitPrice: "4", amount: null }],
      }),
    );
    await postingService.post(second.id);

    const balance = await ledger.findBalance("warehouse-1", item.id);
    expect(balance?.quantity).toBe("12.000");
    expect(balance?.unitCost).toBe("3.000000");
  });

  it("同一商品在另一个仓库的加权平均成本与账面数量都不因本次入库发生变化", async () => {
    const { ledger, documentService, postingService, item } = await createFixture();
    const inOtherWarehouse = await documentService.create(
      purchaseInboundInput(item.id, {
        targetWarehouseId: "warehouse-2",
        lines: [{ itemId: item.id, quantity: "5", unitPrice: "7", amount: null }],
      }),
    );
    await postingService.post(inOtherWarehouse.id);

    const document = await documentService.create(purchaseInboundInput(item.id));
    await postingService.post(document.id);

    const other = await ledger.findBalance("warehouse-2", item.id);
    expect(other?.quantity).toBe("5.000");
    expect(other?.unitCost).toBe("7.000000");
    const target = await ledger.findBalance("warehouse-1", item.id);
    expect(target?.quantity).toBe("12.000");
    expect(target?.unitCost).toBe("1.115000");
  });

  it("按辅助计量单位「1 箱 = 12 瓶」录入 1 箱并过账后，目标仓该商品的账面库存增加 12 而不是 1", async () => {
    const { ledger, documentService, postingService, item } = await createFixture();
    const document = await documentService.create(
      purchaseInboundInput(item.id, {
        lines: [{ itemId: item.id, quantity: "1", unitPrice: "1.115", amount: null, unit: "箱" }],
      }),
    );

    await postingService.post(document.id);

    const balance = await ledger.findBalance("warehouse-1", item.id);
    expect(balance?.quantity).toBe("12.000");
  });

  it("过账生成的库存流水记录该行的变动前后数量、变动前后成本、该行单价与结转金额", async () => {
    const { ledger, documentService, postingService, item } = await createFixture();
    const document = await documentService.create(purchaseInboundInput(item.id));

    await postingService.post(document.id);

    const entries = await ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      documentNo: document.documentNo,
      lineNo: 1,
      warehouseId: "warehouse-1",
      itemId: item.id,
      direction: "POST",
      quantityBefore: "0.000",
      quantityAfter: "12.000",
      costBefore: "0.000000",
      costAfter: "1.115000",
      unitPrice: "1.115000",
      amount: "13.38",
    });
  });

  it("流水记录的结转金额字段为 13.38，数量字段为 12，单价字段为 1.115", async () => {
    const { ledger, documentService, postingService, item } = await createFixture();
    const document = await documentService.create(purchaseInboundInput(item.id));

    await postingService.post(document.id);

    const entries = await ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries[0]?.amount).toBe("13.38");
    expect(entries[0]?.quantityAfter).toBe("12.000");
    expect(entries[0]?.unitPrice).toBe("1.115000");
  });

  it("同一单多行时流水行号连续", async () => {
    const { ledger, documentService, postingService, item } = await createFixture();
    const document = await documentService.create(
      purchaseInboundInput(item.id, {
        lines: [
          { itemId: item.id, quantity: "3", unitPrice: "1.115", amount: null },
          { itemId: item.id, quantity: "4", unitPrice: "2", amount: null },
        ],
      }),
    );

    await postingService.post(document.id);

    const entries = await ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries.map((entry) => entry.lineNo)).toEqual([1, 2]);
  });

  it("已过账的采购入库单作废后，账面库存与加权平均成本回到过账前，并新增一条数量相反的反向流水", async () => {
    const { ledger, documentService, postingService, item } = await createFixture();
    const document = await documentService.create(purchaseInboundInput(item.id));
    await postingService.post(document.id);

    await postingService.void(document.id);

    const balance = await ledger.findBalance("warehouse-1", item.id);
    expect(balance?.quantity).toBe("0.000");
    expect(balance?.unitCost).toBe("0.000000");

    const entries = await ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(2);
    expect(entries[1]?.direction).toBe("REVERSAL");
    expect(entries[1]?.quantityBefore).toBe("12.000");
    expect(entries[1]?.quantityAfter).toBe("0.000");
    expect(entries[1]?.amount).toBe("-13.38");
  });

  it("作废后库存与成本回到过账前的数值，多张单据叠加时只冲销本单的那一次变动", async () => {
    const { ledger, documentService, postingService, item } = await createFixture();
    const first = await documentService.create(
      purchaseInboundInput(item.id, {
        lines: [{ itemId: item.id, quantity: "6", unitPrice: "2", amount: null }],
      }),
    );
    await postingService.post(first.id);
    const second = await documentService.create(
      purchaseInboundInput(item.id, {
        lines: [{ itemId: item.id, quantity: "6", unitPrice: "4", amount: null }],
      }),
    );
    await postingService.post(second.id);

    await postingService.void(second.id);

    const balance = await ledger.findBalance("warehouse-1", item.id);
    expect(balance?.quantity).toBe("6.000");
    expect(balance?.unitCost).toBe("2.000000");
  });

  it("处于草稿的单据在库存流水里查不到任何记录", async () => {
    const { ledger, documentService, item } = await createFixture();
    const document = await documentService.create(purchaseInboundInput(item.id));

    expect(await ledger.listEntriesByDocumentNo(document.documentNo)).toEqual([]);
    expect(await ledger.findBalance("warehouse-1", item.id)).toBeNull();
  });
});
