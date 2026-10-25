import type { ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { e2eDatabaseUrl } from "../../../packages/kernel-pg/src/db/config.ts";
import { killTree, spawnApi } from "../../../scripts/e2e/e2e-environment.ts";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";
const configuredApiBaseUrl = "http://127.0.0.1:3101";
const defaultAdminUsername = "admin";
const defaultAdminPassword = "admin-dev-password";

let configuredApiChild: ChildProcess | undefined;

type LoginResult = {
  status: number;
  body: string;
  setCookie: string | null;
};

async function login(baseUrl: string, username: string, password: string): Promise<LoginResult> {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return {
    status: response.status,
    body: await response.text(),
    setCookie: response.headers.get("set-cookie"),
  };
}

function sessionCookieOf(setCookie: string | null): string {
  if (setCookie === null) {
    throw new Error("登录响应没有下发 set-cookie");
  }
  return setCookie.split(";")[0] ?? "";
}

describe("端到端：登录与会话", () => {
  it("有效账号密码登录返回 200 与 HttpOnly 会话 cookie，cookie 不出现在响应体里", async () => {
    const result = await login(apiBaseUrl, defaultAdminUsername, defaultAdminPassword);

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ data: { adminId: defaultAdminUsername } });
    expect(result.setCookie).toContain("erp_session=");
    expect(result.setCookie).toContain("HttpOnly");
    expect(result.body).not.toContain("erp_session");
  });

  it("无会话访问受保护路由一律返回 401 与统一错误信封", async () => {
    for (const [method, path] of [
      ["GET", "/api/session"],
      ["GET", "/api/system/routes"],
      ["POST", "/api/decimals/amount"],
    ] as const) {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "POST" ? JSON.stringify({ amount: "1.20" }) : undefined,
      });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "UNAUTHENTICATED", message: expect.any(String) },
      });
    }
  });

  it("健康检查的 HEAD 变体免会话，其余自动注册的 HEAD 路由仍然要求会话", async () => {
    const healthHead = await fetch(`${apiBaseUrl}/api/health`, { method: "HEAD" });
    expect(healthHead.status).toBe(200);

    const sessionHead = await fetch(`${apiBaseUrl}/api/session`, { method: "HEAD" });
    expect(sessionHead.status).toBe(401);

    const systemRoutesHead = await fetch(`${apiBaseUrl}/api/system/routes`, { method: "HEAD" });
    expect(systemRoutesHead.status).toBe(401);
  });

  it("带有效会话 cookie 请求 GET /api/session 返回 200 与当前管理员账号标识", async () => {
    const loginResult = await login(apiBaseUrl, defaultAdminUsername, defaultAdminPassword);

    const response = await fetch(`${apiBaseUrl}/api/session`, {
      headers: { cookie: sessionCookieOf(loginResult.setCookie) },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { adminId: defaultAdminUsername } });
  });

  it("cookie 无效或过期后请求 GET /api/session 返回 401", async () => {
    const response = await fetch(`${apiBaseUrl}/api/session`, {
      headers: { cookie: "erp_session=not-a-real-session" },
    });

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("账号不存在与密码错误返回完全相同的响应体与状态码", async () => {
    const unknownAccount = await login(apiBaseUrl, "nobody", defaultAdminPassword);
    const wrongPassword = await login(apiBaseUrl, defaultAdminUsername, "wrong-password");

    expect(unknownAccount.status).toBe(wrongPassword.status);
    expect(unknownAccount.body).toBe(wrongPassword.body);
  });

  it("系统不提供注册接口：请求注册路径返回 404", async () => {
    const response = await fetch(`${apiBaseUrl}/api/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "new-admin", password: "new-password" }),
    });

    expect([404, 405]).toContain(response.status);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });
});

describe("端到端：以环境变量配置的账号启动的实例", () => {
  beforeAll(async () => {
    const child = spawnApi(e2eDatabaseUrl(), 3101, {
      ADMIN_USERNAME: "other",
      ADMIN_PASSWORD: "other-password",
    });
    configuredApiChild = child;
    await waitForApi(configuredApiBaseUrl);
  }, 120_000);

  afterAll(() => {
    if (configuredApiChild !== undefined) {
      killTree(configuredApiChild);
    }
  });

  it("用 ADMIN_USERNAME 指定的账号登录成功", async () => {
    const result = await login(configuredApiBaseUrl, "other", "other-password");

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ data: { adminId: "other" } });
  });

  it("种子数据管理员账号在该实例上不再可用", async () => {
    const result = await login(configuredApiBaseUrl, defaultAdminUsername, defaultAdminPassword);

    expect(result.status).toBe(401);
  });
});

async function waitForApi(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
      lastError = `状态码 ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`实例未在 60 秒内就绪：${lastError}`);
}
