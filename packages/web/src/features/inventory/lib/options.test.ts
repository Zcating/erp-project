import { describe, expect, it } from "vitest";
import { movementOrderOptions } from "./options";

describe("库存域的候选集构造", () => {
  it("排序方向选项没有空值项，正序是 asc、倒序是 desc", () => {
    expect(movementOrderOptions()).toEqual([
      { value: "asc", label: "时间正序" },
      { value: "desc", label: "时间倒序" },
    ]);
  });
});
