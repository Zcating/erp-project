const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/erp";
const DEFAULT_TEST_DATABASE_NAME = "erp_test";

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

export function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit !== undefined && explicit !== "") {
    return explicit;
  }
  return withDatabaseName(databaseUrl(), DEFAULT_TEST_DATABASE_NAME);
}

function withDatabaseName(url: string, databaseName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}
