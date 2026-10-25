import { describe, expect, it } from "vitest";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";

describe("端到端冒烟：参考 API", () => {
  it("健康检查接口 GET /api/health 返回 200 与成功信封", async () => {
    const response = await fetch(`${apiBaseUrl}/api/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { status: "ok" } });
  });

  it("请求未注册路径返回 404 与统一错误信封，而不是框架默认错误页", async () => {
    const response = await fetch(`${apiBaseUrl}/api/not-registered-in-e2e`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = await response.json();
    expect(body).toEqual({
      error: { code: "NOT_FOUND", message: expect.any(String) },
    });
    expect(String(body)).not.toContain("<html");
  });
});
