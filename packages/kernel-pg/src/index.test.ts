import { describe, expect, it } from "vitest";
import { kernelPg } from "./index.js";

describe("kernel-pg package", () => {
  it("exposes its public surface", () => {
    expect(kernelPg).toEqual({});
  });
});
