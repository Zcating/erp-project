import { describe, expect, it } from "vitest";
import { inventory, itemMaster, ports, purchasing, selling } from "./index.js";

describe("kernel package", () => {
  it("exposes its public surface", () => {
    expect({ inventory, ports, purchasing, selling }).toEqual({
      inventory: {},
      ports: {},
      purchasing: {},
      selling: {},
    });
  });

  it("商品档案 feature 的公开面带领域规则与仓储端口实现", () => {
    expect(Object.keys(itemMaster).sort()).toEqual([
      "CONVERSION_RATE_SCALE",
      "createInMemoryItemMasterRepository",
      "createItemMasterService",
      "formatConversionRate",
      "validateConversionRate",
      "validateItemMasterInput",
    ]);
    expect(itemMaster.CONVERSION_RATE_SCALE).toBe(6);
  });
});
