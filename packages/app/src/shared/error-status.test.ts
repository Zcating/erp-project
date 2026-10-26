import { describe, expect, it } from "vitest";
import { httpStatusForErrorCode } from "./error-status";

describe("错误码到状态码的映射", () => {
  it("内核六类错误码映射到固定状态码", () => {
    expect(httpStatusForErrorCode("VALIDATION")).toBe(400);
    expect(httpStatusForErrorCode("NOT_FOUND")).toBe(404);
    expect(httpStatusForErrorCode("CONFLICT")).toBe(409);
    expect(httpStatusForErrorCode("DUPLICATE")).toBe(409);
    expect(httpStatusForErrorCode("STATE_CONFLICT")).toBe(409);
    expect(httpStatusForErrorCode("STOCK_NEGATIVE")).toBe(409);
  });

  it("未登录映射 401，内部错误映射 500", () => {
    expect(httpStatusForErrorCode("UNAUTHENTICATED")).toBe(401);
    expect(httpStatusForErrorCode("INTERNAL")).toBe(500);
  });

  it("未知错误码兜底为 500", () => {
    expect(httpStatusForErrorCode("SOMETHING_ELSE")).toBe(500);
  });
});
