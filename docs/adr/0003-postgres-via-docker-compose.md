# 持久化用 Postgres，实例由 Docker Compose 启动

参考应用的持久化选 Postgres，本地与 CI 的实例由 Docker Compose 启动（固定镜像版本，不依赖宿主装 Postgres）。理由：Postgres 是这套系统真正要面对的生产存储类型，用 Compose 起实例可以让开发与 CI 跑在同一套存储语义上；SQLite 会让类型、并发与事务行为在换库时暴露差异。

## Consequences

- 数据库镜像版本必须固定（不用 `latest`），否则 schema 与行为会在不同机器上漂移。
- e2e 需要一份与开发库隔离的数据库（独立 schema 或独立容器），否则测试会污染开发数据。
- 迁移脚本要能在空库上从零执行成功，这是 e2e 的前置条件。
