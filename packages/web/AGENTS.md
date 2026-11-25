# packages/web 前端写法

改动 `packages/web` 前读这份。

## 技术栈

| 用途        | 用什么                                            |
| ----------- | ------------------------------------------------- |
| 控件        | 先考虑本地（`src/components/`）再考虑 shadcn/ui   |
| 表单        | `@tanstack/react-form` + zod                      |
| 数据获取    | TanStack Query + server functions（代理 Fastify） |
| 客户端状态  | jotai（只放 UI 状态）                             |
| 路由 / 样式 | TanStack Router 文件路由 / Tailwind CSS           |

前端栈与数据边界的决策见 `docs/adr/0014-frontend-stack.md`。

## 规则

### 控件

- 控件优先用仓库自有的 shadcn/ui；缺组件走 shadcn CLI：`pnpm --filter @erp-project/web exec shadcn add <组件名> --yes`

### 表单

- zod 规则放 `lib/schema.ts`，载荷放 `lib/payload.ts`（`build<领域>Input`）。
- 提交路径上用 `schema.safeParse(value)` 校验，不装 zod 适配器包。
- 错误区只显示第一条，文案与服务端一致；`data-testid="<feature>-form-error"`。
- 参考实现：`features/items/components/item-form.tsx`、`features/documents/components/document-form.tsx`。

### 落位与依赖

- 跨 feature 只经桶文件 `@/features/<name>`；桶文件只导出被别处消费的符号。
- 下拉的选项列表构造放在拥有数据的那一侧。
- 单据类型判定读 `features/documents/lib/rules.ts` 那一张表。
- web 不引用 `kernel`／`kernel-pg`／`shared`（守卫 `src/package-boundaries.test.ts`）。
- 单据能不能过账、作废、能不能选原单据，可行性只有服务端一个来源（守卫 `src/features/documents/document-status-decision-guard.test.ts`）。

### 单测

- 根级 `vp test` 解析不了 `@/`：纯函数模块用相对路径导入，类型依赖写 `import type`。
- 单测直接相对导入被测模块，不从 feature 桶文件导入。

### 端到端

- 选下拉值走 `packages/web/e2e/fixtures.ts` 的助手：`pickOption`／`pickOptionByLabel`／`pickOptionLabels`，`target` 是 Picker 触发器。
- 不写裸 `select` 选择器：底层在表单里会渲染隐藏的原生 `<select>`。

## 验证

- `pnpm check` 与 `pnpm test`（守卫与单测都在里面）；只改前端时 `vp test packages/web/src` 快速跑。
- 动了 `packages/web/e2e/` 另跑 `pnpm test:e2e`（README 第 7 节）。
