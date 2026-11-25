import { createInMemoryItemMasterRepository } from "@erp-project/kernel";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../build-app";
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from "../session";

const HEADER =
  "code,barcode,name,spec,brand,category,baseUnit,auxUnit1,auxUnit1Rate,auxUnit2,auxUnit2Rate";

const row = (...fields: string[]): string => fields.join(",");

const csv = (...rows: string[]): string => [HEADER, ...rows].join("\n");

const json = (...records: Array<Record<string, unknown>>): string => JSON.stringify(records);

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

const importJson = async (
  app: FastifyInstance,
  cookie: string,
  text: string,
  url = "/api/items/import/json",
) =>
  app.inject({
    method: "POST",
    url,
    headers: { cookie, "content-type": "application/json" },
    payload: text,
  });

const importCsv = async (app: FastifyInstance, cookie: string, text: string) =>
  app.inject({
    method: "POST",
    url: "/api/items/import",
    headers: { cookie, "content-type": "text/csv" },
    payload: text,
  });

const listItems = async (app: FastifyInstance, cookie: string) => {
  const response = await app.inject({ method: "GET", url: "/api/items", headers: { cookie } });
  return response.json().data.items as Array<Record<string, unknown>>;
};

const withoutIds = (items: Array<Record<string, unknown>>) =>
  items.map(({ id: _id, ...rest }) => rest);

describe("商品批量导入的 JSON HTTP 表面", () => {
  it("JSON 导入路由默认要会话，无会话访问返回 401", async () => {
    const app = buildApp({ itemMasterRepository: createInMemoryItemMasterRepository() });

    for (const url of ["/api/items/import/json", "/api/items/import"]) {
      const response = await app.inject({
        method: "POST",
        url,
        headers: { "content-type": "application/json" },
        payload: json({ code: "SKU-1", name: "可乐", baseUnit: "瓶" }),
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHENTICATED");
    }

    await app.close();
  });

  it("提交每条都合法的 JSON 返回成功，列表里出现该批全部商品，条数与记录条数一致", async () => {
    const { app, cookie } = await buildItemApp();

    const response = await importJson(
      app,
      cookie,
      json(
        {
          code: "SKU-1",
          barcode: "6900000000001",
          name: "可乐",
          baseUnit: "瓶",
          auxUnit1: "箱",
          auxUnit1Rate: "12",
        },
        { code: "SKU-2", barcode: "6900000000002", name: "雪碧", baseUnit: "瓶" },
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().data.count).toBe(2);

    const items = await listItems(app, cookie);
    expect(items.map((item) => item.code)).toEqual(["SKU-1", "SKU-2"]);

    await app.close();
  });

  it("有一条不合法时整批失败，错误信封带逐条明细与第几条，列表里不出现该批任何商品", async () => {
    const { app, cookie } = await buildItemApp();

    const response = await importJson(
      app,
      cookie,
      json(
        { code: "SKU-1", name: "可乐", baseUnit: "瓶" },
        { code: "SKU-2", name: "", baseUnit: "瓶" },
        { code: "SKU-3", name: "雪碧", baseUnit: "瓶" },
      ),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");
    expect(response.json().error.details).toEqual([
      { line: 2, code: "VALIDATION", message: "第 2 条：缺少商品名称" },
    ]);
    expect(await listItems(app, cookie)).toEqual([]);

    await app.close();
  });

  it("同一份 JSON 第二次导入整批失败，逐条指出商品编码已存在", async () => {
    const { app, cookie } = await buildItemApp();
    const text = json(
      { code: "SKU-1", barcode: "6900000000001", name: "可乐", baseUnit: "瓶" },
      { code: "SKU-2", barcode: "6900000000002", name: "雪碧", baseUnit: "瓶" },
    );
    await importJson(app, cookie, text);

    const response = await importJson(app, cookie, text);

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("DUPLICATE");
    expect(response.json().error.details).toEqual([
      { line: 1, code: "DUPLICATE", message: "第 1 条：商品编码重复：SKU-1" },
      { line: 2, code: "DUPLICATE", message: "第 2 条：商品编码重复：SKU-2" },
    ]);
    expect(await listItems(app, cookie)).toHaveLength(2);

    await app.close();
  });

  it("JSON 语法错误时整批失败，错误消息指出位置，列表里不出现该批任何商品", async () => {
    const { app, cookie } = await buildItemApp();

    const response = await importJson(app, cookie, '[{"code": "SKU-1",}]');

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");
    expect(response.json().error.message).toContain("JSON 解析失败");
    expect(response.json().error.message).toContain("位置");
    expect(await listItems(app, cookie)).toEqual([]);

    await app.close();
  });

  it("导入入口按 Content-Type 分流：application/json 走 JSON，text/csv 走 CSV", async () => {
    const { app, cookie } = await buildItemApp();

    const jsonResponse = await importJson(
      app,
      cookie,
      json({ code: "SKU-1", name: "可乐", baseUnit: "瓶" }),
      "/api/items/import",
    );
    const csvResponse = await importCsv(
      app,
      cookie,
      csv(row("SKU-2", "", "雪碧", "", "", "", "瓶", "", "", "", "")),
    );

    expect(jsonResponse.statusCode).toBe(200);
    expect(jsonResponse.json().data.count).toBe(1);
    expect(csvResponse.statusCode).toBe(200);
    expect(csvResponse.json().data.count).toBe(1);

    const items = await listItems(app, cookie);
    expect(items.map((item) => item.code)).toEqual(["SKU-1", "SKU-2"]);

    await app.close();
  });

  it("同一批商品分别用 CSV 与 JSON 导入，导入结果一致", async () => {
    const csvApp = await buildItemApp();
    const jsonApp = await buildItemApp();

    const csvResponse = await importCsv(
      csvApp.app,
      csvApp.cookie,
      csv(
        row(
          "SKU-1",
          "6900000000001",
          "可乐",
          "500ml",
          "可口可乐",
          "饮料",
          "瓶",
          "箱",
          "12",
          "",
          "",
        ),
        row("SKU-2", "6900000000002", "雪碧", "", "", "", "瓶", "", "", "", ""),
      ),
    );
    const jsonResponse = await importJson(
      jsonApp.app,
      jsonApp.cookie,
      json(
        {
          code: "SKU-1",
          barcode: "6900000000001",
          name: "可乐",
          spec: "500ml",
          brand: "可口可乐",
          category: "饮料",
          baseUnit: "瓶",
          auxUnit1: "箱",
          auxUnit1Rate: "12",
        },
        { code: "SKU-2", barcode: "6900000000002", name: "雪碧", baseUnit: "瓶" },
      ),
    );

    expect(csvResponse.json().data.count).toBe(jsonResponse.json().data.count);
    expect(withoutIds(await listItems(jsonApp.app, jsonApp.cookie))).toEqual(
      withoutIds(await listItems(csvApp.app, csvApp.cookie)),
    );

    await csvApp.app.close();
    await jsonApp.app.close();
  });

  it("同一批商品分别用 CSV 与 JSON 导入，报错语义一致", async () => {
    const csvApp = await buildItemApp();
    const jsonApp = await buildItemApp();

    const csvResponse = await importCsv(
      csvApp.app,
      csvApp.cookie,
      csv(
        row("SKU-1", "", "可乐", "", "", "", "瓶", "", "", "", ""),
        row("SKU-2", "", "", "", "", "", "瓶", "", "", "", ""),
      ),
    );
    const jsonResponse = await importJson(
      jsonApp.app,
      jsonApp.cookie,
      json(
        { code: "SKU-1", name: "可乐", baseUnit: "瓶" },
        { code: "SKU-2", name: "", baseUnit: "瓶" },
      ),
    );

    expect(jsonResponse.statusCode).toBe(csvResponse.statusCode);
    expect(jsonResponse.json().error.code).toBe(csvResponse.json().error.code);
    expect(
      jsonResponse
        .json()
        .error.details.map((detail: { message: string }) =>
          detail.message.replace(/^第 \d+ 条：/, ""),
        ),
    ).toEqual(
      csvResponse.json().error.details.map((detail: { message: string }) => detail.message),
    );

    await csvApp.app.close();
    await jsonApp.app.close();
  });
});
