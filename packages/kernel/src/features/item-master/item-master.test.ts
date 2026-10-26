import { describe, expect, it } from "vitest";
import { DuplicateError, NotFoundError, ValidationError } from "../../shared/errors";
import type { TransactionContext, TransactionRunner } from "../../shared/transactions";
import { createInMemoryItemMasterRepository } from "./in-memory-repository";
import type { ItemMasterInput } from "./model";
import type { ItemMasterRepository } from "./ports";
import { createItemMasterService } from "./service";

const baseInput = (overrides: Partial<ItemMasterInput> = {}): ItemMasterInput => ({
  code: "SKU-001",
  barcode: "6901234567892",
  name: "可口可乐",
  specification: "500ml/瓶",
  brand: "可口可乐",
  category: "饮料",
  baseUnit: "瓶",
  auxiliaryUnits: [],
  ...overrides,
});

const createService = () => {
  const repository = createInMemoryItemMasterRepository();
  let counter = 0;
  const service = createItemMasterService(repository, { idGenerator: () => `id-${++counter}` });
  return { repository, service };
};

describe("商品档案领域规则", () => {
  it("名称为空时建档失败，错误消息指出缺少商品名称", async () => {
    const { service } = createService();

    await expect(service.create(baseInput({ name: "" }))).rejects.toThrow(ValidationError);
    await expect(service.create(baseInput({ name: "" }))).rejects.toThrow("缺少商品名称");
  });

  it("未指定基本计量单位时建档失败，错误消息指出缺少基本计量单位", async () => {
    const { service } = createService();

    await expect(service.create(baseInput({ baseUnit: "" }))).rejects.toThrow("缺少基本计量单位");
  });

  it("换算率 1.123456 保存成功，并按 6 位小数承载", async () => {
    const { service } = createService();

    const item = await service.create(
      baseInput({ auxiliaryUnits: [{ unit: "箱", conversionRate: "1.123456" }] }),
    );

    expect(item.auxiliaryUnits).toEqual([{ unit: "箱", conversionRate: "1.123456" }]);
  });

  it("换算率 1.1234567、0、-1 建档失败，错误消息指出换算率非法", async () => {
    const { service } = createService();

    await expect(
      service.create(baseInput({ auxiliaryUnits: [{ unit: "箱", conversionRate: "1.1234567" }] })),
    ).rejects.toThrow("单位换算率最多 6 位小数：1.1234567");
    await expect(
      service.create(baseInput({ auxiliaryUnits: [{ unit: "箱", conversionRate: "0" }] })),
    ).rejects.toThrow("单位换算率必须为正数：0");
    await expect(
      service.create(baseInput({ auxiliaryUnits: [{ unit: "箱", conversionRate: "-1" }] })),
    ).rejects.toThrow("单位换算率必须为正数：-1");
  });

  it("换算率为空时报出缺少单位换算率，与填了非正数区分开", async () => {
    const { service } = createService();

    await expect(
      service.create(baseInput({ auxiliaryUnits: [{ unit: "箱", conversionRate: "" }] })),
    ).rejects.toThrow("缺少单位换算率");
    await expect(
      service.create(baseInput({ auxiliaryUnits: [{ unit: "箱", conversionRate: "0" }] })),
    ).rejects.toThrow("单位换算率必须为正数：0");
    await expect(
      service.create(baseInput({ auxiliaryUnits: [{ unit: "箱", conversionRate: "-1" }] })),
    ).rejects.toThrow("单位换算率必须为正数：-1");
  });

  it("一条档案可以同时挂多个辅助计量单位，各自带自己的换算率", async () => {
    const { service } = createService();

    const item = await service.create(
      baseInput({
        auxiliaryUnits: [
          { unit: "箱", conversionRate: "12" },
          { unit: "包", conversionRate: "6" },
        ],
      }),
    );

    expect(item.auxiliaryUnits).toEqual([
      { unit: "箱", conversionRate: "12.000000" },
      { unit: "包", conversionRate: "6.000000" },
    ]);
  });

  it("用已存在的商品编码再次建档失败，错误消息指出编码重复", async () => {
    const { service } = createService();
    await service.create(baseInput());

    await expect(service.create(baseInput({ barcode: "6909999999999" }))).rejects.toThrow(
      DuplicateError,
    );
    await expect(service.create(baseInput({ barcode: "6909999999999" }))).rejects.toThrow(
      "商品编码重复：SKU-001",
    );
  });

  it("商品条码非空且重复时建档失败，错误消息指出条码重复", async () => {
    const { service } = createService();
    await service.create(baseInput());

    await expect(service.create(baseInput({ code: "SKU-002" }))).rejects.toThrow(
      "商品条码重复：6901234567892",
    );
  });

  it("商品条码留空时建档成功", async () => {
    const { service } = createService();

    const item = await service.create(baseInput({ barcode: null }));

    expect(item.barcode).toBeNull();
  });

  it("按商品条码查询返回对应档案，未知条码返回查不到档案的错误", async () => {
    const { service } = createService();
    await service.create(baseInput());

    const found = await service.findByBarcode("6901234567892");

    expect(found.code).toBe("SKU-001");
    await expect(service.findByBarcode("0000000000000")).rejects.toThrow(NotFoundError);
    await expect(service.findByBarcode("0000000000000")).rejects.toThrow(
      "查不到条码对应的商品档案：0000000000000",
    );
  });

  it("编辑名称与辅助单位换算率后，档案回填修改后的值", async () => {
    const { service } = createService();
    const created = await service.create(
      baseInput({ auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }] }),
    );

    const updated = await service.update(
      created.id,
      baseInput({
        name: "可口可乐零度",
        auxiliaryUnits: [{ unit: "箱", conversionRate: "24" }],
      }),
    );

    expect(updated.name).toBe("可口可乐零度");
    expect(updated.auxiliaryUnits).toEqual([{ unit: "箱", conversionRate: "24.000000" }]);
    const stored = await service.get(created.id);
    expect(stored.name).toBe("可口可乐零度");
    expect(stored.auxiliaryUnits).toEqual([{ unit: "箱", conversionRate: "24.000000" }]);
  });

  it("删除一条档案后列表里不再有它，按条码也查不到", async () => {
    const { service } = createService();
    const created = await service.create(baseInput());

    await service.remove(created.id);

    await expect(service.list()).resolves.toEqual([]);
    await expect(service.findByBarcode("6901234567892")).rejects.toThrow(NotFoundError);
  });

  it("编辑到别的档案已占用的编码时报编码重复，且原档案不受影响", async () => {
    const { service } = createService();
    const first = await service.create(baseInput());
    const second = await service.create(baseInput({ code: "SKU-002", barcode: null }));

    await expect(
      service.update(second.id, baseInput({ code: "SKU-001", barcode: null })),
    ).rejects.toThrow("商品编码重复：SKU-001");
    const unchanged = await service.get(first.id);
    expect(unchanged.code).toBe("SKU-001");
  });
});

describe("商品档案建档的事务编排", () => {
  const createRecordingService = () => {
    const inner = createInMemoryItemMasterRepository();
    const insertContexts: (TransactionContext | undefined)[] = [];
    const repository: ItemMasterRepository = {
      ...inner,
      async insert(item, context) {
        insertContexts.push(context);
        await inner.insert(item, context);
      },
    };
    const transactionIds: string[] = [];
    const runner: TransactionRunner = {
      async run(work) {
        const context: TransactionContext = {
          transactionId: `tx-${transactionIds.length + 1}`,
          handle: `handle-${transactionIds.length + 1}`,
        };
        transactionIds.push(context.transactionId);
        return work(context);
      },
    };
    const service = createItemMasterService(repository, { runner, idGenerator: () => "id-1" });
    return { service, insertContexts, transactionIds };
  };

  it("建档时自己开一个事务，事务上下文交给仓储", async () => {
    const { service, insertContexts, transactionIds } = createRecordingService();

    await service.create(baseInput());

    expect(transactionIds).toEqual(["tx-1"]);
    expect(insertContexts).toHaveLength(1);
    expect(insertContexts[0]?.transactionId).toBe("tx-1");
  });

  it("已有外层事务上下文时复用它，不再另起事务", async () => {
    const { service, insertContexts, transactionIds } = createRecordingService();
    const outer: TransactionContext = { transactionId: "outer", handle: "outer-handle" };

    await service.create(baseInput(), outer);

    expect(transactionIds).toEqual([]);
    expect(insertContexts[0]).toBe(outer);
  });
});
