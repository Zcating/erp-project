# 数据访问：内核只定义端口，Postgres 适配器单开一包

内核只定义 Repository 端口（接口），Postgres 的 Drizzle 实现放在独立的适配器包（`packages/kernel-pg`）里，参考应用通过依赖注入拿到实现。理由：内核要保持零存储依赖，才能被不同存储、不同业务方复用；但「Postgres + Drizzle」这套实现本身是有价值的交付物，应该随内核一起发布，而不是散落在某个应用里让人重写。

## Considered Options

- 内核直接用 Drizzle/pg 实现仓储——否决：内核与 Postgres 绑定，不再通用。
- 适配器只放在参考应用里——否决：业务方接入时得自己重写一遍适配层。

## Consequences

- 端口定义放在 `packages/kernel/src/shared/ports/`，适配器在 `packages/kernel-pg` 实现它们，依赖方向永远是 kernel ← kernel-pg。
- 内核的测试全部用内存假实现（in-memory fake），不依赖数据库；数据库相关测试只出现在适配器包与参考应用的集成测试里。
