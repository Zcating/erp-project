import { describe, expect, it } from "vitest";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";
const defaultAdminUsername = "admin";
const defaultAdminPassword = "admin-dev-password";

const json = (...records: Array<Record<string, unknown>>): string => JSON.stringify(records);

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

async function api(method: string, path: string): Promise<{ status: number; payload: any }> {
  const cookie = await sessionCookie();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: { cookie },
  });
  const text = await response.text();
  return { status: response.status, payload: text === "" ? undefined : JSON.parse(text) };
}

async function importJson(
  text: string,
  path = "/api/items/import/json",
): Promise<{ status: number; payload: any }> {
  const cookie = await sessionCookie();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: text,
  });
  const body = await response.text();
  return { status: response.status, payload: body === "" ? undefined : JSON.parse(body) };
}

const uniqueCode = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const uniqueBarcode = (): string =>
  `69${Math.floor(Math.random() * 1e11)
    .toString()
    .padStart(11, "0")}`;

describe("端到端：商品批量导入（JSON）", () => {
  it("JSON 导入路由默认要会话，无会话访问返回 401", async () => {
    for (const path of ["/api/items/import/json", "/api/items/import"]) {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: json({ code: uniqueCode("E2E-JSON"), name: "可乐", baseUnit: "瓶" }),
      });

      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    }
  });

  it("提交一份每条都合法的 JSON 返回成功，商品档案列表包含该批全部商品，条数与记录条数一致", async () => {
    const code = uniqueCode("E2E-JSON");

    const imported = await importJson(
      json(
        {
          code,
          barcode: uniqueBarcode(),
          name: "可乐",
          baseUnit: "瓶",
          auxUnit1: "箱",
          auxUnit1Rate: "12",
        },
        { code: `${code}-B`, barcode: uniqueBarcode(), name: "雪碧", baseUnit: "瓶" },
      ),
    );
    expect(imported.status).toBe(200);
    expect(imported.payload.data.count).toBe(2);

    const list = await api("GET", "/api/items");
    const found = list.payload.data.items.filter(
      (item: any) => item.code === code || item.code === `${code}-B`,
    );
    expect(found).toHaveLength(2);
    expect(found[0].auxiliaryUnits).toEqual([{ unit: "箱", conversionRate: "12.000000" }]);
  });

  it("同一份 JSON 中只要有一条不合法，整批导入失败，列表里不出现该批次的任何一条商品，合法记录也不落库", async () => {
    const code = uniqueCode("E2E-JSON-ATOMIC");

    const rejected = await importJson(
      json(
        { code, barcode: uniqueBarcode(), name: "可乐", baseUnit: "瓶" },
        { code: `${code}-B`, barcode: uniqueBarcode(), name: "", baseUnit: "瓶" },
        { code: `${code}-C`, barcode: uniqueBarcode(), name: "雪碧", baseUnit: "瓶" },
      ),
    );

    expect(rejected.status).toBe(400);
    expect(rejected.payload.error.code).toBe("VALIDATION");

    const list = await api("GET", "/api/items");
    expect(
      list.payload.data.items.filter(
        (item: any) => item.code === code || item.code === `${code}-B` || item.code === `${code}-C`,
      ),
    ).toHaveLength(0);
  });

  it("导入失败时逐条给出错误原因，每条错误都带记录位置与该条记录的问题描述", async () => {
    const code = uniqueCode("E2E-JSON-DETAIL");

    const rejected = await importJson(
      json(
        { code, barcode: uniqueBarcode(), name: "可乐", baseUnit: "瓶" },
        { code: `${code}-B`, barcode: uniqueBarcode(), name: "", baseUnit: "瓶" },
        {
          code: `${code}-C`,
          barcode: uniqueBarcode(),
          name: "雪碧",
          baseUnit: "瓶",
          auxUnit1: "箱",
          auxUnit1Rate: "0",
        },
      ),
    );

    expect(rejected.status).toBe(400);
    expect(rejected.payload.error.details).toEqual([
      { line: 2, code: "VALIDATION", message: "第 2 条：缺少商品名称" },
      { line: 3, code: "VALIDATION", message: "第 3 条：单位换算率必须为正数：0" },
    ]);
  });

  it("对同一份 JSON 导入第二次时整批失败，并逐条指出商品编码已存在", async () => {
    const code = uniqueCode("E2E-JSON-DUP");
    const text = json(
      { code, barcode: uniqueBarcode(), name: "可乐", baseUnit: "瓶" },
      { code: `${code}-B`, barcode: uniqueBarcode(), name: "雪碧", baseUnit: "瓶" },
    );
    const first = await importJson(text);
    expect(first.status).toBe(200);

    const second = await importJson(text);
    expect(second.status).toBe(409);
    expect(second.payload.error.code).toBe("DUPLICATE");
    expect(second.payload.error.details).toEqual([
      { line: 1, code: "DUPLICATE", message: `第 1 条：商品编码重复：${code}` },
      { line: 2, code: "DUPLICATE", message: `第 2 条：商品编码重复：${code}-B` },
    ]);

    const list = await api("GET", "/api/items");
    expect(list.payload.data.items.filter((item: any) => item.code === code)).toHaveLength(1);
  });

  it("JSON 语法错误时整批失败，错误消息指出位置，列表里不出现该批的任何一条商品", async () => {
    const code = uniqueCode("E2E-JSON-SYNTAX");

    const rejected = await importJson(`[{"code": "${code}",}]`);

    expect(rejected.status).toBe(400);
    expect(rejected.payload.error.code).toBe("VALIDATION");
    expect(rejected.payload.error.message).toContain("JSON 解析失败");
    expect(rejected.payload.error.message).toContain("位置");

    const list = await api("GET", "/api/items");
    expect(list.payload.data.items.filter((item: any) => item.code === code)).toHaveLength(0);
  });
});
