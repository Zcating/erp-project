import { describe, expect, it } from "vitest";
import { readErrorBody } from "./http";

describe("服务端错误体解析", () => {
  it("从错误响应体里取出错误码与错误文案", async () => {
    const response = new Response(
      JSON.stringify({ error: { code: "DUPLICATE", message: "商品编码重复" } }),
      { status: 409 },
    );

    await expect(readErrorBody(response)).resolves.toEqual({
      code: "DUPLICATE",
      message: "商品编码重复",
    });
  });

  it("错误体缺字段时用状态码兜底", async () => {
    const response = new Response(JSON.stringify({}), { status: 500 });

    await expect(readErrorBody(response)).resolves.toEqual({
      code: "INTERNAL",
      message: "请求失败（500）",
    });
  });

  it("错误体不是合法 JSON 时用状态码兜底", async () => {
    const response = new Response("not json", { status: 502 });

    await expect(readErrorBody(response)).resolves.toEqual({
      code: "INTERNAL",
      message: "请求失败（502）",
    });
  });
});
