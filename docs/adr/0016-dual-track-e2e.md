# e2e 双轨：vitest 断言 API，Playwright 断言 UI

参考应用的测试分两条线：**API 层**用 vitest 起服务/注入请求，断言接口的响应与状态码；**UI 层**用 Playwright 驱动真实浏览器，断言用户看得见的行为（页面渲染、点击过账后列表与库存数字变化）。两条线都绿才算通过。理由：内核规则用单元测试锁死，API 契约用 vitest 锁死，而「管理员在页面上点一下，库存数字变了」这件事只有真实浏览器能证明。

## Consequences

- e2e 需要同时拉起 Postgres（Docker Compose）、Fastify API 与前端开发/预览服务，由 Playwright 的 `webServer` 配置负责。
- e2e 的数据库必须与开发库隔离（独立 schema 或独立容器），跑完不污染开发数据。
- 引入 Playwright 意味着需要下载浏览器二进制（首次约百兆级），CI 与本地都要能装。
- 单据过账、库存查询、库存流水这几条主线用 UI 断言；退货/盘点/调拨的完整流程用 API 断言（UI 只保留入口与列表）。
