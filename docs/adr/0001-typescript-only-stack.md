# 单语言 TypeScript；Fastify 做 API，TanStack Start 做前端

本项目用单语言 TypeScript：领域内核与两端交付物都是 TypeScript。Fastify 提供给程序调用的 HTTP API；TanStack Start + React 提供给使用者操作的管理后台（shadcn/ui + Tailwind CSS 做组件与样式，jotai 管客户端状态）。理由：内核与两端共享同一套类型与错误语义，规则改动单点落地、不必跨语言对齐契约；前后端同语言不需要维护 IDL 或两套模型；UI 用成熟组件库而不是从零造控件。

## Consequences

- monorepo 五个包：`kernel`（领域内核）、`kernel-pg`（Postgres 适配器）、`app`（Fastify API）、`web`（TanStack Start 前端）、`shared`（跨包通用能力）。
- 内核永不感知 HTTP 与 UI；Fastify 与前端都只是内核的使用者。
- 并发扣减与金额/数量精度在 TypeScript 侧解决（BigInt 或 decimal 库 + 乐观锁/悲观锁）。
- 全项目验证命令统一为 `vp check && vp test`，不需要跨语言的双重测试编排。
