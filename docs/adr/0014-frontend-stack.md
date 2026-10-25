# 前端栈：TanStack Start + React + shadcn/ui + Tailwind CSS + jotai

管理后台前端用 TanStack Start（SSR + 文件路由）、React、shadcn/ui 组件、Tailwind CSS 样式、jotai 管客户端状态。**前端只通过 Fastify API 取数与提交**：浏览器侧用相对路径请求，SSR 侧用绝对地址请求同一套 API，两侧共用同一组请求函数。服务端数据（库存、单据、流水）由 TanStack Query 之类的查询缓存负责，jotai 只管纯客户端 UI 状态（当前选中行、筛选条件、面板开关），不复制服务端数据。

理由：把「取数」与「界面状态」分成两类，是避免前端把服务端数据复制进本地状态造成不一致的关键纪律；而让前端只走 API、不直连内核，则保证内核只有一条 HTTP 入口，行为与 e2e 断言的落点一致。

## Consequences

- 前端包 `packages/web` 与 API 包 `packages/app` 之间没有源码级依赖，只通过 HTTP 契约耦合。
- 前端包不得引入数据库驱动，不得直接引用 `kernel` 或 `kernel-pg`。
- jotai 的 store 按 feature 归位（`features/<name>/stores/`），不放全局大 store。
- 若 TanStack Start 的 Vite 插件与 vite-plus（rolldown-vite）不兼容，退路见 ADR-0014 的后续说明。
