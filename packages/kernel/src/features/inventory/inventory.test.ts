import { describe, expect, it } from "vitest";
import { createInMemoryStockLedgerRepository } from "./in-memory-repository";
import type { StockLedgerEntry } from "./model";
import { createInventoryQueryService } from "./service";

const entry = (overrides: Partial<StockLedgerEntry> = {}): StockLedgerEntry => ({
  documentId: "doc-1",
  documentNo: "PIN-20260101-001",
  lineNo: 1,
  warehouseId: "warehouse-1",
  itemId: "item-1",
  direction: "POST",
  quantityBefore: "0.000",
  quantityAfter: "12.000",
  costBefore: "0.000000",
  costAfter: "1.115000",
  unitPrice: "1.115000",
  amount: "13.38",
  ...overrides,
});

describe("库存查询与库存流水", () => {
  it("库存查询返回的每条记录同时含 onHand、available、inTransit 三个字段，字段名逐字匹配", async () => {
    const ledger = createInMemoryStockLedgerRepository();
    const service = createInventoryQueryService(ledger);
    await ledger.saveBalance({
      warehouseId: "warehouse-1",
      itemId: "item-1",
      quantity: "7.000",
      unitCost: "1.115000",
    });

    const balances = await service.listBalances({
      warehouseId: "warehouse-1",
      itemId: null,
    });

    expect(balances).toHaveLength(1);
    expect(Object.keys(balances[0] ?? {})).toContain("onHand");
    expect(Object.keys(balances[0] ?? {})).toContain("available");
    expect(Object.keys(balances[0] ?? {})).toContain("inTransit");
  });

  it("库存查询的响应里没有名为 quantity 的字段", async () => {
    const ledger = createInMemoryStockLedgerRepository();
    const service = createInventoryQueryService(ledger);
    await ledger.saveBalance({
      warehouseId: "warehouse-1",
      itemId: "item-1",
      quantity: "7.000",
      unitCost: "1.115000",
    });

    const balances = await service.listBalances({
      warehouseId: "warehouse-1",
      itemId: null,
    });

    expect(Object.keys(balances[0] ?? {})).not.toContain("quantity");
    expect(JSON.stringify(balances)).not.toContain('"quantity"');
  });

  it("本版本可用库存等于账面库存：账面为 7 时返回的账面库存为 7、可用库存为 7", async () => {
    const ledger = createInMemoryStockLedgerRepository();
    const service = createInventoryQueryService(ledger);
    await ledger.saveBalance({
      warehouseId: "warehouse-1",
      itemId: "item-1",
      quantity: "7.000",
      unitCost: "1.115000",
    });

    const balances = await service.listBalances({
      warehouseId: "warehouse-1",
      itemId: null,
    });

    expect(balances[0]?.onHand).toBe("7.000");
    expect(balances[0]?.available).toBe("7.000");
    expect(balances[0]?.unitCost).toBe("1.115000");
  });

  it("在途字段本票恒为 0：字段存在、类型是十进制文本，取值为 0.000", async () => {
    const ledger = createInMemoryStockLedgerRepository();
    const service = createInventoryQueryService(ledger);
    await ledger.saveBalance({
      warehouseId: "warehouse-1",
      itemId: "item-1",
      quantity: "7.000",
      unitCost: "1.115000",
    });

    const balances = await service.listBalances({
      warehouseId: "warehouse-1",
      itemId: null,
    });

    expect(balances[0]?.inTransit).toBe("0.000");
    expect(typeof balances[0]?.inTransit).toBe("string");
  });

  it("库存查询可按仓库与商品过滤", async () => {
    const ledger = createInMemoryStockLedgerRepository();
    const service = createInventoryQueryService(ledger);
    await ledger.saveBalance({
      warehouseId: "warehouse-1",
      itemId: "item-1",
      quantity: "7.000",
      unitCost: "1.115000",
    });
    await ledger.saveBalance({
      warehouseId: "warehouse-2",
      itemId: "item-1",
      quantity: "3.000",
      unitCost: "1.115000",
    });
    await ledger.saveBalance({
      warehouseId: "warehouse-1",
      itemId: "item-2",
      quantity: "5.000",
      unitCost: "1.115000",
    });

    const byWarehouse = await service.listBalances({
      warehouseId: "warehouse-1",
      itemId: null,
    });
    expect(byWarehouse.map((balance) => balance.itemId)).toEqual(["item-1", "item-2"]);

    const byItem = await service.listBalances({
      warehouseId: null,
      itemId: "item-1",
    });
    expect(byItem.map((balance) => balance.warehouseId)).toEqual(["warehouse-1", "warehouse-2"]);

    const byBoth = await service.listBalances({
      warehouseId: "warehouse-2",
      itemId: "item-1",
    });
    expect(byBoth).toHaveLength(1);
    expect(byBoth[0]?.onHand).toBe("3.000");
  });

  it("库存流水可按单据号查到该单产生的全部流水行，每行含单据号、行号、变动前后数量与成本、单价与结转金额", async () => {
    const ledger = createInMemoryStockLedgerRepository();
    const service = createInventoryQueryService(ledger);
    await ledger.appendEntries([
      entry(),
      entry({ lineNo: 2, quantityBefore: "12.000", quantityAfter: "20.000", amount: "8.92" }),
    ]);
    await ledger.appendEntries([entry({ documentId: "doc-2", documentNo: "PIN-20260102-001" })]);

    const movements = await service.listMovements({
      documentNo: "PIN-20260101-001",
      warehouseId: null,
      itemId: null,
      lineNo: null,
      occurredFrom: null,
      occurredTo: null,
      order: "asc",
    });

    expect(movements).toHaveLength(2);
    expect(movements[0]).toMatchObject({
      documentNo: "PIN-20260101-001",
      lineNo: 1,
      quantityBefore: "0.000",
      quantityAfter: "12.000",
      costBefore: "0.000000",
      costAfter: "1.115000",
      unitPrice: "1.115000",
      amount: "13.38",
    });
    expect(movements[1]?.lineNo).toBe(2);
  });

  it("库存流水可按行号、仓库、商品与时间筛选，并可按发生时间排序", async () => {
    const ledger = createInMemoryStockLedgerRepository();
    const service = createInventoryQueryService(ledger);
    await ledger.appendEntries([
      entry({ lineNo: 1 }),
      entry({ documentId: "doc-2", documentNo: "PIN-20260102-001", lineNo: 2 }),
      entry({
        documentId: "doc-3",
        documentNo: "PIN-20260102-001",
        lineNo: 2,
        warehouseId: "warehouse-2",
        itemId: "item-2",
      }),
    ]);

    const byLineNo = await service.listMovements({
      documentNo: null,
      warehouseId: null,
      itemId: null,
      lineNo: 2,
      occurredFrom: null,
      occurredTo: null,
      order: "asc",
    });
    expect(byLineNo).toHaveLength(2);

    const byWarehouse = await service.listMovements({
      documentNo: null,
      warehouseId: "warehouse-2",
      itemId: null,
      lineNo: null,
      occurredFrom: null,
      occurredTo: null,
      order: "asc",
    });
    expect(byWarehouse).toHaveLength(1);
    expect(byWarehouse[0]?.itemId).toBe("item-2");

    const byItem = await service.listMovements({
      documentNo: null,
      warehouseId: null,
      itemId: "item-1",
      lineNo: null,
      occurredFrom: null,
      occurredTo: null,
      order: "asc",
    });
    expect(byItem).toHaveLength(2);

    const inRange = await service.listMovements({
      documentNo: null,
      warehouseId: null,
      itemId: null,
      lineNo: null,
      occurredFrom: "2000-01-01T00:00:00.000Z",
      occurredTo: "2100-01-01T00:00:00.000Z",
      order: "asc",
    });
    expect(inRange).toHaveLength(3);

    const outOfRange = await service.listMovements({
      documentNo: null,
      warehouseId: null,
      itemId: null,
      lineNo: null,
      occurredFrom: "2100-01-01T00:00:00.000Z",
      occurredTo: null,
      order: "asc",
    });
    expect(outOfRange).toEqual([]);

    const descending = await service.listMovements({
      documentNo: null,
      warehouseId: null,
      itemId: null,
      lineNo: null,
      occurredFrom: null,
      occurredTo: null,
      order: "desc",
    });
    expect(descending.map((movement) => movement.documentNo)).toEqual([
      "PIN-20260102-001",
      "PIN-20260102-001",
      "PIN-20260101-001",
    ]);
  });

  it("每笔库存流水都带发生时间，类型是 ISO 时间文本", async () => {
    const ledger = createInMemoryStockLedgerRepository();
    const service = createInventoryQueryService(ledger);
    await ledger.appendEntries([entry()]);

    const movements = await service.listMovements({
      documentNo: null,
      warehouseId: null,
      itemId: null,
      lineNo: null,
      occurredFrom: null,
      occurredTo: null,
      order: "asc",
    });

    expect(typeof movements[0]?.occurredAt).toBe("string");
    expect(Number.isNaN(Date.parse(movements[0]?.occurredAt ?? ""))).toBe(false);
  });
});
