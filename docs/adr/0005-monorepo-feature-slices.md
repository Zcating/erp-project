# 代码组织：pnpm workspace 多包 + 每个包内按 feature 纵切

仓库是 pnpm workspace 单体仓库，分四个包：`kernel`（纯领域逻辑与端口定义）、`kernel-pg`（Postgres/Drizzle 适配器）、`app`（Fastify 参考应用）、`shared`（跨包通用能力：类型、错误信封、schema 基建）。每个包内部按 **feature 纵切**而不是按技术类型横切，每个 feature 有自己的 `lib/`（纯领域逻辑）、`index.ts`（公开面）、`routes/` + `schema/`（参考应用里的数据边界层）。

理由：feature 纵切让「一个业务能力」的文件聚在一起、改动不必横跨 model/service/repository 三个目录；公开面（桶文件）把跨 feature 复用的入口收窄，防止依赖成环。

## Consequences

- 依赖方向单向向下：`app → kernel-pg → kernel`，`shared` 不依赖任何上层；包与 feature 之间只经 `index.ts` 公开面通信，跨 feature 复用若形成环则上移到 `shared`。
- 文件名 kebab-case；测试与被测文件同目录。
- 入口层（Fastify 路由注册）保持薄：只做输入校验、调用 feature、映射错误与状态码，不写业务逻辑。
