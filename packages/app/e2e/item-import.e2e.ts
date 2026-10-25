import { describe, expect, it } from "vitest";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";
const defaultAdminUsername = "admin";
const defaultAdminPassword = "admin-dev-password";

const HEADER =
  "code,barcode,name,spec,brand,category,baseUnit,auxUnit1,auxUnit1Rate,auxUnit2,auxUnit2Rate";

const row = (...fields: string[]): string => fields.join(",");

const csv = (...rows: string[]): string => [HEADER, ...rows].join("\n");

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

async function importCsv(text: string): Promise<{ status: number; payload: any }> {
  const cookie = await sessionCookie();
  const response = await fetch(`${apiBaseUrl}/api/items/import`, {
    method: "POST",
    headers: { cookie, "content-type": "text/csv" },
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

describe("端到端：商品批量导入（CSV）", () => {
  it("导入路由默认要会话，无会话访问返回 401", async () => {
    const response = await fetch(`${apiBaseUrl}/api/items/import`, {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: csv(row(uniqueCode("E2E-IMPORT"), "", "可乐", "", "", "", "瓶", "", "", "", "")),
    });

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("提交一份每行都合法的 CSV 返回成功，商品档案列表包含该批全部商品，条数与数据行数一致", async () => {
    const code = uniqueCode("E2E-IMPORT");
    const text = csv(
      row(code, uniqueBarcode(), "可乐", "", "", "", "瓶", "箱", "12", "", ""),
      row(`${code}-B`, uniqueBarcode(), "雪碧", "", "", "", "瓶", "", "", "", ""),
    );

    const imported = await importCsv(text);
    expect(imported.status).toBe(200);
    expect(imported.payload.data.count).toBe(2);

    const list = await api("GET", "/api/items");
    const found = list.payload.data.items.filter(
      (item: any) => item.code === code || item.code === `${code}-B`,
    );
    expect(found).toHaveLength(2);
    expect(found[0].auxiliaryUnits).toEqual([{ unit: "箱", conversionRate: "12.000000" }]);
  });

  it("表头不匹配时整批失败并给出表头不符的错误说明，商品档案列表里不出现该批的任何一条商品", async () => {
    const code = uniqueCode("E2E-IMPORT-HEADER");

    const rejected = await importCsv(`code,barcode,name\n${code},,可乐`);

    expect(rejected.status).toBe(400);
    expect(rejected.payload.error.code).toBe("VALIDATION");
    expect(rejected.payload.error.message).toContain("表头不匹配");

    const list = await api("GET", "/api/items");
    expect(list.payload.data.items.filter((item: any) => item.code === code)).toHaveLength(0);
  });

  it("同一份 CSV 中只要有一行不合法，整批导入失败，列表里不出现该批次的任何一条商品，合法行也不落库", async () => {
    const code = uniqueCode("E2E-IMPORT-ATOMIC");

    const rejected = await importCsv(
      csv(
        row(code, uniqueBarcode(), "可乐", "", "", "", "瓶", "", "", "", ""),
        row(`${code}-B`, uniqueBarcode(), "", "", "", "", "瓶", "", "", "", ""),
        row(`${code}-C`, uniqueBarcode(), "雪碧", "", "", "", "瓶", "", "", "", ""),
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

  it("导入失败时逐行给出错误原因，每条错误都带行号与该行的问题描述", async () => {
    const code = uniqueCode("E2E-IMPORT-DETAIL");

    const rejected = await importCsv(
      csv(
        row(code, uniqueBarcode(), "可乐", "", "", "", "瓶", "", "", "", ""),
        row(`${code}-B`, uniqueBarcode(), "", "", "", "", "瓶", "", "", "", ""),
        row(`${code}-C`, uniqueBarcode(), "雪碧", "", "", "", "瓶", "箱", "0", "", ""),
        row(`${code}-D`, uniqueBarcode(), "芬达", "", "", "", "瓶", "箱", "1.1234567", "", ""),
      ),
    );

    expect(rejected.status).toBe(400);
    expect(rejected.payload.error.details).toEqual([
      { line: 3, code: "VALIDATION", message: "缺少商品名称" },
      { line: 4, code: "VALIDATION", message: "单位换算率必须为正数：0" },
      { line: 5, code: "VALIDATION", message: "单位换算率最多 6 位小数：1.1234567" },
    ]);
  });

  it("对同一份 CSV 导入第二次时整批失败，并逐行指出商品编码已存在", async () => {
    const code = uniqueCode("E2E-IMPORT-DUP");
    const text = csv(
      row(code, uniqueBarcode(), "可乐", "", "", "", "瓶", "", "", "", ""),
      row(`${code}-B`, uniqueBarcode(), "雪碧", "", "", "", "瓶", "", "", "", ""),
    );
    const first = await importCsv(text);
    expect(first.status).toBe(200);

    const second = await importCsv(text);
    expect(second.status).toBe(409);
    expect(second.payload.error.code).toBe("DUPLICATE");
    expect(second.payload.error.details).toEqual([
      { line: 2, code: "DUPLICATE", message: `商品编码重复：${code}` },
      { line: 3, code: "DUPLICATE", message: `商品编码重复：${code}-B` },
    ]);

    const list = await api("GET", "/api/items");
    expect(list.payload.data.items.filter((item: any) => item.code === code)).toHaveLength(1);
  });

  it("同一份 CSV 里重复的商品编码归到后出现的那一行", async () => {
    const code = uniqueCode("E2E-IMPORT-SAME");

    const rejected = await importCsv(
      csv(
        row(code, uniqueBarcode(), "可乐", "", "", "", "瓶", "", "", "", ""),
        row(code, uniqueBarcode(), "雪碧", "", "", "", "瓶", "", "", "", ""),
      ),
    );

    expect(rejected.status).toBe(409);
    expect(rejected.payload.error.details).toEqual([
      { line: 3, code: "DUPLICATE", message: `商品编码重复：${code}` },
    ]);

    const list = await api("GET", "/api/items");
    expect(list.payload.data.items.filter((item: any) => item.code === code)).toHaveLength(0);
  });
});
