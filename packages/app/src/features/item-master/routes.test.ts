import { createInMemoryItemMasterRepository } from "@erp-inventory-sales/kernel";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../build-app.js";
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from "../session/index.js";

type ItemApp = {
  app: FastifyInstance;
  cookie: string;
};

const buildItemApp = async (): Promise<ItemApp> => {
  const app = buildApp({ itemMasterRepository: createInMemoryItemMasterRepository() });
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

const itemPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
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

describe("商品档案 HTTP 表面", () => {
  it("商品档案路由默认都要会话，无会话访问一律返回 401", async () => {
    const app = buildApp({ itemMasterRepository: createInMemoryItemMasterRepository() });

    for (const [method, url] of [
      ["GET", "/api/items"],
      ["POST", "/api/items"],
      ["GET", "/api/items/some-id"],
      ["GET", "/api/items/by-barcode/6901234567892"],
      ["PUT", "/api/items/some-id"],
      ["DELETE", "/api/items/some-id"],
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

  it("名称为空时建档返回 400 与 VALIDATION，错误消息指出缺少商品名称", async () => {
    const { app, cookie } = await buildItemApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/items",
      headers: { cookie },
      payload: itemPayload({ name: "" }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");
    expect(response.json().error.message).toContain("缺少商品名称");

    await app.close();
  });

  it("未指定基本计量单位时建档返回 400，错误消息指出缺少基本计量单位", async () => {
    const { app, cookie } = await buildItemApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/items",
      headers: { cookie },
      payload: itemPayload({ baseUnit: "" }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain("缺少基本计量单位");

    await app.close();
  });

  it("换算率 1.123456 保存成功，1.1234567、0、-1 建档失败并指出换算率非法", async () => {
    const { app, cookie } = await buildItemApp();

    const accepted = await app.inject({
      method: "POST",
      url: "/api/items",
      headers: { cookie },
      payload: itemPayload({ auxiliaryUnits: [{ unit: "箱", conversionRate: "1.123456" }] }),
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().data.auxiliaryUnits).toEqual([
      { unit: "箱", conversionRate: "1.123456" },
    ]);

    for (const conversionRate of ["1.1234567", "0", "-1"]) {
      const rejected = await app.inject({
        method: "POST",
        url: "/api/items",
        headers: { cookie },
        payload: itemPayload({
          code: `SKU-${conversionRate}`,
          auxiliaryUnits: [{ unit: "箱", conversionRate }],
        }),
      });

      expect(rejected.statusCode).toBe(400);
      expect(rejected.json().error.code).toBe("VALIDATION");
      expect(rejected.json().error.message).toContain("单位换算率");
    }

    await app.close();
  });

  it("用已存在的商品编码再次建档返回 409 与 DUPLICATE，错误消息指出编码重复，列表里不出现第二条", async () => {
    const { app, cookie } = await buildItemApp();
    await app.inject({
      method: "POST",
      url: "/api/items",
      headers: { cookie },
      payload: itemPayload(),
    });

    const rejected = await app.inject({
      method: "POST",
      url: "/api/items",
      headers: { cookie },
      payload: itemPayload({ barcode: "6909999999999" }),
    });

    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe("DUPLICATE");
    expect(rejected.json().error.message).toContain("商品编码重复");

    const list = await app.inject({ method: "GET", url: "/api/items", headers: { cookie } });
    expect(list.json().data.items).toHaveLength(1);

    await app.close();
  });

  it("商品条码非空且重复时建档失败并指出条码重复，条码留空时建档成功", async () => {
    const { app, cookie } = await buildItemApp();
    await app.inject({
      method: "POST",
      url: "/api/items",
      headers: { cookie },
      payload: itemPayload(),
    });

    const rejected = await app.inject({
      method: "POST",
      url: "/api/items",
      headers: { cookie },
      payload: itemPayload({ code: "SKU-002" }),
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe("DUPLICATE");
    expect(rejected.json().error.message).toContain("商品条码重复");

    const withoutBarcode = await app.inject({
      method: "POST",
      url: "/api/items",
      headers: { cookie },
      payload: itemPayload({ code: "SKU-003", barcode: null }),
    });
    expect(withoutBarcode.statusCode).toBe(200);
    expect(withoutBarcode.json().data.barcode).toBeNull();

    await app.close();
  });

  it("按商品条码查询返回对应档案，同一条码只对应一条档案", async () => {
    const { app, cookie } = await buildItemApp();
    await app.inject({
      method: "POST",
      url: "/api/items",
      headers: { cookie },
      payload: itemPayload(),
    });

    const found = await app.inject({
      method: "GET",
      url: "/api/items/by-barcode/6901234567892",
      headers: { cookie },
    });

    expect(found.statusCode).toBe(200);
    expect(found.json().data.code).toBe("SKU-001");

    const list = await app.inject({ method: "GET", url: "/api/items", headers: { cookie } });
    expect(list.json().data.items).toHaveLength(1);

    await app.close();
  });

  it("用未知条码查询返回 404 与查不到档案的错误，且不会因此创建任何商品档案", async () => {
    const { app, cookie } = await buildItemApp();

    const found = await app.inject({
      method: "GET",
      url: "/api/items/by-barcode/0000000000000",
      headers: { cookie },
    });

    expect(found.statusCode).toBe(404);
    expect(found.json().error.code).toBe("NOT_FOUND");
    expect(found.json().error.message).toContain("查不到");

    const list = await app.inject({ method: "GET", url: "/api/items", headers: { cookie } });
    expect(list.json().data.items).toEqual([]);

    await app.close();
  });

  it("删除一条商品档案后列表里不再显示它", async () => {
    const { app, cookie } = await buildItemApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/items",
      headers: { cookie },
      payload: itemPayload(),
    });
    const id = created.json().data.id as string;

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/items/${id}`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(200);

    const list = await app.inject({ method: "GET", url: "/api/items", headers: { cookie } });
    expect(list.json().data.items).toEqual([]);

    await app.close();
  });

  it("编辑名称与辅助单位换算率后返回修改后的值", async () => {
    const { app, cookie } = await buildItemApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/items",
      headers: { cookie },
      payload: itemPayload({ auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }] }),
    });
    const id = created.json().data.id as string;

    const updated = await app.inject({
      method: "PUT",
      url: `/api/items/${id}`,
      headers: { cookie },
      payload: itemPayload({
        name: "可口可乐零度",
        auxiliaryUnits: [{ unit: "箱", conversionRate: "24" }],
      }),
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.name).toBe("可口可乐零度");
    expect(updated.json().data.auxiliaryUnits).toEqual([
      { unit: "箱", conversionRate: "24.000000" },
    ]);

    const fetched = await app.inject({
      method: "GET",
      url: `/api/items/${id}`,
      headers: { cookie },
    });
    expect(fetched.json().data.name).toBe("可口可乐零度");
    expect(fetched.json().data.auxiliaryUnits).toEqual([
      { unit: "箱", conversionRate: "24.000000" },
    ]);

    await app.close();
  });
});
