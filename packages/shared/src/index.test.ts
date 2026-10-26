import { describe, expect, it } from "vitest";
import { shared } from "./index";

describe("shared package", () => {
  it("exposes its public surface", () => {
    expect(shared).toEqual({});
  });
});
