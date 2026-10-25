import { e2eDatabaseUrl } from "../../packages/kernel-pg/src/db/config.ts";
import { errorMessage, killTree, prepareE2eDatabase, spawnApi } from "./e2e-environment.ts";

const port = Number(process.env.PORT ?? 3000);
const databaseUrl = e2eDatabaseUrl();

try {
  await prepareE2eDatabase({ recreate: false });
  process.stderr.write(`端到端数据库已就绪：${databaseUrl}\n`);
} catch (error) {
  process.stderr.write(
    `端到端数据库准备失败，API 仍按 ${databaseUrl} 启动：${errorMessage(error)}\n`,
  );
}

const child = spawnApi(databaseUrl, port);
child.stdout?.on("data", (chunk: Buffer | string) => {
  process.stdout.write(chunk);
});
child.stderr?.on("data", (chunk: Buffer | string) => {
  process.stderr.write(chunk);
});

const stop = (): void => {
  killTree(child);
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

child.on("close", (code) => {
  process.exit(code ?? 0);
});
