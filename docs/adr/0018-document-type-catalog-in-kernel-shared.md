# 单据类型目录由内核 shared 层拥有

「单据类型」的事实（类型标签、单号前缀、往来方角色、仓库角色、是否计价、数量约束、行内商品唯一性、原单据类型与原仓库角色、过账前置）收成一份内核拥有的目录。目录放在 `packages/kernel/src/shared/document-types/`，而不是 documents 这个 feature slice：它同时被 documents 与 posting 两个 slice 以及 Postgres 适配器读取，放进任一 slice 都会让一个 slice 拥有另一个 slice 的事实（过账前置是 posting 的事实）。

## Considered Options

- 放 documents feature slice：目录归单据域，posting 已单向依赖 documents，不新增依赖方向；但过账前置是 posting 的事实，放进 documents 会让单据域拥有过账域的事实。
- 新开一个 document-types feature slice：归属最干净，但要为一张表维护一张公开面，成本高于收益。
- 放 `packages/shared`（跨包通用能力包）：那是错误信封、schema 基建与通用类型的地盘，单据类型是内核的业务事实，且只有内核消费。

## Consequences

- kernel 的 shared 层现在同时容纳契约（errors / ports / transactions）与业务字典（单据类型目录）。以后再加领域事实时先判断它是契约还是字典：契约进 shared 根，字典进 shared 的领域子目录。
- ADR-0005 的规则是「跨 feature 复用若形成环则上移到 shared」，本目录并非为免成环而上移，而是 shared 层开始容纳业务字典的第一例；该规则本身仍然有效。
- 前端那份平行的单据类型规则表本次不收拢：前端只能经 HTTP 取数据，收拢需要新增元数据端点与前端取数改造，另开票。在此之前两份表仍可能静默漂移。
- 目录承接的是仍在的过账前置事实（缺仓库的提示、是否要求原单据行），以及「过账时缺单价/售价」「数量必须大于 0」两条按规格 #50 删除（建单已保证、今天不可达）。
- 「是否要求原单据行」当前由「原单据类型非空」派生（现有六类单据两者同集）；将来若出现「整单引用原单而不逐行引用」的类型，改为目录里的显式字段。
