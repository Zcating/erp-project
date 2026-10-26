import { buildApp } from "./build-app";
import { resolveAdminCredentials } from "./features/session";

const port = Number(process.env.PORT ?? 3000);
const admin = resolveAdminCredentials();
if (admin.isDefault) {
  process.stdout.write(
    `警告：未配置 ${admin.missing.join(" 与 ")}，正在使用开发默认管理员 ${admin.credentials.username}（仅供本地开发，部署方必须用 ADMIN_USERNAME 与 ADMIN_PASSWORD 覆盖）\n`,
  );
}
const app = buildApp({ adminCredentials: admin.credentials });

const address = await app.listen({ port, host: "0.0.0.0" });
process.stdout.write(`进销存参考 API 已启动：${address}\n`);
