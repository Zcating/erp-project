import {
  createInMemoryCustomerRepository,
  createInMemoryItemMasterRepository,
  createInMemorySupplierRepository,
  createInMemoryWarehouseRepository,
} from "@erp-project/kernel";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../build-app";
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from "../session";

type PartyApp = {
  app: FastifyInstance;
  cookie: string;
};

const buildPartyApp = async (): Promise<PartyApp> => {
  const app = buildApp({
    itemMasterRepository: createInMemoryItemMasterRepository(),
    supplierRepository: createInMemorySupplierRepository(),
    customerRepository: createInMemoryCustomerRepository(),
    warehouseRepository: createInMemoryWarehouseRepository(),
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { username: DEFAULT_ADMIN_USERNAME, password: DEFAULT_ADMIN_PASSWORD },
  });
  const header = login.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined) {
    throw new Error("登录响应没有下发 set-cookie");
  }
  return { app, cookie: value.split(";")[0] ?? "" };
};

const supplierPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  code: "SUP-001",
  name: "可口可乐（中国）饮料有限公司",
  contact: "采购部 13800000000",
  ...overrides,
});

const customerPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  code: "CUS-001",
  name: "杭州百货大楼",
  contact: "采购部 13900000000",
  ...overrides,
});

const warehousePayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  code: "WH-001",
  name: "杭州总仓",
  purpose: "存放整箱饮料",
  ...overrides,
});

describe("供应商、客户与仓库 HTTP 表面", () => {
  it("参与方与仓库路由默认都要会话，无会话访问一律返回 401", async () => {
    const app = buildApp({
      itemMasterRepository: createInMemoryItemMasterRepository(),
      supplierRepository: createInMemorySupplierRepository(),
      customerRepository: createInMemoryCustomerRepository(),
      warehouseRepository: createInMemoryWarehouseRepository(),
    });

    for (const [method, url] of [
      ["GET", "/api/suppliers"],
      ["POST", "/api/suppliers"],
      ["GET", "/api/suppliers/some-id"],
      ["PUT", "/api/suppliers/some-id"],
      ["DELETE", "/api/suppliers/some-id"],
      ["GET", "/api/customers"],
      ["POST", "/api/customers"],
      ["GET", "/api/customers/some-id"],
      ["PUT", "/api/customers/some-id"],
      ["DELETE", "/api/customers/some-id"],
      ["GET", "/api/warehouses"],
      ["POST", "/api/warehouses"],
      ["GET", "/api/warehouses/some-id"],
      ["PUT", "/api/warehouses/some-id"],
      ["DELETE", "/api/warehouses/some-id"],
    ] as const) {
      const response =
        method === "GET"
          ? await app.inject({ method, url })
          : await app.inject({ method, url, payload: {} });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHENTICATED");
    }

    await app.close();
  });

  it("建好的供应商与客户在列表与编辑表单里回显编码、名称与联系方式", async () => {
    const { app, cookie } = await buildPartyApp();

    const createdSupplier = await app.inject({
      method: "POST",
      url: "/api/suppliers",
      headers: { cookie },
      payload: supplierPayload(),
    });
    expect(createdSupplier.statusCode).toBe(200);

    const createdCustomer = await app.inject({
      method: "POST",
      url: "/api/customers",
      headers: { cookie },
      payload: customerPayload(),
    });
    expect(createdCustomer.statusCode).toBe(200);

    const supplierList = await app.inject({
      method: "GET",
      url: "/api/suppliers",
      headers: { cookie },
    });
    expect(supplierList.json().data.suppliers).toEqual([
      {
        id: createdSupplier.json().data.id,
        code: "SUP-001",
        name: "可口可乐（中国）饮料有限公司",
        contact: "采购部 13800000000",
      },
    ]);

    const customerList = await app.inject({
      method: "GET",
      url: "/api/customers",
      headers: { cookie },
    });
    expect(customerList.json().data.customers).toEqual([
      {
        id: createdCustomer.json().data.id,
        code: "CUS-001",
        name: "杭州百货大楼",
        contact: "采购部 13900000000",
      },
    ]);

    const supplier = await app.inject({
      method: "GET",
      url: `/api/suppliers/${createdSupplier.json().data.id}`,
      headers: { cookie },
    });
    expect(supplier.json().data.contact).toBe("采购部 13800000000");

    const customer = await app.inject({
      method: "GET",
      url: `/api/customers/${createdCustomer.json().data.id}`,
      headers: { cookie },
    });
    expect(customer.json().data.contact).toBe("采购部 13900000000");

    await app.close();
  });

  it("新建的仓库出现在仓库列表中，字段值与录入一致", async () => {
    const { app, cookie } = await buildPartyApp();

    const created = await app.inject({
      method: "POST",
      url: "/api/warehouses",
      headers: { cookie },
      payload: warehousePayload(),
    });

    expect(created.statusCode).toBe(200);
    expect(created.json().data.code).toBe("WH-001");
    expect(created.json().data.name).toBe("杭州总仓");
    expect(created.json().data.purpose).toBe("存放整箱饮料");

    const list = await app.inject({
      method: "GET",
      url: "/api/warehouses",
      headers: { cookie },
    });
    expect(list.json().data.warehouses).toEqual([
      {
        id: created.json().data.id,
        code: "WH-001",
        name: "杭州总仓",
        purpose: "存放整箱饮料",
      },
    ]);

    await app.close();
  });

  it("供应商编码重复时新建失败并指出编码重复，列表里不出现第二条", async () => {
    const { app, cookie } = await buildPartyApp();
    await app.inject({
      method: "POST",
      url: "/api/suppliers",
      headers: { cookie },
      payload: supplierPayload(),
    });

    const rejected = await app.inject({
      method: "POST",
      url: "/api/suppliers",
      headers: { cookie },
      payload: supplierPayload({ name: "另一家供应商" }),
    });

    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe("DUPLICATE");
    expect(rejected.json().error.message).toContain("供应商编码重复");

    const list = await app.inject({
      method: "GET",
      url: "/api/suppliers",
      headers: { cookie },
    });
    expect(list.json().data.suppliers).toHaveLength(1);

    await app.close();
  });

  it("客户编码重复时新建失败并指出编码重复，列表里不出现第二条", async () => {
    const { app, cookie } = await buildPartyApp();
    await app.inject({
      method: "POST",
      url: "/api/customers",
      headers: { cookie },
      payload: customerPayload(),
    });

    const rejected = await app.inject({
      method: "POST",
      url: "/api/customers",
      headers: { cookie },
      payload: customerPayload({ name: "另一家客户" }),
    });

    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe("DUPLICATE");
    expect(rejected.json().error.message).toContain("客户编码重复");

    const list = await app.inject({
      method: "GET",
      url: "/api/customers",
      headers: { cookie },
    });
    expect(list.json().data.customers).toHaveLength(1);

    await app.close();
  });

  it("供应商编码与客户编码各自分域：客户编码与既有供应商编码字面相同仍能创建成功", async () => {
    const { app, cookie } = await buildPartyApp();
    await app.inject({
      method: "POST",
      url: "/api/suppliers",
      headers: { cookie },
      payload: supplierPayload({ code: "SHARED-001" }),
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/customers",
      headers: { cookie },
      payload: customerPayload({ code: "SHARED-001" }),
    });

    expect(created.statusCode).toBe(200);
    expect(created.json().data.code).toBe("SHARED-001");

    const supplierList = await app.inject({
      method: "GET",
      url: "/api/suppliers",
      headers: { cookie },
    });
    const customerList = await app.inject({
      method: "GET",
      url: "/api/customers",
      headers: { cookie },
    });
    expect(supplierList.json().data.suppliers).toHaveLength(1);
    expect(customerList.json().data.customers).toHaveLength(1);

    await app.close();
  });

  it("仓库编码重复时新建失败并指出编码重复，仓库列表里不出现第二条同编码仓库", async () => {
    const { app, cookie } = await buildPartyApp();
    await app.inject({
      method: "POST",
      url: "/api/warehouses",
      headers: { cookie },
      payload: warehousePayload(),
    });

    const rejected = await app.inject({
      method: "POST",
      url: "/api/warehouses",
      headers: { cookie },
      payload: warehousePayload({ name: "另一个仓库" }),
    });

    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe("DUPLICATE");
    expect(rejected.json().error.message).toContain("仓库编码重复");

    const list = await app.inject({
      method: "GET",
      url: "/api/warehouses",
      headers: { cookie },
    });
    expect(list.json().data.warehouses).toHaveLength(1);

    await app.close();
  });

  it("缺少编码或名称时新建失败，错误消息指出缺哪一项", async () => {
    const { app, cookie } = await buildPartyApp();

    const withoutSupplierCode = await app.inject({
      method: "POST",
      url: "/api/suppliers",
      headers: { cookie },
      payload: supplierPayload({ code: "" }),
    });
    expect(withoutSupplierCode.statusCode).toBe(400);
    expect(withoutSupplierCode.json().error.code).toBe("VALIDATION");
    expect(withoutSupplierCode.json().error.message).toContain("缺少供应商编码");

    const withoutCustomerName = await app.inject({
      method: "POST",
      url: "/api/customers",
      headers: { cookie },
      payload: customerPayload({ name: "" }),
    });
    expect(withoutCustomerName.statusCode).toBe(400);
    expect(withoutCustomerName.json().error.message).toContain("缺少客户名称");

    const withoutWarehouseCode = await app.inject({
      method: "POST",
      url: "/api/warehouses",
      headers: { cookie },
      payload: warehousePayload({ code: "" }),
    });
    expect(withoutWarehouseCode.statusCode).toBe(400);
    expect(withoutWarehouseCode.json().error.message).toContain("缺少仓库编码");

    await app.close();
  });

  it("编辑供应商、仓库后回填修改后的值", async () => {
    const { app, cookie } = await buildPartyApp();
    const createdSupplier = await app.inject({
      method: "POST",
      url: "/api/suppliers",
      headers: { cookie },
      payload: supplierPayload(),
    });
    const createdWarehouse = await app.inject({
      method: "POST",
      url: "/api/warehouses",
      headers: { cookie },
      payload: warehousePayload(),
    });

    const updatedSupplier = await app.inject({
      method: "PUT",
      url: `/api/suppliers/${createdSupplier.json().data.id}`,
      headers: { cookie },
      payload: supplierPayload({ name: "可口可乐华东贸易", contact: "销售部 13700000000" }),
    });
    expect(updatedSupplier.statusCode).toBe(200);
    expect(updatedSupplier.json().data.name).toBe("可口可乐华东贸易");
    expect(updatedSupplier.json().data.contact).toBe("销售部 13700000000");

    const updatedWarehouse = await app.inject({
      method: "PUT",
      url: `/api/warehouses/${createdWarehouse.json().data.id}`,
      headers: { cookie },
      payload: warehousePayload({ name: "杭州分仓", purpose: "存放整箱与散装饮料" }),
    });
    expect(updatedWarehouse.statusCode).toBe(200);
    expect(updatedWarehouse.json().data.name).toBe("杭州分仓");
    expect(updatedWarehouse.json().data.purpose).toBe("存放整箱与散装饮料");

    const fetchedWarehouse = await app.inject({
      method: "GET",
      url: `/api/warehouses/${createdWarehouse.json().data.id}`,
      headers: { cookie },
    });
    expect(fetchedWarehouse.json().data.purpose).toBe("存放整箱与散装饮料");

    await app.close();
  });

  it("删除一条没有被任何单据引用的供应商、客户与仓库成功，对应列表中不再出现该条记录", async () => {
    const { app, cookie } = await buildPartyApp();
    const createdSupplier = await app.inject({
      method: "POST",
      url: "/api/suppliers",
      headers: { cookie },
      payload: supplierPayload(),
    });
    const createdCustomer = await app.inject({
      method: "POST",
      url: "/api/customers",
      headers: { cookie },
      payload: customerPayload(),
    });
    const createdWarehouse = await app.inject({
      method: "POST",
      url: "/api/warehouses",
      headers: { cookie },
      payload: warehousePayload(),
    });

    for (const url of [
      `/api/suppliers/${createdSupplier.json().data.id}`,
      `/api/customers/${createdCustomer.json().data.id}`,
      `/api/warehouses/${createdWarehouse.json().data.id}`,
    ]) {
      const deleted = await app.inject({ method: "DELETE", url, headers: { cookie } });
      expect(deleted.statusCode).toBe(200);
    }

    const supplierList = await app.inject({
      method: "GET",
      url: "/api/suppliers",
      headers: { cookie },
    });
    const customerList = await app.inject({
      method: "GET",
      url: "/api/customers",
      headers: { cookie },
    });
    const warehouseList = await app.inject({
      method: "GET",
      url: "/api/warehouses",
      headers: { cookie },
    });
    expect(supplierList.json().data.suppliers).toEqual([]);
    expect(customerList.json().data.customers).toEqual([]);
    expect(warehouseList.json().data.warehouses).toEqual([]);

    await app.close();
  });
});
