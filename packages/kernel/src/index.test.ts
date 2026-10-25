import { describe, expect, it } from "vitest";
import { inventory, itemMaster, ports, purchasing, selling } from "./index.js";

describe("kernel package", () => {
  it("exposes its public surface", () => {
    expect({ inventory, itemMaster, ports, purchasing, selling }).toEqual({
      inventory: {},
      itemMaster: {},
      ports: {},
      purchasing: {},
      selling: {},
    });
  });
});
