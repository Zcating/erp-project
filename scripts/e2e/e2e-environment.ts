import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { e2eDatabaseUrl } from "../../packages/kernel-pg/src/db/config.ts";
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
} from "../../packages/app/src/features/session/credentials.ts";

export type QueryRows<Row> = { rows: Row[] };

export type DatabaseClient = {
  connect(): Promise<void>;
  query<Row>(text: string, values?: unknown[]): Promise<QueryRows<Row>>;
  end(): Promise<void>;
};

export type DatabaseClientConstructor = new (config: {
  connectionString: string;
}) => DatabaseClient;

export type CommandResult = { code: number; stdout: string; stderr: string };

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const requireFromKernelPg = createRequire(path.join(repoRoot, "packages/kernel-pg/package.json"));
const { Client } = requireFromKernelPg("pg") as { Client: DatabaseClientConstructor };

export function connectToDatabase(url: string): DatabaseClient {
  return new Client({ connectionString: url });
}

export async function prepareE2eDatabase(options: { recreate: boolean }): Promise<string> {
  const url = e2eDatabaseUrl();
  const databaseName = databaseNameOf(url);
  const client = connectToDatabase(withDatabaseName(url, "postgres"));
  await client.connect();
  try {
    await client.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [databaseName],
    );
    if (options.recreate) {
      await client.query(`drop database if exists ${quoteIdentifier(databaseName)}`);
    }
    const existing = await client.query<{ datname: string }>(
      "select datname from pg_database where datname = $1",
      [databaseName],
    );
    if (existing.rows.length === 0) {
      await client.query(`create database ${quoteIdentifier(databaseName)}`);
    }
  } finally {
    await client.end();
  }

  const migration = runCommand(
    "pnpm",
    ["--filter", "@erp-inventory-sales/kernel-pg", "db:migrate"],
    { env: { ...process.env, DATABASE_URL: url } },
  );
  if (migration.code !== 0) {
    throw new Error(`迁移端到端数据库失败：${migration.stderr.trim() || migration.stdout.trim()}`);
  }
  return url;
}

export function spawnApi(
  databaseUrl: string,
  port: number,
  extraEnv: NodeJS.ProcessEnv = {},
): ChildProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    E2E_DATABASE_URL: databaseUrl,
    PORT: String(port),
  };
  env.ADMIN_USERNAME = DEFAULT_ADMIN_USERNAME;
  env.ADMIN_PASSWORD = DEFAULT_ADMIN_PASSWORD;
  return startProcess("pnpm", ["--filter", "@erp-inventory-sales/app", "start"], {
    cwd: repoRoot,
    env: { ...env, ...extraEnv },
  });
}

export function startProcess(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): ChildProcess {
  if (process.platform === "win32") {
    return spawn([command, ...args].join(" "), { ...options, shell: true });
  }
  return spawn(command, args, { ...options, detached: true });
}

export function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): CommandResult {
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].join(" "), {
          cwd: options.cwd ?? repoRoot,
          env: options.env ?? process.env,
          encoding: "utf8",
          shell: true,
        })
      : spawnSync(command, args, {
          cwd: options.cwd ?? repoRoot,
          env: options.env ?? process.env,
          encoding: "utf8",
        });
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function killTree(child: ChildProcess): void {
  if (child.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

export function databaseNameOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

export function withDatabaseName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
