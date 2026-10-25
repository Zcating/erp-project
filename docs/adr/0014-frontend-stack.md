# 前端栈：TanStack Start + React + shadcn/ui + Tailwind CSS + jotai；web 作为 Fastify 的 BFF

管理后台前端用 TanStack Start（SSR + 文件路由）、React、shadcn/ui 组件、Tailwind CSS 样式、jotai 管客户端状态。**浏览器只与 TanStack Start 同源交互**：web 的 server functions 代理到 Fastify（透传会话），Fastify 始终是唯一的数据入口与鉴权权威，它的地址不暴露给浏览器。服务端数据由 TanStack Query 缓存，jotai 只管纯客户端 UI 状态（筛选条件、选中项、面板开关），不复制服务端数据。

理由：让浏览器直连 Fastify 会带来跨域 cookie 与 CORS 的额外配置，且把内部服务地址暴露给前端；用 server functions 做 BFF 则前后端同源、会话传递路径单一，将来 Fastify 拆分或换地址前端零改动。而「取数」与「界面状态」分成两类，是避免前端把服务端数据复制进本地状态造成不一致的关键纪律。

## Consequences

- 前端包 `packages/web` 与 API 包 `packages/app` 之间没有源码级依赖，只通过 HTTP 契约耦合。
- 前端包不得引入数据库驱动，不得直接引用 `kernel` 或 `kernel-pg`；一切数据经由 Fastify。
- jotai 的 store 按 feature 归位（`features/<name>/stores/`），不设全局大 store；SSR 下 Provider 必须放在根布局，保证每个请求独立 store。
- 不开启 React Server Components（RSC 默认关闭）：Radix 组件树交互密集，RSC 边界会限制其使用，收益不抵成本。
- 若改用开发服务器代理 `/api` 直通 Fastify，需要先验证代理中间件与 SSR 中间件的先后顺序，不能默认可用。

## 兼容性结论（已实测）

TanStack Start 1.0 要求 Vite >= 8，vite-plus 1.0.0 内置的正是 Vite 8.3.1 的 fork（rolldown 1.2.11），两者可直接搭配，`vp build` / `vp dev` / `vp check` / `vp test` 全链路实测通过，无须退路。详见 ADR-0017。
