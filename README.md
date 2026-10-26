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

同一个实例上分三个库，互不干扰，各自的连接串都有环境变量可覆盖：

| 库         | 用途            | 环境变量            | 缺省库名   |
| ---------- | --------------- | ------------------- | ---------- |
| `erp`      | 开发库          | `DATABASE_URL`      | `erp`      |
| `erp_test` | 单元/迁移测试库 | `TEST_DATABASE_URL` | `erp_test` |
| `erp_e2e`  | 端到端测试库    | `E2E_DATABASE_URL`  | `erp_e2e`  |

`vp test` 只碰 `erp_test`，端到端只碰 `erp_e2e`，两者可以并发跑；开发库 `erp` 只被读取做隔离比对。

## 3. 跑迁移

```bash
pnpm db:migrate
```

迁移产物在 `packages/kernel-pg/drizzle/`，由 drizzle-kit 管理：

- `pnpm --filter @erp-inventory-sales/kernel-pg db:generate` 生成新迁移
- `pnpm --filter @erp-inventory-sales/kernel-pg db:migrate` 执行迁移

迁移可以在同一个库上重复执行：已执行的迁移由 `drizzle.__drizzle_migrations` 记账，不会重复建列、不会改变已有表与列。

当前迁移产出规格 R-NUM-1 声明的精度类型与商品档案的单位换算率类型（Postgres DOMAIN，落在 `erp` schema）：

| 类型                  | 存储精度        |
| --------------------- | --------------- |
| `erp.quantity`        | `numeric(18,3)` |
| `erp.unit_price`      | `numeric(18,6)` |
| `erp.amount`          | `numeric(18,2)` |
| `erp.conversion_rate` | `numeric(18,6)` |

业务表按这些 domain 列建，精度只有这一处定义。

已建的业务表（同样落在 `erp` schema）：

| 表                         | 说明                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `erp.items`                | 商品档案：编码、条码、名称、规格、品牌、分类、基本计量单位 |
| `erp.item_auxiliary_units` | 商品档案的辅助计量单位与单位换算率（1:N）                  |

`erp.items.code` 唯一；`erp.items.barcode` 用部分唯一索引，只在条码非空时唯一（允许多条档案没有条码）。

## 4. 跑检查与测试

**前提：先按第 1 步起编排。** 数据库相关用例连不上会直接失败，不会被跳过。

```bash
pnpm check
pnpm test
```

这两条是日常门禁。端到端用例不在门禁里，用第 7 节的一条命令单独跑。

## 5. 起参考应用

一条命令并行拉起 API 与管理后台：

```bash
vp run dev
```

输出按包名前缀分开，Ctrl-C 一起停：

```
packages/app dev: 进销存参考 API 已启动：http://127.0.0.1:3000
packages/web dev:   Local:   http://localhost:5173/
```

也可以只起其中一个：

```bash
pnpm --filter @erp-inventory-sales/app start   # API，默认 http://localhost:3000，端口用 PORT 覆盖
pnpm --filter @erp-inventory-sales/web dev      # 管理后台，默认 http://localhost:5173
```

启动命令会自动加载仓库根目录的 `.env`（文件不存在时忽略，不影响 CI 与生产环境）：

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/erp
ADMIN_USERNAME=erp_admin
ADMIN_PASSWORD=换成你自己的口令
```

`.env` 已在 `.gitignore` 里，不进版本库；`.env.example` 是它的模板。

```bash
curl http://localhost:3000/api/health
# {"data":{"status":"ok"}}
```

### 管理员账号

管理员账号只有一份，由环境变量提供；系统不开放注册接口，也没有管理员表。

除下面的 shell 写法外，也可以直接写进仓库根目录的 `.env`（启动命令自动加载，`.env` 不进版本库）。

```bash
# PowerShell
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_PASSWORD = "换成你自己的口令"

# bash
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="换成你自己的口令"
```

**两个变量都没有设置时，实例会退回到内置的种子数据管理员 `admin`（口令 `admin-dev-password`）**，
启动日志里会明确打印这条警告：

```
警告：未配置 ADMIN_USERNAME 与 ADMIN_PASSWORD，正在使用开发默认管理员 admin（仅供本地开发，部署方必须用 ADMIN_USERNAME 与 ADMIN_PASSWORD 覆盖）
```

这个默认账号**只用于本地开发**：它写在代码里、口令公开，谁拿到源码都能登录。
**部署方必须用 `ADMIN_USERNAME` 与 `ADMIN_PASSWORD` 覆盖它**，否则等于没有登录。

## HTTP 表面

所有响应走同一套信封：成功是 `{"data": ...}`，失败是 `{"error":{"code":...,"message":...}}`。

| 路径                              | 说明                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `GET /api/health`                 | 免会话：健康检查，返回 200 与成功信封                                        |
| `POST /api/login`                 | 免会话：用账号密码换会话，200 与 HttpOnly 会话 cookie                        |
| `GET /api/session`                | 受保护路由：返回当前管理员账号标识，未带会话凭据返回 401                     |
| `POST /api/decimals/amount`       | 受保护路由：精度校验探针，金额超过 2 位小数返回 400 与 `VALIDATION` 错误信封 |
| `GET /api/system/routes`          | 受保护路由：诊断端点，返回已注册的路由清单（前端脚手架演示用）               |
| `GET /api/items`                  | 受保护路由：商品档案列表                                                     |
| `POST /api/items`                 | 受保护路由：新建商品档案                                                     |
| `GET /api/items/:id`              | 受保护路由：按 id 取一条商品档案                                             |
| `PUT /api/items/:id`              | 受保护路由：编辑商品档案                                                     |
| `DELETE /api/items/:id`           | 受保护路由：删除一条没有被单据引用的商品档案                                 |
| `GET /api/items/by-barcode/:code` | 受保护路由：按商品条码查档案，查不到返回 404；系统不提供扫码自动建档         |
| `GET /api/inventory/balances`     | 受保护路由：库存查询，按仓库与商品过滤，每条记录含三种口径字段               |
| `GET /api/inventory/movements`    | 受保护路由：库存流水，按单据号、仓库、商品、行号与时间筛选，可按时间排序     |

免会话路由只有 `POST /api/login` 与 `GET /api/health` 两条，其余已注册路由在无会话时一律返回 401。

登录：

```bash
curl -i -X POST http://localhost:3000/api/login \
  -H "content-type: application/json" \
  -d '{"username":"admin","password":"admin-dev-password"}'
# HTTP/1.1 200 OK
# set-cookie: erp_session=...; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800
# {"data":{"adminId":"admin"}}
```

会话 cookie 是 HttpOnly，凭据不出现在响应体里；账号不存在与密码错误返回完全相同的响应体与状态码。

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

### 商品档案

侧栏「商品档案」是商品档案列表页（`/items`），可新建（`/items/new`）、编辑（`/items/$itemId/edit`）、
删除、按商品条码查询。一条档案含商品编码、商品条码、名称、规格、品牌、商品分类（文本字段）、
基本计量单位与若干辅助计量单位及其单位换算率；换算率必须为正数且最多 6 位小数。

系统**不提供扫码自动建档**：按条码查询只查既有档案，查不到就返回「查不到档案」的错误，不会凭空建档。

界面状态（筛选条件、选中项、面板开关）放在 jotai，服务端数据只放在 TanStack Query 缓存里，
两边都不复制商品列表。

### 库存查询与库存流水

侧栏「库存查询」是库存查询页（`/inventory`），「库存流水」是库存流水页（`/inventory/movements`）。

库存查询页按仓库与商品过滤，每行分三列显示**账面库存（`onHand`）、可用库存（`available`）、在途库存（`inTransit`）**，
三列各取查询结果里的对应字段，不合并成一个数字；本版本可用库存等于账面库存。

**`inTransit` 本版本恒为 0**：在途数量由调拨（票 17）产生，本票只交付这个字段的契约
（字段名逐字存在、类型是十进制文本、随库存查询一起返回）；在途口径由票 17 填实，票 18 断言它等于调拨单的在途数量。

库存流水页列出每一笔库存变动（单据号、行号、变动前后数量、单价、结转金额、发生时间），
可按单据号、仓库、商品、行号与时间筛选，并可按发生时间正序或倒序排序。
**库存流水是追加写的账本**：系统里没有修改或删除流水的接口，对流水发起 `PUT` / `DELETE` 一律返回 404。

### 登录与会话

浏览器只与前端同源交互，会话也走同一条链路：

1. 打开任一后台页面，未登录会被送到 `/login?next=<原本想去的地址>`；
2. 在登录页提交账号密码，前端的 server function 把凭据转给 Fastify 的 `POST /api/login`；
3. Fastify 校验通过后下发 HttpOnly 会话 cookie，server function 把它种在**浏览器当前的 web origin** 上
   （cookie 不出现在响应体里，前端代码不接触密码、不自行签发凭据）；
4. 登录成功后回到 `next` 指向的目标页，之后每次取数都由 server function 把会话 cookie 透传给 Fastify 校验；
5. 会话失效时，下一次取数会清掉查询缓存并跳回登录页，页面不残留任何业务数据。

登录用的账号密码就是第 5 节里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`（未配置时是种子数据管理员 `admin`）。

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

## 7. 跑端到端测试（数据库、API、前端全自动）

```bash
pnpm test:e2e
```

一条命令把环境拉起来并把两套用例都跑一遍，**用例运行前不需要人工先启动其中任何一个**：

1. `docker compose up -d postgres` —— 起仓库根的编排（镜像固定为 `postgres:16.13-alpine@sha256:20edbde…`，不用 `latest`），等健康检查通过；
2. 重建端到端数据库 `erp_e2e` 并跑迁移（`drizzle-kit migrate`）；
3. 起 Fastify（`DATABASE_URL` 指向**端到端数据库 `erp_e2e`**，端口 3000），等 `GET /api/health` 返回 200；
4. 起前端开发服务器（`vp dev`，端口 5173），等根路径返回 200；
5. 跑 vitest 端到端用例（`packages/*/e2e/**/*.e2e.ts`，API 侧断言）；
6. 跑 Playwright 端到端用例（`packages/web/e2e/*.pw.ts`，UI 侧断言）；
7. 对**开发库**做跑前/跑后快照并比对，证明开发库既没有本次写入的数据，也没有本次创建的结构。

同一次运行里 vitest 与 Playwright 两套用例都会执行。任一环节失败，进程退出码非 0，stderr 里同时给出
**失败用例名、API 启动日志、浏览器控制台错误**。

**命令形式**：vite-plus 1.0.0 的 CLI 不接受 `vp test:e2e`（报 `error: Command 'test:e2e' not found`，
退出码 2），所以实际用的是 `pnpm test:e2e`；`vp run test:e2e` 与它等价（`vp run` 执行根 `package.json`
里的同名脚本）。

### 三个库互不干扰

| 库         | 用途            | 谁在用                                       |
| ---------- | --------------- | -------------------------------------------- |
| `erp`      | 开发库          | 人与开发脚本；端到端只读它做隔离比对         |
| `erp_test` | 单元/迁移测试库 | `vp test`（迁移用例重建它）                  |
| `erp_e2e`  | 端到端测试库    | `pnpm test:e2e` 与单独跑的 web 包 Playwright |

端到端期间：API 连的是 `erp_e2e`；迁移、写入、建结构都发生在 `erp_e2e`；`erp` 只被读取做快照比对。
判定证据就是编排脚本打印的跑前/跑后两份开发库快照——两份完全一致即证明隔离成立。

因为 `vp test` 用 `erp_test`、端到端用 `erp_e2e`，两者各自 drop/recreate 的是不同的库，
**并发跑 `vp test` 与 `pnpm test:e2e` 不会互相冲掉**，跑完 e2e 再跑 `vp test` 也不会冲掉 e2e 写入的数据。

### CI

CI 上要预装 Playwright 浏览器（二进制约百兆级，本地首次运行也需要）：

```bash
pnpm --filter @erp-inventory-sales/web exec playwright install --with-deps chromium
```

只跑 Playwright 的旧命令仍然可用。配置里的 `webServer` 会拉起 Fastify 与前端开发服务器，
Fastify 由 `scripts/e2e/start-api.ts` 启动，连接的同样是端到端数据库 `erp_e2e`（既不是开发库 `erp`，
也不是 `vp test` 用的 `erp_test`）；该库不存在时会被创建并迁移：

```bash
pnpm --filter @erp-inventory-sales/web test:e2e
```

## 单一 vite 副本

整个 workspace 的 `vite` 都通过 `pnpm-workspace.yaml` 的 `overrides` 别名到 vite-plus 内置的
Vite 实现（`npm:@voidzero-dev/vite-plus-core@1.0.0`），根 `package.json` 也显式声明同一个别名。
**pnpm 12 不再读取 `package.json` 里的 `pnpm.overrides`**，覆盖规则只能写在 `pnpm-workspace.yaml`。

自检：

```bash
pnpm --filter @erp-inventory-sales/web exec vitest run src/single-vite.test.ts
```
