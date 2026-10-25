# Vite 在整个 workspace 必须解析到同一份物理副本

整个仓库的 `vite` 一律通过 workspace 级 `overrides` 别名到 vite-plus 内置的 Vite 实现（`npm:@voidzero-dev/vite-plus-core@<与 vite-plus 一致的版本>`），根 `package.json` 也要显式声明同一别名。**注意 pnpm 12 已不再读取 `package.json` 里的 `pnpm.overrides`，覆盖规则必须写在 `pnpm-workspace.yaml`。**

理由：TanStack Start 的开发期中间件用 `instanceof RunnableDevEnvironment` 判断环境类型；一旦 workspace 里出现两份 vite 的物理副本，同一份源码会有两个类身份，判断恒为 false，开发服务器所有路由返回 404 且报错信息极难定位。这不是理论风险——上游曾因此长期挂着 404 类 issue，根因都是「装了两份 vite」。

## Consequences

- 新增任何依赖 Vite 的包时，不得让它解析到 npm 上的标准 `vite`；若某个包硬依赖标准 vite，需要用同样的别名覆盖它。
- 保持根 `vite-plus` 与 `vite-plus-core` 的版本一致（当前锁在 1.0.0，与全局 CLI 同版本），避免出现第二份实现。
- CI 与本地都用同一份 `pnpm-lock.yaml`，不在安装后手工改依赖。
- 自检方式：安装后确认依赖树里只存在一份 vite 实现，且各包的 `vite` 解析到同一路径。
