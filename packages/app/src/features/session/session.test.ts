import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../build-app.js";
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  SESSION_COOKIE_NAME,
  resolveAdminCredentials,
} from "./index.js";

const sessionCookieHeader = (response: LightMyRequestResponse): string => {
  const header = response.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined) {
    throw new Error("登录响应没有下发 set-cookie");
  }
  return value.split(";")[0] ?? "";
};

const login = (app: FastifyInstance, username: string, password: string) =>
  app.inject({ method: "POST", url: "/api/login", payload: { username, password } });

describe("登录与会话", () => {
  it("有效账号密码登录返回 200 与 HttpOnly 会话 cookie，cookie 不出现在响应体里", async () => {
    const app = buildApp();

    const response = await login(app, DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { adminId: DEFAULT_ADMIN_USERNAME } });
    const cookie = response.headers["set-cookie"];
    const cookieHeader = Array.isArray(cookie) ? cookie[0] : cookie;
    expect(cookieHeader).toBeDefined();
    expect(cookieHeader).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookieHeader).toContain("HttpOnly");
    expect(response.body).not.toContain(SESSION_COOKIE_NAME);
    expect(response.body).not.toContain(sessionCookieHeader(response));

    await app.close();
  });

  it("免会话路由只有 POST /api/login 与 GET /api/health，其余已注册路由无会话一律 401", async () => {
    const app = buildApp();

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);

    const loginResponse = await login(app, DEFAULT_ADMIN_USERNAME, "wrong-password");
    expect(loginResponse.statusCode).toBe(401);

    const protectedResponses = await Promise.all([
      app.inject({ method: "GET", url: "/api/session" }),
      app.inject({ method: "GET", url: "/api/system/routes" }),
      app.inject({ method: "POST", url: "/api/decimals/amount", payload: { amount: "1.20" } }),
    ]);
    for (const response of protectedResponses) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: "UNAUTHENTICATED", message: expect.any(String) },
      });
    }

    await app.close();
  });

  it("健康检查的 HEAD 变体免会话，其余自动注册的 HEAD 路由仍然要求会话", async () => {
    const app = buildApp();

    const headHealth = await app.inject({ method: "HEAD", url: "/api/health" });
    expect(headHealth.statusCode).toBe(200);

    const headSession = await app.inject({ method: "HEAD", url: "/api/session" });
    expect(headSession.statusCode).toBe(401);

    const headSystemRoutes = await app.inject({ method: "HEAD", url: "/api/system/routes" });
    expect(headSystemRoutes.statusCode).toBe(401);

    await app.close();
  });

  it("不带会话 cookie 请求 GET /api/session 返回 401 与统一错误信封", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/api/session" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: expect.any(String) },
    });
    expect(response.json().error.message).not.toBe("");

    await app.close();
  });

  it("带有效会话 cookie 请求 GET /api/session 返回 200 且响应体含当前管理员账号标识", async () => {
    const app = buildApp();
    const loginResponse = await login(app, DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);

    const response = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie: sessionCookieHeader(loginResponse) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { adminId: DEFAULT_ADMIN_USERNAME } });

    await app.close();
  });

  it("cookie 无效或过期后请求 GET /api/session 返回 401", async () => {
    const app = buildApp({ sessionTtlMs: 1000 });
    const loginResponse = await login(app, DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
    const cookie = sessionCookieHeader(loginResponse);

    const invalid = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie: `${SESSION_COOKIE_NAME}=not-a-real-session` },
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json().error.code).toBe("UNAUTHENTICATED");

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const expired = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie },
    });
    expect(expired.statusCode).toBe(401);
    expect(expired.json().error.code).toBe("UNAUTHENTICATED");

    await app.close();
  });

  it("账号不存在与密码错误返回完全相同的响应体与状态码", async () => {
    const app = buildApp();

    const unknownAccount = await login(app, "nobody", DEFAULT_ADMIN_PASSWORD);
    const wrongPassword = await login(app, DEFAULT_ADMIN_USERNAME, "wrong-password");

    expect(unknownAccount.statusCode).toBe(wrongPassword.statusCode);
    expect(unknownAccount.json()).toEqual(wrongPassword.json());

    await app.close();
  });

  it("系统不提供注册接口：请求注册路径返回 404", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/register",
      payload: { username: "new-admin", password: "new-password" },
    });

    expect([404, 405]).toContain(response.statusCode);
    expect(response.json().error.code).toBe("NOT_FOUND");

    await app.close();
  });

  it("以 ADMIN_USERNAME 与 ADMIN_PASSWORD 启动的实例用该账号登录成功", async () => {
    const previousUsername = process.env.ADMIN_USERNAME;
    const previousPassword = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_USERNAME = "other";
    process.env.ADMIN_PASSWORD = "other-password";
    try {
      const app = buildApp();

      const response = await login(app, "other", "other-password");

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ data: { adminId: "other" } });

      await app.close();
    } finally {
      if (previousUsername === undefined) {
        delete process.env.ADMIN_USERNAME;
      } else {
        process.env.ADMIN_USERNAME = previousUsername;
      }
      if (previousPassword === undefined) {
        delete process.env.ADMIN_PASSWORD;
      } else {
        process.env.ADMIN_PASSWORD = previousPassword;
      }
    }
  });

  it("未设置 ADMIN_USERNAME 与 ADMIN_PASSWORD 时种子数据管理员账号可以登录成功", async () => {
    const previousUsername = process.env.ADMIN_USERNAME;
    const previousPassword = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    try {
      const resolved = resolveAdminCredentials();
      expect(resolved.isDefault).toBe(true);
      expect(resolved.credentials.username).toBe(DEFAULT_ADMIN_USERNAME);

      const app = buildApp();
      const response = await login(app, DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ data: { adminId: DEFAULT_ADMIN_USERNAME } });

      await app.close();
    } finally {
      if (previousUsername !== undefined) {
        process.env.ADMIN_USERNAME = previousUsername;
      }
      if (previousPassword !== undefined) {
        process.env.ADMIN_PASSWORD = previousPassword;
      }
    }
  });
});
