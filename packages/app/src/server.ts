import { buildApp } from "./build-app.js";

const port = Number(process.env.PORT ?? 3000);
const app = buildApp();

const address = await app.listen({ port, host: "0.0.0.0" });
process.stdout.write(`进销存参考 API 已启动：${address}\n`);
