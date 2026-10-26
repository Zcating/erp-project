import { afterEach, describe, expect, it } from "vitest";
import { databaseUrl, e2eDatabaseUrl, testDatabaseUrl } from "./config";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalTestDatabaseUrl = process.env.TEST_DATABASE_URL;
const originalE2eDatabaseUrl = process.env.E2E_DATABASE_URL;

afterEach(() => {
  restore("DATABASE_URL", originalDatabaseUrl);
  restore("TEST_DATABASE_URL", originalTestDatabaseUrl);
  restore("E2E_DATABASE_URL", originalE2eDatabaseUrl);
});

describe("数据库连接串", () => {
  it("开发库、单元测试库、端到端测试库是三个不同的库", () => {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/erp";
    delete process.env.TEST_DATABASE_URL;
    delete process.env.E2E_DATABASE_URL;

    expect(databaseName(databaseUrl())).toBe("erp");
    expect(databaseName(testDatabaseUrl())).toBe("erp_test");
    expect(databaseName(e2eDatabaseUrl())).toBe("erp_e2e");
  });

  it("TEST_DATABASE_URL 与 E2E_DATABASE_URL 各自优先于缺省推导", () => {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/erp";
    process.env.TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/unit_db";
    process.env.E2E_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/e2e_db";

    expect(testDatabaseUrl()).toBe("postgresql://postgres:postgres@localhost:5432/unit_db");
    expect(e2eDatabaseUrl()).toBe("postgresql://postgres:postgres@localhost:5432/e2e_db");
  });

  it("端到端测试库不会落到开发库上", () => {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/erp";
    delete process.env.E2E_DATABASE_URL;

    expect(e2eDatabaseUrl()).not.toBe(databaseUrl());
    expect(databaseName(e2eDatabaseUrl())).not.toBe(databaseName(databaseUrl()));
  });
});

function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

function restore(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
