# 前端组件与表单约束

改动 `packages/web` 前先读这份文档。前端组件与表单只有一套写法，照下面的约束写，不要另发明一套。

## 组件

- 不得直接写原生 `<select>`、`<input>`、`<button>`。输入框用 `Input`，标签用 `Label`，按钮用 `Button`（均在 `components/ui` 下）。
- 「不得直接写原生控件」这条约束有自动检查：`vp test` 会扫描前端源码，命中原生下拉、原生输入或原生按钮就让验证命令变红；检查只豁免 shadcn 组件内部确实需要的原生标签。
- 选择类控件（取值下拉、筛选项、单据行的取值）一律走 `<Picker options>`（`@/components/ui/picker`），不要在业务页面里直接用 `Select`。
  - `Picker` 的对外接口固定为 `value`、`onValueChange`、`options`、`placeholder`、`disabled`、`id`、`className`、`aria-label`、`aria-labelledby`、`data-testid`；不要在调用处发明别的参数名。
  - 选项形状固定为 `{ value: string; label: string; disabled?: boolean }`；`value` 为空字符串表示「未选择／全部」。
  - `Picker` 不内置宽度，宽度由调用方用 `className` 指定。
  - 触发器的可访问名用 `aria-label` 或 `aria-labelledby` 提供：触发器是按钮形态，原生 `<label for>` 关联不到它。
- 组件源码经 shadcn CLI 拉取后归仓库所有：`packages/web/src/components/ui/` 下的文件直接改，不要绕开注册表另写一份。
  - 拉取命令：`pnpm --filter @erp-inventory-sales/web exec shadcn add <组件名> --yes`。
  - 拉下来的文件按仓库格式化提交；注册表原始件里的图标占位要替换成 `lucide-react` 图标。

## 表单

- 表单用 `@tanstack/react-form`，字段规则用 zod 描述。提交路径里用 `schema.safeParse(form.values)` 校验，不引入额外适配器包。
- 表单规则文件放在对应 feature 的 `lib/schema.ts`，并经该 feature 的桶文件（`features/<feature>/index.ts`）导出。
- 表单值到提交载荷的转换是一个可单独测试的纯函数，放在该 feature 的 `lib/` 下（例如 `lib/payload.ts`），不要把转换写在提交回调里。
- 对象级规则（两个取值不能相同、随类型变化的必填项）用 zod 的对象级校验（`superRefine`／`refine`），不要拆成字段级校验。
- 校验失败时错误区只显示第一条错误。
- 错误文案沿用服务端的同一措辞，不要另写一套近义说法。
- 换算率这类数值字段在规则里保持字符串，与提交给服务端的形态一致。

## 端到端

- 选值动作统一走 `e2e/fixtures.ts` 里的选值助手，按取值选中；不要直接调用原生下拉的选值接口。
- 选值助手冻结：它不够用时改助手本身（`e2e/fixtures.ts`），不要在用例里另写一套分支。
