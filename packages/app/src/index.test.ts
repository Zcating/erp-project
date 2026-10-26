import { describe, expect, it } from "vitest";
import { buildApp, kernelPg, ports, shared } from "./index";

describe("app package", () => {
  it("exposes its public surface", () => {
    expect(buildApp).toBeTypeOf("function");
    expect(kernelPg).toBeTypeOf("object");
    expect(ports).toBeTypeOf("object");
    expect(shared).toBeTypeOf("object");
  });

  it("公开面给出的应用可以直接对外服务", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);

    await app.close();
  });
});
