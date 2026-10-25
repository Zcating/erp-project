# 进销存内核 + 参考应用

pnpm workspace 单仓库：

| 包                   | 职责                                  |
| -------------------- | ------------------------------------- |
| `packages/shared`    | 跨包通用能力（十进制、zod）           |
| `packages/kernel`    | 纯领域内核与端口，零存储依赖          |
| `packages/kernel-pg` | Postgres / Drizzle 适配器与迁移产物   |
| `packages/app`       | Fastify 参考 API                      |
| `packages/web`       | 管理后台（TanStack Start + BFF 代理） |

## 前置条件

- Node.js 24+
- pnpm 12+
- Docker（只用来跑 Postgres，机器上不需要装 Postgres）

## 1. 起数据库编排

```bash
docker compose up -d postgres
```

编排文件在仓库根 `docker-compose.yml`：镜像双钉为 `postgres:16.13-alpine@sha256:20edbde7749f822887a1a022ad526fde0a47d6b2be9a8364433605cf65099416`（标签给出可读的具体版本号，摘要保证可复现、不随 16.x 漂移，也不用 `latest`），5432 暴露到宿主机，库名 `erp`，健康检查用 `pg_isready`。

停止编排：`docker compose down`。

## 2. 连接串

连接串只从环境变量读，代码里不散落口令：

```bash
# PowerShell
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/erp"

# bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/erp"
```

`postgres/postgres` 是 `docker-compose.yml` 里的本地默认值，共享环境用 `DATABASE_URL` 覆盖即可。
测试跑在同一个实例上的独立库 `erp_test`，需要时用 `TEST_DATABASE_URL` 覆盖。

## 3. 跑迁移

```bash
pnpm db:migrate
```

迁移产物在 `packages/kernel-pg/drizzle/`，由 drizzle-kit 管理：

- `pnpm --filter @erp-inventory-sales/kernel-pg db:generate` 生成新迁移
- `pnpm --filter @erp-inventory-sales/kernel-pg db:migrate` 执行迁移

迁移可以在同一个库上重复执行：已执行的迁移由 `drizzle.__drizzle_migrations` 记账，不会重复建列、不会改变已有表与列。

当前迁移只产出规格 R-NUM-1 声明的三种精度类型（Postgres DOMAIN，落在 `erp` schema）：

| 类型             | 存储精度        |
| ---------------- | --------------- |
| `erp.quantity`   | `numeric(18,3)` |
| `erp.unit_price` | `numeric(18,6)` |
| `erp.amount`     | `numeric(18,2)` |

业务表由后续票的迁移按这三个 domain 列建，精度只有这一处定义。

## 4. 跑检查与测试

**前提：先按第 1 步起编排。** 数据库相关用例连不上会直接失败，不会被跳过。

```bash
pnpm check
pnpm test
```

## 5. 起参考应用

```bash
pnpm --filter @erp-inventory-sales/app start
```

默认监听 `http://localhost:3000`，端口用 `PORT` 覆盖。

```bash
curl http://localhost:3000/api/health
# {"data":{"status":"ok"}}
```

## HTTP 表面

所有响应走同一套信封：成功是 `{"data": ...}`，失败是 `{"error":{"code":...,"message":...}}`。

| 路径                        | 说明                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| `GET /api/health`           | 健康检查，返回 200 与成功信封                                    |
| `GET /api/session`          | 受保护路由，未带会话凭据返回 401 与错误信封                      |
| `POST /api/decimals/amount` | 精度校验探针：金额超过 2 位小数返回 400 与 `VALIDATION` 错误信封 |
| `GET /api/system/routes`    | 诊断端点：返回已注册的路由清单（前端脚手架演示用）               |

错误码到状态码的映射：`VALIDATION` → 400、`NOT_FOUND` → 404、`CONFLICT` / `DUPLICATE` / `STATE_CONFLICT` / `STOCK_NEGATIVE` → 409、`UNAUTHENTICATED` → 401。

## 6. 起管理后台

浏览器只与前端同源交互：取数与提交一律经 `packages/web` 的 server functions 代理到 Fastify，
Fastify 的地址只在服务端可见。

```bash
# 先起参考应用（第 5 节），再起前端
pnpm --filter @erp-inventory-sales/app start
vp dev packages/web --port 5173
```

打开 `http://localhost:5173/`。`vp dev` / `vp build` 必须带 `packages/web` 作为项目根（或在
`packages/web` 目录内执行），在 workspace 根裸跑会 404。

Fastify 地址由服务端环境变量 `API_BASE_URL` 指定，默认 `http://localhost:3000`（与
`packages/app/src/server.ts` 的默认端口一致）：

```bash
# PowerShell
$env:API_BASE_URL = "http://localhost:3000"

# bash
export API_BASE_URL="http://localhost:3000"
```

生产构建：

```bash
vp build packages/web
```

## 7. 跑前端端到端用例

Playwright 用例在 `packages/web/e2e/`（命名 `*.pw.ts`，避免被 vitest 收走）：

```bash
pnpm --filter @erp-inventory-sales/web test:e2e
```

配置里的 `webServer` 会自动拉起 Fastify（3000）与前端开发服务器（5173）；
SSR 取数需要 Fastify 活着，否则列表页用例会失败。

## 单一 vite 副本

整个 workspace 的 `vite` 都通过 `pnpm-workspace.yaml` 的 `overrides` 别名到 vite-plus 内置的
Vite 实现（`npm:@voidzero-dev/vite-plus-core@1.0.0`），根 `package.json` 也显式声明同一个别名。
**pnpm 12 不再读取 `package.json` 里的 `pnpm.overrides`**，覆盖规则只能写在 `pnpm-workspace.yaml`。

自检：

```bash
pnpm --filter @erp-inventory-sales/web exec vitest run src/single-vite.test.ts
```
