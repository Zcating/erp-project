import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "./build-app.js";
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from "./features/session/index.js";

const sessionCookieHeader = async (app: FastifyInstance): Promise<string> => {
  const response = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { username: DEFAULT_ADMIN_USERNAME, password: DEFAULT_ADMIN_PASSWORD },
  });
  const header = response.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined) {
    throw new Error("登录响应没有下发 set-cookie");
  }
  return value.split(";")[0] ?? "";
};

describe("参考应用 HTTP 表面", () => {
  it("GET /api/health 返回 200 与成功信封", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { status: "ok" } });

    await app.close();
  });

  it("未注册路径返回 404 与错误信封，而不是框架默认错误页", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/api/does-not-exist" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "NOT_FOUND", message: expect.any(String) },
    });
    expect(response.json().error.code).not.toBe("");
    expect(response.json().error.message).not.toBe("");

    await app.close();
  });

  it("不带会话凭据请求 GET /api/session 返回 401 与错误信封", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/api/session" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: expect.any(String) },
    });
    expect(response.json().error.message).not.toBe("");

    await app.close();
  });

  it("金额字段传入 3 位小数返回 400 与 VALIDATION 错误信封，不是 500", async () => {
    const app = buildApp();
    const cookie = await sessionCookieHeader(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/decimals/amount",
      headers: { cookie },
      payload: { amount: "1.234" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: "VALIDATION", message: expect.any(String) },
    });

    await app.close();
  });

  it("金额不是十进制字符串时返回 400 而不是 500", async () => {
    const app = buildApp();
    const cookie = await sessionCookieHeader(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/decimals/amount",
      headers: { cookie },
      payload: { amount: "1,5" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");

    await app.close();
  });

  it("请求体不是合法 JSON 时返回 400 而不是 500", async () => {
    const app = buildApp();
    const cookie = await sessionCookieHeader(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/decimals/amount",
      headers: { cookie, "content-type": "application/json" },
      payload: "{not json",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");

    await app.close();
  });

  it("符合金额精度的输入按 2 位小数承载", async () => {
    const app = buildApp();
    const cookie = await sessionCookieHeader(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/decimals/amount",
      headers: { cookie },
      payload: { amount: "1.2" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { amount: "1.20" } });

    await app.close();
  });
});
