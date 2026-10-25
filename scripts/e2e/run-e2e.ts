import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { databaseUrl, e2eDatabaseUrl } from "../../packages/kernel-pg/src/db/config.ts";
import {
  connectToDatabase,
  databaseNameOf,
  errorMessage,
  killTree,
  prepareE2eDatabase,
  quoteIdentifier,
  repoRoot,
  runCommand,
  spawnApi,
  startProcess,
  withDatabaseName,
} from "./e2e-environment.ts";
import type { CommandResult } from "./e2e-environment.ts";

type DatabaseSnapshot = {
  schemas: string[];
  tables: Array<{ schema: string; name: string }>;
  columns: Array<{ schema: string; table: string; name: string; type: string }>;
  domains: Array<{ domain: string; baseType: string }>;
  rowCounts: Array<{ schema: string; table: string; rows: number }>;
};

type ServiceHandle = { child: ChildProcess };

type StepResult<T> = { ok: true; value: T } | { ok: false };

const apiPort = 3000;
const webPort = 5173;
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;

const devDatabaseUrl = databaseUrl();
const e2eDatabaseUrlValue = e2eDatabaseUrl();
const e2eDatabaseName = databaseNameOf(e2eDatabaseUrlValue);
const browserConsoleLogPath = path.join(os.tmpdir(), "erp-e2e-browser-console.log");

const failures: string[] = [];
const apiLog: string[] = [];
const browserConsoleErrors: string[] = [];
const services: ServiceHandle[] = [];
let composeStartedHere = false;
let vitestOutput: CommandResult | undefined;
let playwrightOutput: CommandResult | undefined;

async function main(): Promise<number> {
  log(
    `[环境] 开发库 ${devDatabaseUrl} / 端到端数据库 ${e2eDatabaseUrlValue}（单元测试库另算，互不干扰）`,
  );

  if (!(await runStep("拉起 Postgres 编排", startCompose)).ok) {
    return finish();
  }
  if (!(await runStep("等待 Postgres 健康", () => waitForPostgres(120_000))).ok) {
    return finish();
  }

  const before = await runStep("快照开发库（跑前）", () => snapshotDatabase(devDatabaseUrl));
  if (before.ok) {
    log(`[开发库快照·跑前] ${JSON.stringify(before.value)}`);
  }

  if (!(await runStep("准备端到端数据库并迁移", prepareE2eDatabaseForRun)).ok) {
    return finish();
  }

  const api = await runStep("启动 API（指向端到端数据库）", startApi);
  if (!api.ok) {
    return finish();
  }
  if (
    !(
      await runStep("等待 API 健康检查通过", () =>
        waitForHttp(`${apiBaseUrl}/api/health`, 60_000, "API"),
      )
    ).ok
  ) {
    return finish();
  }

  const web = await runStep("启动前端开发服务器", startWeb);
  if (!web.ok) {
    return finish();
  }
  if (!(await runStep("等待前端就绪", () => waitForHttp(webBaseUrl, 120_000, "前端"))).ok) {
    return finish();
  }

  await runStep("跑 vitest 端到端用例", runVitestE2E);
  await runStep("跑 Playwright 端到端用例", runPlaywrightE2E);

  const after = await runStep("快照开发库（跑后）", () => snapshotDatabase(devDatabaseUrl));
  if (after.ok) {
    log(`[开发库快照·跑后] ${JSON.stringify(after.value)}`);
    if (before.ok) {
      if (JSON.stringify(before.value) === JSON.stringify(after.value)) {
        log("[隔离判定] 开发库跑前跑后完全一致：本次写入与建结构都发生在测试库");
      } else {
        failures.push("开发库在端到端跑完后发生了变化（测试库隔离被破坏）");
        logError("[隔离判定] 开发库跑前跑后不一致，测试库隔离被破坏");
      }
    }
  }

  return finish();
}

function finish(): number {
  if (failures.length > 0) {
    printFailureSummary();
  }
  for (const service of services) {
    killTree(service.child);
  }
  if (composeStartedHere) {
    const stopped = runCommand("docker", ["compose", "stop", "postgres"]);
    log(`[编排] 停止本次拉起的 Postgres：${stopped.stdout.trim() || stopped.stderr.trim()}`);
  }
  return failures.length === 0 ? 0 : 1;
}

function startCompose(): Promise<void> {
  const running = runCommand("docker", ["compose", "ps", "-q", "--status", "running", "postgres"]);
  const wasRunning = running.stdout.trim().length > 0;

  const up = runCommand("docker", ["compose", "up", "-d", "postgres"]);
  if (up.code !== 0) {
    throw new Error(`docker compose up 失败：${up.stderr.trim() || up.stdout.trim()}`);
  }
  composeStartedHere = !wasRunning;
  log(`[编排] ${(up.stdout + up.stderr).trim()}`);
  return Promise.resolve();
}

async function waitForPostgres(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const maintenanceUrl = withDatabaseName(devDatabaseUrl, "postgres");
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const client = connectToDatabase(maintenanceUrl);
      await client.connect();
      await client.query("select 1");
      await client.end();
      log("[编排] Postgres 已就绪");
      return;
    } catch (error) {
      lastError = errorMessage(error);
      await sleep(1_000);
    }
  }
  throw new Error(`等待 Postgres 就绪超时：${lastError}`);
}

async function prepareE2eDatabaseForRun(): Promise<void> {
  await prepareE2eDatabase({ recreate: true });
  log(`[迁移] 端到端数据库 ${e2eDatabaseName} 迁移完成`);
}

async function snapshotDatabase(url: string): Promise<DatabaseSnapshot> {
  const client = connectToDatabase(url);
  await client.connect();
  try {
    const schemas = await client.query<{ schema_name: string }>(
      "select schema_name from information_schema.schemata where schema_name not in ('pg_catalog', 'information_schema') and schema_name not like 'pg\\_%' order by schema_name",
    );
    const tables = await client.query<{ table_schema: string; table_name: string }>(
      "select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema') and table_schema not like 'pg\\_%' and table_type = 'BASE TABLE' order by table_schema, table_name",
    );
    const columns = await client.query<{
      table_schema: string;
      table_name: string;
      column_name: string;
      udt_name: string;
    }>(
      "select table_schema, table_name, column_name, udt_name from information_schema.columns where table_schema not in ('pg_catalog', 'information_schema') and table_schema not like 'pg\\_%' order by table_schema, table_name, column_name",
    );
    const domains = await client.query<{ domain: string; base_type: string }>(
      `select n.nspname || '.' || t.typname as domain, format_type(t.typbasetype, t.typtypmod) as base_type
       from pg_type t join pg_namespace n on n.oid = t.typnamespace
       where t.typtype = 'd' and n.nspname not in ('pg_catalog', 'information_schema')
       order by domain`,
    );

    const rowCounts: DatabaseSnapshot["rowCounts"] = [];
    for (const table of tables.rows) {
      const counted = await client.query<{ rows: number }>(
        `select count(*)::int as rows from ${quoteIdentifier(table.table_schema)}.${quoteIdentifier(table.table_name)}`,
      );
      rowCounts.push({
        schema: table.table_schema,
        table: table.table_name,
        rows: counted.rows[0]?.rows ?? 0,
      });
    }

    return {
      schemas: schemas.rows.map((row) => row.schema_name),
      tables: tables.rows.map((row) => ({ schema: row.table_schema, name: row.table_name })),
      columns: columns.rows.map((row) => ({
        schema: row.table_schema,
        table: row.table_name,
        name: row.column_name,
        type: row.udt_name,
      })),
      domains: domains.rows.map((row) => ({ domain: row.domain, baseType: row.base_type })),
      rowCounts,
    };
  } finally {
    await client.end();
  }
}

function startApi(): Promise<ServiceHandle> {
  const child = spawnApi(e2eDatabaseUrlValue, apiPort);
  services.push(attachService("api", child, apiLog));
  log(`[api] DATABASE_URL=${e2eDatabaseUrlValue} PORT=${apiPort}`);
  return Promise.resolve(services[services.length - 1] as ServiceHandle);
}

function startWeb(): Promise<ServiceHandle> {
  const child = startProcess(
    localBin("vp"),
    ["dev", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
    {
      cwd: path.join(repoRoot, "packages/web"),
      env: { ...process.env, API_BASE_URL: apiBaseUrl },
    },
  );
  services.push(attachService("web", child, []));
  return Promise.resolve(services[services.length - 1] as ServiceHandle);
}

function attachService(name: string, child: ChildProcess, sink: string[]): ServiceHandle {
  const record = (chunk: Buffer | string): void => {
    const text = chunk.toString();
    sink.push(text);
    process.stderr.write(`[${name}] ${text}`);
  };
  child.stdout?.on("data", record);
  child.stderr?.on("data", record);
  return { child };
}

async function waitForHttp(url: string, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      await response.arrayBuffer();
      if (response.ok) {
        log(`[就绪] ${label} ${url} 返回 ${response.status}`);
        return;
      }
      lastError = `状态码 ${response.status}`;
    } catch (error) {
      lastError = errorMessage(error);
    }
    await sleep(500);
  }
  throw new Error(`${label} 未在 ${timeoutMs} 毫秒内就绪：${lastError}`);
}

async function runVitestE2E(): Promise<CommandResult> {
  const result = await collect(
    startProcess(localBin("vp"), ["test", "--config", "vitest.e2e.config.ts"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        DATABASE_URL: devDatabaseUrl,
        E2E_DATABASE_URL: e2eDatabaseUrlValue,
        E2E_API_BASE_URL: apiBaseUrl,
      },
    }),
    "vitest",
  );
  vitestOutput = result;
  if (result.code !== 0) {
    process.stderr.write(`[vitest 失败输出]\n${result.stdout}\n${result.stderr}\n`);
    throw new Error(`vitest 退出码 ${result.code}`);
  }
  return result;
}

async function runPlaywrightE2E(): Promise<CommandResult> {
  rmSync(browserConsoleLogPath, { force: true });
  const result = await collect(
    startProcess(playwrightBin(), ["test"], {
      cwd: path.join(repoRoot, "packages/web"),
      env: {
        ...process.env,
        E2E_REUSE_SERVERS: "1",
        E2E_DATABASE_URL: e2eDatabaseUrlValue,
        E2E_BROWSER_CONSOLE_LOG: browserConsoleLogPath,
      },
    }),
    "playwright",
  );
  playwrightOutput = result;
  browserConsoleErrors.push(...readBrowserConsoleLog());
  if (result.code !== 0) {
    process.stderr.write(`[playwright 失败输出]\n${result.stdout}\n${result.stderr}\n`);
    throw new Error(`playwright 退出码 ${result.code}`);
  }
  return result;
}

function collect(child: ChildProcess, label: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("close", (code) => {
      log(`[${label}] 退出码 ${code ?? -1}`);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function printFailureSummary(): void {
  const failureLines = [
    ...collectFailureLines(vitestOutput?.stdout ?? ""),
    ...collectFailureLines(vitestOutput?.stderr ?? ""),
    ...collectFailureLines(playwrightOutput?.stdout ?? ""),
    ...collectFailureLines(playwrightOutput?.stderr ?? ""),
  ];
  const summary: string[] = [];
  summary.push("");
  summary.push("========== 端到端失败诊断 ==========");
  summary.push(`失败原因：${failures.join("；")}`);
  summary.push("失败用例名：");
  summary.push(
    ...(failureLines.length > 0 ? failureLines.map((line) => `  - ${line}`) : ["  （未捕获到）"]),
  );
  summary.push("API 启动日志（末尾 40 行）：");
  summary.push(...tail(apiLog.join("").split(/\r?\n/), 40).map((line) => `  ${line}`));
  summary.push("浏览器控制台错误：");
  summary.push(
    ...(browserConsoleErrors.length > 0
      ? browserConsoleErrors.map((line) => `  ${line}`)
      : ["  （未捕获到）"]),
  );
  summary.push("======================================");
  process.stderr.write(`${summary.join("\n")}\n`);
}

function collectFailureLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /FAIL|✘|×/.test(line));
}

function readBrowserConsoleLog(): string[] {
  try {
    return readFileSync(browserConsoleLogPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function localBin(name: string): string {
  const suffix = process.platform === "win32" ? ".cmd" : "";
  return path.join(repoRoot, "node_modules", ".bin", `${name}${suffix}`);
}

function playwrightBin(): string {
  const suffix = process.platform === "win32" ? ".cmd" : "";
  return path.join(repoRoot, "packages", "web", "node_modules", ".bin", `playwright${suffix}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tail(lines: string[], count: number): string[] {
  return lines.slice(Math.max(0, lines.length - count));
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function logError(message: string): void {
  process.stderr.write(`${message}\n`);
}

async function runStep<T>(name: string, action: () => Promise<T>): Promise<StepResult<T>> {
  try {
    const value = await action();
    log(`[完成] ${name}`);
    return { ok: true, value };
  } catch (error) {
    failures.push(`${name}：${errorMessage(error)}`);
    logError(`[失败] ${name}：${errorMessage(error)}`);
    return { ok: false };
  }
}

process.on("exit", () => {
  for (const service of services) {
    killTree(service.child);
  }
});

try {
  process.exit(await main());
} catch (error) {
  logError(`[致命错误] ${errorMessage(error)}`);
  process.exit(1);
}
