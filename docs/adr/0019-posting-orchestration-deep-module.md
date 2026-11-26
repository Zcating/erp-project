# 过账 handler 收窄成一步正向估值

`PostingTypeHandler` 从「`validate` + `applyInventory` + `buildLedger` 三个方法，外加可选的 `phaseHandler`」收窄成判别联合：普通类型只提供 `apply(document, context)`，多阶段类型只提供 `phaseHandler`。`apply` 只写本类型特有的正向估值，不再接 `PostingDirection`。取锁、幂等短路、状态流转断言与更新、通用过账前置、反向驱动、流水构造、台账键与去重、空余额全部归 `posting/orchestration.ts`。调拨原本两个抛「必须指定调出或调入阶段」的桩随着接口消失——今天没有任何路径调得到它们，service 对多阶段类型走 phase 路径，测试断言的本来就是 service 的「不支持的过账阶段」。

接口刻意停在「一步正向估值」，而不是拆成 `prepare` + `apply` 两段。退货需要在正向估值之前锁原单并校验原行引用（`posting/return-eligibility.ts` 的 `lockAndValidateOriginalLines`），这一步与估值之间有取锁顺序上的依赖：必须先按原单据 id 升序锁原单，再锁余额。如果把它变成一个独立的、可被跳过的阶段，编排就要知道「这个 handler 有没有 prepare」，而漏调 prepare 的后果是把校验绕过而不是编译错误。把锁原单放进 `apply` 的开头，相当于用「每一步正向估值都必须自带它的前置」换取接口的单一入口。代价是 `apply` 里混着取锁与估值两件事，但这个顺序在退货 handler 内部是连贯的、不可分的。

台账保存时机与「是否先补零余额行」成为 handler 声明的 `policy`：`saveMode` 取 `"per-line"` 或 `"after-loop"`，`ensureZeroBalances` 取布尔值。取值与收窄前逐字一致：采购入库逐行保存且补零，销售出库循环后保存且不补零，销售退货逐行保存且补零，采购退货循环后保存且不补零，盘点循环后保存且只写有变化的行、补零，调拨每条腿循环后保存且补零。这两个差异此前散在 6 个 handler 里，只能读代码才知道；现在它们是接口的一部分，读 `policy` 就能分辨。键集由 handler 通过 `context.lockBalances(keys)` 提供，编排不按单据行推导——调拨 IN 阶段的键来自在途记录而不是单据行，按单据行推导会锁错商品。`saveMode` 的 dirty 语义由编排实现：逐行模式每次标记立即写，同一个「仓库+商品」可以写多次、值逐次推进；循环后模式在 `apply` 返回后统一写，同一个键只写一次、取最后一次的值、按首次标记顺序写。键集、次数与顺序由 `posting/ledger-write-trace.test.ts` 钉住。

退货资格留在 `posting/return-eligibility.ts`：已退数量与金额（数量来自单据、金额来自流水）、超退校验与文案、应回冲金额、原单据引用校验。「可退余量」是领域概念（见 `GLOSSARY.md`），由超退校验体现，不再对应一个导出函数：超退校验比较的是累计量（两套累计口径分别是舍入后与未舍入的累计量），而「可退余量」按词汇表是本次退货之前的余量，把校验改写成「本次退货 > 余量」会改变 ON_WRITE 口径的比较对象，属于行为变更。两个退货 handler 只声明自己期望的原单据类型与用词。过账编排与退货资格是两个归属不同的 deep module：前者拥有「怎么过账」，后者拥有「还能退多少、该回冲多少」。把退货资格塞进编排会让编排持有一种单据类型的业务规则；把编排拆进各 handler 则回到样板散落的老问题。

完备性检查（每种单据类型恰好一个 handler）不进 `createPostingService`。kernel 不能反向依赖各 feature 的 handler 工厂，那会成环；检查放在 `app` 的装配处、由 `assertPostingHandlerCoverage` 纯函数完成，`createPostingService` 只接收已装配好的集合。

## Considered Options

- 保留 `prepare` + `apply` 两段：退货可以显式声明「先锁原单」，但接口多一个可被跳过的阶段，且编排要为两种形状分叉。
- 保留 `validate` 作为独立方法：前置与取锁仍散在 handler 里，编排的通用前置会与 handler 的前置重复调用。
- 让编排按单据行推导 `ensureBalances` 键：普通类型可行，调拨 IN 会锁错商品；因此键必须由 handler 提供。
- 把 `policy` 做成全局表而不是 handler 声明：差异与实现分离，新增单据时要改两处，且无法机器检查。

## Consequences

- 新增单据类型只写「一步正向估值」与一份 `policy`，不再抄台账键、去重、空余额、反向驱动与流水构造。
- `PostingApplyContext` 暴露锁好的台账、`ledger` / `documents` 端口与 `transaction`；`PostingPhaseHandler` 的 `apply` / `reverse` 也拿到这个上下文，不再只拿 `TransactionContext`。
- 作废对普通类型由编排驱动 `reverseMovements`（倒序写余额的顺序不变），调拨仍走 `phaseHandler.reverse`（在途清理 + 按腿排序）；作废不锁原单、不校验原行引用，因为作废路径不调 handler 的 `apply`。
- 调拨两支腿的台账写入在 `apply` 返回后统一 flush，因此 `saveBalance` 与 `inTransit.create` / `update` 的相对顺序与收窄前不同；台账之间的键集、次数与顺序不变，且两者同处一个事务。
- 收窄不改变任何对外文案、错误抛出先后、台账写入与状态更新序列；由行为护栏（`error-precedence` / `ledger-write-trace` / `status-write-trace`）证明。
