import { describe, expect, it } from "vitest";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";
const defaultAdminUsername = "admin";
const defaultAdminPassword = "admin-dev-password";

let cachedCookie: string | null = null;

async function sessionCookie(): Promise<string> {
  if (cachedCookie !== null) {
    return cachedCookie;
  }
  const response = await fetch(`${apiBaseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: defaultAdminUsername, password: defaultAdminPassword }),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie === null) {
    throw new Error("登录响应没有下发 set-cookie");
  }
  cachedCookie = setCookie.split(";")[0] ?? "";
  return cachedCookie;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; payload: any }> {
  const cookie = await sessionCookie();
  const headers: Record<string, string> = { cookie };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    payload: text === "" ? undefined : JSON.parse(text),
  };
}

const uniqueCode = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const uniqueBarcode = (): string =>
  `69${Math.floor(Math.random() * 1e11)
    .toString()
    .padStart(11, "0")}`;

type ItemBody = {
  code: string;
  barcode: string | null;
  name: string;
  specification: string;
  brand: string;
  category: string;
  baseUnit: string;
  auxiliaryUnits: Array<{ unit: string; conversionRate: string }>;
};

const itemBody = (overrides: Partial<ItemBody> = {}): ItemBody => ({
  code: uniqueCode("E2E-API"),
  barcode: uniqueBarcode(),
  name: "可口可乐",
  specification: "500ml/瓶",
  brand: "可口可乐",
  category: "饮料",
  baseUnit: "瓶",
  auxiliaryUnits: [],
  ...overrides,
});

describe("端到端：商品档案", () => {
  it("新建一条商品档案成功，列表里出现该条记录，字段值与录入一致", async () => {
    const body = itemBody({
      auxiliaryUnits: [
        { unit: "箱", conversionRate: "12" },
        { unit: "包", conversionRate: "6" },
      ],
    });

    const created = await api("POST", "/api/items", body);
    expect(created.status).toBe(200);
    expect(created.payload.data.code).toBe(body.code);
    expect(created.payload.data.name).toBe("可口可乐");
    expect(created.payload.data.specification).toBe("500ml/瓶");
    expect(created.payload.data.brand).toBe("可口可乐");
    expect(created.payload.data.category).toBe("饮料");
    expect(created.payload.data.baseUnit).toBe("瓶");
    expect(created.payload.data.auxiliaryUnits).toEqual([
      { unit: "箱", conversionRate: "12.000000" },
      { unit: "包", conversionRate: "6.000000" },
    ]);

    const list = await api("GET", "/api/items");
    expect(list.status).toBe(200);
    const found = list.payload.data.items.find((item: any) => item.code === body.code);
    expect(found).toBeDefined();
    expect(found.specification).toBe("500ml/瓶");
    expect(found.brand).toBe("可口可乐");
    expect(found.category).toBe("饮料");
    expect(found.auxiliaryUnits).toEqual([
      { unit: "箱", conversionRate: "12.000000" },
      { unit: "包", conversionRate: "6.000000" },
    ]);
  });

  it("名称为空或未指定基本计量单位的建档请求失败，错误消息指出缺哪一项", async () => {
    const withoutName = await api("POST", "/api/items", itemBody({ name: "" }));
    expect(withoutName.status).toBe(400);
    expect(withoutName.payload.error.code).toBe("VALIDATION");
    expect(withoutName.payload.error.message).toContain("缺少商品名称");

    const withoutBaseUnit = await api("POST", "/api/items", itemBody({ baseUnit: "" }));
    expect(withoutBaseUnit.status).toBe(400);
    expect(withoutBaseUnit.payload.error.code).toBe("VALIDATION");
    expect(withoutBaseUnit.payload.error.message).toContain("缺少基本计量单位");
  });

  it("用已存在的商品编码再次建档失败，错误消息指出编码重复，且列表里不出现第二条同编码档案", async () => {
    const body = itemBody();
    await api("POST", "/api/items", body);

    const rejected = await api("POST", "/api/items", itemBody({ code: body.code }));
    expect(rejected.status).toBe(409);
    expect(rejected.payload.error.code).toBe("DUPLICATE");
    expect(rejected.payload.error.message).toContain("商品编码重复");

    const list = await api("GET", "/api/items");
    const sameCode = list.payload.data.items.filter((item: any) => item.code === body.code);
    expect(sameCode).toHaveLength(1);
  });

  it("商品条码非空且与既有档案重复时建档失败并指出条码重复，商品条码留空时建档成功", async () => {
    const body = itemBody();
    await api("POST", "/api/items", body);

    const rejected = await api("POST", "/api/items", itemBody({ barcode: body.barcode }));
    expect(rejected.status).toBe(409);
    expect(rejected.payload.error.code).toBe("DUPLICATE");
    expect(rejected.payload.error.message).toContain("商品条码重复");

    const withoutBarcode = await api("POST", "/api/items", itemBody({ barcode: null }));
    expect(withoutBarcode.status).toBe(200);
    expect(withoutBarcode.payload.data.barcode).toBeNull();
  });

  it("单位换算率必须为正数且最多 6 位小数", async () => {
    const accepted = await api(
      "POST",
      "/api/items",
      itemBody({ auxiliaryUnits: [{ unit: "箱", conversionRate: "1.123456" }] }),
    );
    expect(accepted.status).toBe(200);
    expect(accepted.payload.data.auxiliaryUnits).toEqual([
      { unit: "箱", conversionRate: "1.123456" },
    ]);

    for (const conversionRate of ["1.1234567", "0", "-1"]) {
      const rejected = await api(
        "POST",
        "/api/items",
        itemBody({ auxiliaryUnits: [{ unit: "箱", conversionRate }] }),
      );
      expect(rejected.status).toBe(400);
      expect(rejected.payload.error.code).toBe("VALIDATION");
      expect(rejected.payload.error.message).toContain("单位换算率");
    }
  });

  it("按商品条码查询能返回对应的商品档案，且同一条码只对应一条档案", async () => {
    const body = itemBody();
    await api("POST", "/api/items", body);

    const found = await api("GET", `/api/items/by-barcode/${body.barcode}`);
    expect(found.status).toBe(200);
    expect(found.payload.data.code).toBe(body.code);

    const list = await api("GET", "/api/items");
    const sameBarcode = list.payload.data.items.filter(
      (item: any) => item.barcode === body.barcode,
    );
    expect(sameBarcode).toHaveLength(1);
  });

  it("系统没有扫码自动建档入口：未知条码查询返回查不到档案的错误，且不会因此创建任何商品档案", async () => {
    const before = await api("GET", "/api/items");
    const countBefore = before.payload.data.items.length;

    const found = await api("GET", "/api/items/by-barcode/0000000000000");
    expect(found.status).toBe(404);
    expect(found.payload.error.code).toBe("NOT_FOUND");
    expect(found.payload.error.message).toContain("查不到");

    for (const path of ["/api/items/scan", "/api/items/barcode", "/api/items/by-barcode"]) {
      const response = await api("POST", path, { barcode: "0000000000000" });
      expect([404, 405]).toContain(response.status);
      expect(response.payload.error.code).toBe("NOT_FOUND");
    }

    const after = await api("GET", "/api/items");
    expect(after.payload.data.items).toHaveLength(countBefore);
  });

  it("编辑商品档案的名称与辅助计量单位换算率后保存成功，回填修改后的值", async () => {
    const body = itemBody({ auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }] });
    const created = await api("POST", "/api/items", body);
    const id = created.payload.data.id;

    const updated = await api("PUT", `/api/items/${id}`, {
      ...body,
      name: "可口可乐零度",
      auxiliaryUnits: [{ unit: "箱", conversionRate: "24" }],
    });
    expect(updated.status).toBe(200);
    expect(updated.payload.data.name).toBe("可口可乐零度");
    expect(updated.payload.data.auxiliaryUnits).toEqual([
      { unit: "箱", conversionRate: "24.000000" },
    ]);

    const fetched = await api("GET", `/api/items/${id}`);
    expect(fetched.payload.data.name).toBe("可口可乐零度");
    expect(fetched.payload.data.auxiliaryUnits).toEqual([
      { unit: "箱", conversionRate: "24.000000" },
    ]);
  });

  it("删除一条没有任何单据引用的商品档案成功，列表里不再显示该条记录", async () => {
    const body = itemBody();
    const created = await api("POST", "/api/items", body);
    const id = created.payload.data.id;

    const deleted = await api("DELETE", `/api/items/${id}`);
    expect(deleted.status).toBe(200);

    const list = await api("GET", "/api/items");
    expect(list.payload.data.items.find((item: any) => item.id === id)).toBeUndefined();
  });

  it("商品档案路由默认都要会话，无会话访问一律返回 401", async () => {
    for (const [method, path] of [
      ["GET", "/api/items"],
      ["POST", "/api/items"],
      ["GET", "/api/items/some-id"],
      ["GET", "/api/items/by-barcode/6901234567892"],
      ["PUT", "/api/items/some-id"],
      ["DELETE", "/api/items/some-id"],
    ] as const) {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method,
        headers: method === "GET" ? {} : { "content-type": "application/json" },
        body: method === "GET" ? undefined : "{}",
      });

      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    }
  });
});
