import { createInMemoryItemMasterRepository } from "@erp-inventory-sales/kernel";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../build-app";
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from "../session";

const HEADER =
  "code,barcode,name,spec,brand,category,baseUnit,auxUnit1,auxUnit1Rate,auxUnit2,auxUnit2Rate";

const row = (...fields: string[]): string => fields.join(",");

const csv = (...rows: string[]): string => [HEADER, ...rows].join("\n");

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

const importCsv = async (app: FastifyInstance, cookie: string, text: string) =>
  app.inject({
    method: "POST",
    url: "/api/items/import",
    headers: { cookie, "content-type": "text/csv" },
    payload: text,
  });

const listItems = async (app: FastifyInstance, cookie: string) => {
  const response = await app.inject({ method: "GET", url: "/api/items", headers: { cookie } });
  return response.json().data.items as Array<{ code: string }>;
};

describe("商品批量导入的 HTTP 表面", () => {
  it("导入路由默认要会话，无会话访问返回 401", async () => {
    const app = buildApp({ itemMasterRepository: createInMemoryItemMasterRepository() });

    const response = await app.inject({
      method: "POST",
      url: "/api/items/import",
      headers: { "content-type": "text/csv" },
      payload: csv(row("SKU-1", "", "可乐", "", "", "", "瓶", "", "", "", "")),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");

    await app.close();
  });

  it("提交每行都合法的 CSV 返回成功，列表里出现该批全部商品，条数与数据行数一致", async () => {
    const { app, cookie } = await buildItemApp();

    const response = await importCsv(
      app,
      cookie,
      csv(
        row("SKU-1", "6900000000001", "可乐", "", "", "", "瓶", "箱", "12", "", ""),
        row("SKU-2", "6900000000002", "雪碧", "", "", "", "瓶", "", "", "", ""),
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().data.count).toBe(2);

    const items = await listItems(app, cookie);
    expect(items.map((item) => item.code)).toEqual(["SKU-1", "SKU-2"]);

    await app.close();
  });

  it("表头不匹配时整批失败，错误消息指出缺了哪列，列表里不出现该批任何商品", async () => {
    const { app, cookie } = await buildItemApp();

    const response = await importCsv(app, cookie, "code,barcode,name\nSKU-1,,可乐");

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");
    expect(response.json().error.message).toContain("表头不匹配");
    expect(response.json().error.message).toContain("baseUnit");
    expect(await listItems(app, cookie)).toEqual([]);

    await app.close();
  });

  it("有一行不合法时整批失败，错误信封带逐行明细，合法行也不落库", async () => {
    const { app, cookie } = await buildItemApp();

    const response = await importCsv(
      app,
      cookie,
      csv(
        row("SKU-1", "", "可乐", "", "", "", "瓶", "", "", "", ""),
        row("SKU-2", "", "", "", "", "", "瓶", "", "", "", ""),
        row("SKU-3", "", "雪碧", "", "", "", "瓶", "", "", "", ""),
      ),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");
    expect(response.json().error.details).toEqual([
      { line: 3, code: "VALIDATION", message: "缺少商品名称" },
    ]);
    expect(await listItems(app, cookie)).toEqual([]);

    await app.close();
  });

  it("同一份 CSV 第二次导入整批失败，逐行指出商品编码已存在", async () => {
    const { app, cookie } = await buildItemApp();
    const text = csv(
      row("SKU-1", "6900000000001", "可乐", "", "", "", "瓶", "", "", "", ""),
      row("SKU-2", "6900000000002", "雪碧", "", "", "", "瓶", "", "", "", ""),
    );
    await importCsv(app, cookie, text);

    const response = await importCsv(app, cookie, text);

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("DUPLICATE");
    expect(response.json().error.details).toEqual([
      { line: 2, code: "DUPLICATE", message: "商品编码重复：SKU-1" },
      { line: 3, code: "DUPLICATE", message: "商品编码重复：SKU-2" },
    ]);
    expect(await listItems(app, cookie)).toHaveLength(2);

    await app.close();
  });

  it("请求体不是可导入的文档时返回 400 与 VALIDATION", async () => {
    const { app, cookie } = await buildItemApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/items/import",
      headers: { cookie, "content-type": "application/json" },
      payload: { code: "SKU-1" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");
    expect(response.json().error.message).toContain("JSON");

    await app.close();
  });
});
