import { describe, expect, it } from "vitest";
import { toFormSubmitResult } from "./form";

describe("表单提交结果包装", () => {
  it("提交成功时只回传成功标记", async () => {
    const result = await toFormSubmitResult(async () => ({ ok: true as const }));

    expect(result).toEqual({ ok: true });
  });

  it("服务端返回失败结果时回传失败原因", async () => {
    const result = await toFormSubmitResult(async () => ({
      ok: false as const,
      message: "商品编码重复",
    }));

    expect(result).toEqual({ ok: false, message: "商品编码重复" });
  });

  it("提交抛出异常时把异常文案作为失败原因", async () => {
    const result = await toFormSubmitResult(async () => {
      throw new Error("网络不可达");
    });

    expect(result).toEqual({ ok: false, message: "网络不可达" });
  });
});
