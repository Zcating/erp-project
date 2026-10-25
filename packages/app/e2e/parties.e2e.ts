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

describe("端到端：供应商、客户与仓库", () => {
  it("各建一条供应商与客户后，两者的编码、名称与联系方式在列表与编辑表单回显为录入值", async () => {
    const supplierBody = {
      code: uniqueCode("E2E-SUP"),
      name: "可口可乐（中国）饮料有限公司",
      contact: "采购部 13800000000",
    };
    const customerBody = {
      code: uniqueCode("E2E-CUS"),
      name: "杭州百货大楼",
      contact: "采购部 13900000000",
    };

    const createdSupplier = await api("POST", "/api/suppliers", supplierBody);
    expect(createdSupplier.status).toBe(200);
    expect(createdSupplier.payload.data.code).toBe(supplierBody.code);
    expect(createdSupplier.payload.data.name).toBe(supplierBody.name);
    expect(createdSupplier.payload.data.contact).toBe(supplierBody.contact);

    const createdCustomer = await api("POST", "/api/customers", customerBody);
    expect(createdCustomer.status).toBe(200);
    expect(createdCustomer.payload.data.code).toBe(customerBody.code);
    expect(createdCustomer.payload.data.name).toBe(customerBody.name);
    expect(createdCustomer.payload.data.contact).toBe(customerBody.contact);

    const supplierList = await api("GET", "/api/suppliers");
    const listedSupplier = supplierList.payload.data.suppliers.find(
      (supplier: any) => supplier.code === supplierBody.code,
    );
    expect(listedSupplier.name).toBe(supplierBody.name);
    expect(listedSupplier.contact).toBe(supplierBody.contact);

    const customerList = await api("GET", "/api/customers");
    const listedCustomer = customerList.payload.data.customers.find(
      (customer: any) => customer.code === customerBody.code,
    );
    expect(listedCustomer.name).toBe(customerBody.name);
    expect(listedCustomer.contact).toBe(customerBody.contact);

    const fetchedSupplier = await api("GET", `/api/suppliers/${createdSupplier.payload.data.id}`);
    expect(fetchedSupplier.payload.data.contact).toBe(supplierBody.contact);

    const fetchedCustomer = await api("GET", `/api/customers/${createdCustomer.payload.data.id}`);
    expect(fetchedCustomer.payload.data.contact).toBe(customerBody.contact);
  });

  it("新建一条仓库后，仓库出现在仓库列表中，字段值与录入一致", async () => {
    const body = {
      code: uniqueCode("E2E-WH"),
      name: "杭州总仓",
      purpose: "存放整箱饮料",
    };

    const created = await api("POST", "/api/warehouses", body);

    expect(created.status).toBe(200);
    expect(created.payload.data.code).toBe(body.code);
    expect(created.payload.data.name).toBe(body.name);
    expect(created.payload.data.purpose).toBe(body.purpose);

    const list = await api("GET", "/api/warehouses");
    const found = list.payload.data.warehouses.find(
      (warehouse: any) => warehouse.code === body.code,
    );
    expect(found.name).toBe(body.name);
    expect(found.purpose).toBe(body.purpose);
  });

  it("供应商编码与客户编码重复时新建失败并指出编码重复", async () => {
    const supplierCode = uniqueCode("E2E-DUP-SUP");
    await api("POST", "/api/suppliers", {
      code: supplierCode,
      name: "可口可乐（中国）饮料有限公司",
      contact: "采购部 13800000000",
    });

    const rejectedSupplier = await api("POST", "/api/suppliers", {
      code: supplierCode,
      name: "另一家供应商",
      contact: null,
    });
    expect(rejectedSupplier.status).toBe(409);
    expect(rejectedSupplier.payload.error.code).toBe("DUPLICATE");
    expect(rejectedSupplier.payload.error.message).toContain("供应商编码重复");

    const customerCode = uniqueCode("E2E-DUP-CUS");
    await api("POST", "/api/customers", {
      code: customerCode,
      name: "杭州百货大楼",
      contact: "采购部 13900000000",
    });

    const rejectedCustomer = await api("POST", "/api/customers", {
      code: customerCode,
      name: "另一家客户",
      contact: null,
    });
    expect(rejectedCustomer.status).toBe(409);
    expect(rejectedCustomer.payload.error.code).toBe("DUPLICATE");
    expect(rejectedCustomer.payload.error.message).toContain("客户编码重复");
  });

  it("某个客户编码与既有供应商编码字面相同时仍能创建成功", async () => {
    const sharedCode = uniqueCode("E2E-SHARED");

    const createdSupplier = await api("POST", "/api/suppliers", {
      code: sharedCode,
      name: "可口可乐（中国）饮料有限公司",
      contact: null,
    });
    expect(createdSupplier.status).toBe(200);

    const createdCustomer = await api("POST", "/api/customers", {
      code: sharedCode,
      name: "杭州百货大楼",
      contact: null,
    });
    expect(createdCustomer.status).toBe(200);
    expect(createdCustomer.payload.data.code).toBe(sharedCode);
  });

  it("仓库编码重复时新建失败并指出编码重复，仓库列表里不出现第二条同编码的仓库", async () => {
    const code = uniqueCode("E2E-DUP-WH");
    await api("POST", "/api/warehouses", {
      code,
      name: "杭州总仓",
      purpose: "存放整箱饮料",
    });

    const rejected = await api("POST", "/api/warehouses", {
      code,
      name: "另一个仓库",
      purpose: null,
    });

    expect(rejected.status).toBe(409);
    expect(rejected.payload.error.code).toBe("DUPLICATE");
    expect(rejected.payload.error.message).toContain("仓库编码重复");

    const list = await api("GET", "/api/warehouses");
    expect(
      list.payload.data.warehouses.filter((warehouse: any) => warehouse.code === code),
    ).toHaveLength(1);
  });

  it("删除一条没有被任何单据引用的供应商、客户与仓库成功，对应列表中不再出现该条记录", async () => {
    const createdSupplier = await api("POST", "/api/suppliers", {
      code: uniqueCode("E2E-DEL-SUP"),
      name: "待删除的供应商",
      contact: null,
    });
    const createdCustomer = await api("POST", "/api/customers", {
      code: uniqueCode("E2E-DEL-CUS"),
      name: "待删除的客户",
      contact: null,
    });
    const createdWarehouse = await api("POST", "/api/warehouses", {
      code: uniqueCode("E2E-DEL-WH"),
      name: "待删除的仓库",
      purpose: null,
    });

    for (const path of [
      `/api/suppliers/${createdSupplier.payload.data.id}`,
      `/api/customers/${createdCustomer.payload.data.id}`,
      `/api/warehouses/${createdWarehouse.payload.data.id}`,
    ]) {
      const deleted = await api("DELETE", path);
      expect(deleted.status).toBe(200);
    }

    const supplierList = await api("GET", "/api/suppliers");
    const customerList = await api("GET", "/api/customers");
    const warehouseList = await api("GET", "/api/warehouses");
    expect(
      supplierList.payload.data.suppliers.find(
        (supplier: any) => supplier.id === createdSupplier.payload.data.id,
      ),
    ).toBeUndefined();
    expect(
      customerList.payload.data.customers.find(
        (customer: any) => customer.id === createdCustomer.payload.data.id,
      ),
    ).toBeUndefined();
    expect(
      warehouseList.payload.data.warehouses.find(
        (warehouse: any) => warehouse.id === createdWarehouse.payload.data.id,
      ),
    ).toBeUndefined();
  });

  it("供应商、客户与仓库路由默认都要会话，无会话访问一律返回 401", async () => {
    for (const [method, path] of [
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
