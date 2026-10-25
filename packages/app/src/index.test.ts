import { describe, expect, it } from "vitest";
import { app } from "./index.js";

describe("app package", () => {
  it("exposes its public surface", () => {
    expect(app).toEqual({});
  });
});
