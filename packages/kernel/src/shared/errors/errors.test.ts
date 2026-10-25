import { describe, expect, it } from "vitest";
import {
  ConflictError,
  DuplicateError,
  KERNEL_ERROR_CODES,
  NotFoundError,
  StateConflictError,
  StockNegativeError,
  ValidationError,
} from "./index.js";

describe("内核错误分类", () => {
  it("每类错误都带可判别的错误码", () => {
    expect(new ValidationError("金额精度超限").code).toBe("VALIDATION");
    expect(new NotFoundError("商品不存在").code).toBe("NOT_FOUND");
    expect(new ConflictError("冲突").code).toBe("CONFLICT");
    expect(new DuplicateError("重复").code).toBe("DUPLICATE");
    expect(new StateConflictError("状态不允许").code).toBe("STATE_CONFLICT");
    expect(new StockNegativeError("库存为负").code).toBe("STOCK_NEGATIVE");
  });

  it("错误码集合恰好是规格要求的六类", () => {
    expect([...KERNEL_ERROR_CODES]).toEqual([
      "VALIDATION",
      "NOT_FOUND",
      "CONFLICT",
      "DUPLICATE",
      "STATE_CONFLICT",
      "STOCK_NEGATIVE",
    ]);
  });

  it("错误带可读消息，且消息不被错误码吞掉", () => {
    expect(new ValidationError("金额最多 2 位小数").message).toBe("金额最多 2 位小数");
  });
});
