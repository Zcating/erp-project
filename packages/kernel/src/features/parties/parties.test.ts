import { describe, expect, it } from "vitest";
import { DuplicateError, NotFoundError, ValidationError } from "../../shared/errors/index.js";
import {
  createInMemoryCustomerRepository,
  createInMemorySupplierRepository,
  createInMemoryWarehouseRepository,
} from "./in-memory-repository.js";
import type { CustomerInput, SupplierInput, WarehouseInput } from "./model.js";
import { createCustomerService, createSupplierService, createWarehouseService } from "./service.js";

const supplierInput = (overrides: Partial<SupplierInput> = {}): SupplierInput => ({
  code: "SUP-001",
  name: "可口可乐（中国）饮料有限公司",
  contact: "采购部 13800000000",
  ...overrides,
});

const customerInput = (overrides: Partial<CustomerInput> = {}): CustomerInput => ({
  code: "CUS-001",
  name: "杭州百货大楼",
  contact: "采购部 13900000000",
  ...overrides,
});

const warehouseInput = (overrides: Partial<WarehouseInput> = {}): WarehouseInput => ({
  code: "WH-001",
  name: "杭州总仓",
  purpose: "存放整箱饮料",
  ...overrides,
});

const createSupplierServiceFixture = () => {
  const repository = createInMemorySupplierRepository();
  let counter = 0;
  const service = createSupplierService(repository, { idGenerator: () => `supplier-${++counter}` });
  return { repository, service };
};

const createCustomerServiceFixture = () => {
  const repository = createInMemoryCustomerRepository();
  let counter = 0;
  const service = createCustomerService(repository, { idGenerator: () => `customer-${++counter}` });
  return { repository, service };
};

const createWarehouseServiceFixture = () => {
  const repository = createInMemoryWarehouseRepository();
  let counter = 0;
  const service = createWarehouseService(repository, {
    idGenerator: () => `warehouse-${++counter}`,
  });
  return { repository, service };
};

describe("参与方与仓库领域规则", () => {
  it("供应商编码为空时建档失败，错误消息指出缺少供应商编码", async () => {
    const { service } = createSupplierServiceFixture();

    await expect(service.create(supplierInput({ code: "" }))).rejects.toThrow(ValidationError);
    await expect(service.create(supplierInput({ code: "" }))).rejects.toThrow("缺少供应商编码");
  });

  it("供应商名称为空时建档失败，错误消息指出缺少供应商名称", async () => {
    const { service } = createSupplierServiceFixture();

    await expect(service.create(supplierInput({ name: "" }))).rejects.toThrow("缺少供应商名称");
  });

  it("客户编码为空时建档失败，错误消息指出缺少客户编码", async () => {
    const { service } = createCustomerServiceFixture();

    await expect(service.create(customerInput({ code: "" }))).rejects.toThrow("缺少客户编码");
  });

  it("仓库编码为空时建档失败，错误消息指出缺少仓库编码", async () => {
    const { service } = createWarehouseServiceFixture();

    await expect(service.create(warehouseInput({ code: "" }))).rejects.toThrow("缺少仓库编码");
  });

  it("仓库名称为空时建档失败，错误消息指出缺少仓库名称", async () => {
    const { service } = createWarehouseServiceFixture();

    await expect(service.create(warehouseInput({ name: "" }))).rejects.toThrow("缺少仓库名称");
  });

  it("用已存在的供应商编码再次建档失败，错误消息指出编码重复", async () => {
    const { service } = createSupplierServiceFixture();
    await service.create(supplierInput());

    await expect(service.create(supplierInput({ name: "另一家供应商" }))).rejects.toThrow(
      DuplicateError,
    );
    await expect(service.create(supplierInput({ name: "另一家供应商" }))).rejects.toThrow(
      "供应商编码重复：SUP-001",
    );
  });

  it("用已存在的客户编码再次建档失败，错误消息指出编码重复", async () => {
    const { service } = createCustomerServiceFixture();
    await service.create(customerInput());

    await expect(service.create(customerInput({ name: "另一家客户" }))).rejects.toThrow(
      "客户编码重复：CUS-001",
    );
  });

  it("用已存在的仓库编码再次建档失败，错误消息指出编码重复", async () => {
    const { service } = createWarehouseServiceFixture();
    await service.create(warehouseInput());

    await expect(service.create(warehouseInput({ name: "另一个仓库" }))).rejects.toThrow(
      "仓库编码重复：WH-001",
    );
  });

  it("编辑到别的供应商已占用的编码时报编码重复，且原供应商不受影响", async () => {
    const { service } = createSupplierServiceFixture();
    const first = await service.create(supplierInput());
    const second = await service.create(supplierInput({ code: "SUP-002" }));

    await expect(service.update(second.id, supplierInput({ code: "SUP-001" }))).rejects.toThrow(
      "供应商编码重复：SUP-001",
    );
    const unchanged = await service.get(first.id);
    expect(unchanged.code).toBe("SUP-001");
  });

  it("供应商编码与客户编码各自分域：同一个编码在两类记录里都能建档", async () => {
    const { service: supplierService } = createSupplierServiceFixture();
    const { service: customerService } = createCustomerServiceFixture();

    const supplier = await supplierService.create(supplierInput({ code: "SHARED-001" }));
    const customer = await customerService.create(customerInput({ code: "SHARED-001" }));

    expect(supplier.code).toBe("SHARED-001");
    expect(customer.code).toBe("SHARED-001");
  });

  it("建好的供应商回填录入的编码、名称与联系方式", async () => {
    const { service } = createSupplierServiceFixture();

    const supplier = await service.create(supplierInput());

    expect(supplier.code).toBe("SUP-001");
    expect(supplier.name).toBe("可口可乐（中国）饮料有限公司");
    expect(supplier.contact).toBe("采购部 13800000000");
  });

  it("建好的客户回填录入的编码、名称与联系方式", async () => {
    const { service } = createCustomerServiceFixture();

    const customer = await service.create(customerInput());

    expect(customer.code).toBe("CUS-001");
    expect(customer.name).toBe("杭州百货大楼");
    expect(customer.contact).toBe("采购部 13900000000");
  });

  it("建好的仓库回填录入的编码、名称与用途说明", async () => {
    const { service } = createWarehouseServiceFixture();

    const warehouse = await service.create(warehouseInput());

    expect(warehouse.code).toBe("WH-001");
    expect(warehouse.name).toBe("杭州总仓");
    expect(warehouse.purpose).toBe("存放整箱饮料");
  });

  it("编辑供应商的名称与联系方式后回填修改后的值", async () => {
    const { service } = createSupplierServiceFixture();
    const created = await service.create(supplierInput());

    const updated = await service.update(
      created.id,
      supplierInput({ name: "可口可乐华东贸易", contact: "销售部 13700000000" }),
    );

    expect(updated.name).toBe("可口可乐华东贸易");
    expect(updated.contact).toBe("销售部 13700000000");
    const stored = await service.get(created.id);
    expect(stored.name).toBe("可口可乐华东贸易");
    expect(stored.contact).toBe("销售部 13700000000");
  });

  it("编辑仓库的名称与用途说明后回填修改后的值", async () => {
    const { service } = createWarehouseServiceFixture();
    const created = await service.create(warehouseInput());

    const updated = await service.update(
      created.id,
      warehouseInput({ name: "杭州分仓", purpose: "存放整箱与散装饮料" }),
    );

    expect(updated.name).toBe("杭州分仓");
    expect(updated.purpose).toBe("存放整箱与散装饮料");
    const stored = await service.get(created.id);
    expect(stored.purpose).toBe("存放整箱与散装饮料");
  });

  it("删除一条供应商后列表里不再有它", async () => {
    const { service } = createSupplierServiceFixture();
    const created = await service.create(supplierInput());

    await service.remove(created.id);

    await expect(service.list()).resolves.toEqual([]);
    await expect(service.get(created.id)).rejects.toThrow(NotFoundError);
  });

  it("删除一条客户后列表里不再有它", async () => {
    const { service } = createCustomerServiceFixture();
    const created = await service.create(customerInput());

    await service.remove(created.id);

    await expect(service.list()).resolves.toEqual([]);
  });

  it("删除一条仓库后列表里不再有它", async () => {
    const { service } = createWarehouseServiceFixture();
    const created = await service.create(warehouseInput());

    await service.remove(created.id);

    await expect(service.list()).resolves.toEqual([]);
  });

  it("取不存在的记录返回查不到的错误", async () => {
    const { service } = createSupplierServiceFixture();

    await expect(service.get("missing-id")).rejects.toThrow(NotFoundError);
    await expect(service.get("missing-id")).rejects.toThrow("供应商不存在：missing-id");
  });

  it("列表按仓储返回全部记录", async () => {
    const { service } = createWarehouseServiceFixture();
    await service.create(warehouseInput());
    await service.create(warehouseInput({ code: "WH-002", name: "上海仓" }));

    const warehouses = await service.list();

    expect(warehouses.map((warehouse) => warehouse.code)).toEqual(["WH-001", "WH-002"]);
  });
});
