---
title: "Meegle 工作项详情页与研发记录 PRD"
module: "platform-data"
status: planned
created_on: 2026-08-18
updated_on: 2026-08-18
closed_on: null
owner: TBD
last_reviewed: 2026-08-18
scope: Octo FE 的 Meegle 工作项本地详情页与研发记录
related:
  - "../../tenways-octo/it-platform-sync.md"
---

# Meegle 工作项详情页与研发记录 PRD

## 背景

Octo FE 已能展示同步到本地的 Meegle 工作项列表，但点击编号会离开 Octo 并打开 Meegle 原生详情。相较之下，Lark Ticket 已有本地详情页。因此用户无法在 Octo 内集中查看工作项关键信息，也没有地方维护不应写回 Meegle 的研发记录。

现有同步表 `meegle_workitem_syncs` 保存 Meegle 外部事实快照；`meegle_workitem_octo` 以相同的 `project_key + work_item_type_key + work_item_id` 复合键保存 Octo 本地数据，已有 `local_json` 字段。本需求使用这两个表，不改变它们“外部快照”和“Octo 本地数据”的边界。

## 目标

在 Octo FE 中提供 Meegle 工作项本地详情页。用户可：

1. 从 Meegle 列表进入工作项详情，并查看最近同步的标题、状态、负责人等信息。
2. 在右侧 `Properties` 中查看标题、状态、负责人。
3. 通过三个独立弹窗查看、编辑、清空并保存研发记录：`spec_notes`、`tech_notes`、`dev_notes`。
4. 仅根据记录是否有内容，以灰色或绿色识别研发记录状态。

## 成功标准

- 用户不必离开 Octo 即可完成一次研发记录的查看和保存。
- 保存只修改目标工作项的目标研发记录，不会覆盖另外两个记录，也不会写入 Meegle 平台。
- 不同研发记录的并发保存不会互相覆盖；同一记录的并发保存本期采用最后写入生效。
- 列表、详情页和保存接口都在同一个 Web Session / 工作台权限模型下受控。
- 数据缺失、无权限、保存失败可被用户理解和复现定位。

## 范围

### 本期包含

- FE 路由：`#meegle-workitems/:projectKey/:workItemTypeKey/:workItemId`。
- 列表中的工作项编号和标题跳转到上述 Octo 本地详情页；详情页提供“在 Meegle 中打开”外链作为补充。
- 详情页的源端快照展示：工作项编号、标题、类型、状态、子阶段、负责人、Sprint、版本、System、最近源端更新时间、最近同步时间；某项不存在时显示“未设置”。
- 右侧 `Properties` 固定展示标题、状态、负责人，均为只读的 Meegle 快照信息。
- 研发记录入口：需求记录（`spec_notes`）、技术记录（`tech_notes`）、开发记录（`dev_notes`）。
- 研发记录弹窗：查看、编辑、保存、取消；清空内容并保存视为清空该记录。
- 源端快照与 Octo 本地研发记录的联合读取；研发记录仅写入 `meegle_workitem_octo.local_json`。
- Web Session 鉴权、输入校验、结构化错误、`actionRunId` 日志链路和单元/Mock integration 测试。

### 本期不包含

- 向 Meegle 写回标题、状态、负责人、研发记录或其他任何字段。
- 在详情页触发“更新 Lark 及推送”“创建 GitHub 分支”“研发 Review”等现有插件自动化；这些仍在 Meegle 原生详情页的插件侧运行。
- 从 Meegle 实时拉取详情作为本地快照缺失时的隐式兜底。
- 评论、附件、活动流、任务关系、字段配置器、多人协作编辑或变更历史 UI。
- 将 `spec_notes`、`tech_notes`、`dev_notes` 映射为 Meegle 动态 `field_*` 字段。

## 用户与页面行为

### 进入与读取

1. 用户在已登录 Octo 的 `#meegle-workitems` 列表点击工作项编号或标题。
2. FE 跳转到详情 hash，并以三元主键请求详情数据。
3. 服务端校验 Web Session 和 `platformLists` 工作台权限，读取同步快照及对应本地记录。
4. 页面展示标题、来源信息、右侧 `Properties` 和研发记录入口；显示“最近同步时间”，让用户知道数据不是实时 Meegle 查询。
5. 若不存在该同步快照，展示“该工作项尚未同步到 Octo”，提供返回列表入口；不自动调用 Meegle API。
6. 直接打开详情深链时也必须生成 `Meegle / {工作项编号}` 两级面包屑；数据加载前可使用 `workItemId`，加载成功后优先显示 `workItemKey`。

### 研发记录状态与弹窗

| 入口 | 业务标识 / JSON key | 状态判定 | 弹窗行为 |
| --- | --- | --- | --- |
| 需求记录 | `spec_notes` / `specNotes` | 去除首尾空白后为空：灰色；非空：绿色 | 独立编辑并保存 |
| 技术记录 | `tech_notes` / `techNotes` | 去除首尾空白后为空：灰色；非空：绿色 | 独立编辑并保存 |
| 开发记录 | `dev_notes` / `devNotes` | 去除首尾空白后为空：灰色；非空：绿色 | 独立编辑并保存 |

- 三个入口只使用灰、绿两种状态；不得按类别使用蓝、紫、橙、红等颜色。
- 颜色不能成为唯一状态信息：灰色入口同时显示“未填写”，绿色入口同时显示“已填写”。
- 点击入口打开对应弹窗。弹窗只加载和提交该入口的内容，不能同时保存其它两个字段。
- 通过关闭按钮、遮罩、Esc 或页面导航关闭含未保存修改的弹窗时，FE 必须要求用户确认放弃编辑；无修改时直接关闭。
- 保存按钮在请求期间禁用并展示进行中状态；成功后关闭弹窗、刷新该入口状态和本地更新时间；失败时保留用户输入并展示服务端错误信息。
- 单条内容上限暂定为 20,000 个 Unicode code point。服务端必须通过 Zod refinement 按 code point 计数，不能直接依赖 JavaScript UTF-16 `string.length`；FE 可用相同口径提示剩余容量，但不能代替服务端校验。
- 内容规范化规则：若 `content.trim()` 为空则存储为空字符串；否则保留用户提交的原文，包括非空内容的首尾空白。状态判定使用规范化后的内容。

## 信息架构与 UI 约束

```text
面包屑：Meegle / {工作项编号}
标题区：{标题}  [在 Meegle 中打开]

主内容区：
  工作项概要（类型、Sprint、版本、System、子阶段、更新时间）
  研发记录（需求记录 / 技术记录 / 开发记录三个状态入口）

右侧 Properties：
  标题
  状态
  负责人
```

- 标题、状态、负责人必须留在右侧 `Properties`，研发记录不得平铺成主内容区的大段可编辑文本。
- 研发记录入口可以位于主内容区的“研发记录”区，但编辑承载必须是独立 popup/modal。
- 页面必须沿用 FE 现有 `WorkspaceShell`、面包屑和空态/错误态视觉语言；不引入第二套工作台壳层。
- 详情路由必须纳入现有 `platformLists` 页面权限判断；无权限用户不能通过直接输入 hash 绕过 FE 导航限制。
- 原始 `payload_json` 不直接暴露给用户。可展示字段必须来自明确的详情 DTO 投影。

## 数据与接口契约

### 数据归属

| 数据 | 权威来源 | 读取方式 | 写入方式 |
| --- | --- | --- | --- |
| 标题、状态、负责人、Sprint 等工作项事实 | Meegle 同步快照 | `meegle_workitem_syncs` | 仅由现有同步流程更新 |
| `spec_notes`、`tech_notes`、`dev_notes` | Octo | `meegle_workitem_octo.local_json` | 本需求的受控本地保存接口 |

`local_json` 使用受限命名空间，首版格式如下。实现不得把任意前端对象直接持久化。

```json
{
  "researchNotes": {
    "specNotes": "...",
    "techNotes": "...",
    "devNotes": "..."
  }
}
```

- 读取时将缺失键视为空字符串。
- 保存时仅替换目标 `researchNotes` 子键，并保留 `local_json` 内不属于 `researchNotes` 的已有键。
- 保存前必须确认对应 `meegle_workitem_syncs` 快照存在；不存在时返回 404，不能创建孤立的 `_octo` 行。
- 服务端负责原子 upsert、JSON 解析失败保护和 `created_at` / `updated_at` 维护。原子性必须由单条数据库 JSON 更新语句，或由事务与行锁保证；不得用无锁的“先读 JSON、在内存合并、再覆盖写入”。
- 两个请求并发更新不同 note 时必须同时保留；两个请求并发更新同一 note 时采用最后写入生效，本期不增加版本冲突 UI。
- 发现既有 `local_json` 不是合法 JSON 或不是对象时，读取和保存均失败并保留原始值；不得用 `{}` 静默修复或覆盖。
- 规范化后的内容与当前值相同时视为幂等成功，不更新 `updated_at`。没有本地记录时保存空字符串同样为无写入成功，不创建空 `_octo` 行。
- 详情数据按完整复合键查询；不得仅按 `workItemId` 查询，以避免跨项目或跨类型误命中。

### Web API

所有接口使用现有 `/api/web/*` 命名、HttpOnly Web Session 和 `{ ok, data, error }` 信封；不新增旧 `/api/a1/*`、`/api/a2/*` 路由。

| 方法 | 路由 | 用途 |
| --- | --- | --- |
| `GET` | `/api/web/platform-data/meegle-workitems/:projectKey/:workItemTypeKey/:workItemId` | 读取一个同步快照与本地研发记录 |
| `PUT` | `/api/web/meegle-workitems/:projectKey/:workItemTypeKey/:workItemId/research-notes/:noteKind` | 保存一个研发记录 |

`noteKind` 只接受 `spec`、`tech`、`dev`。保存请求体：

```json
{
  "content": "string, max 20000 Unicode code points",
  "actionRunId": "client-generated trace id"
}
```

详情响应至少返回：复合标识、展示投影、`sourceUpdatedAt`、`syncedAt`、`localUpdatedAt` 与三个研发记录文本。`sourceUpdatedAt` 和 `localUpdatedAt` 在源数据或本地记录不存在时允许为 `null`，FE 显示“未设置”。保存响应至少返回：`noteKind`、规范化后的 `content`、`localUpdatedAt`、`actionRunId`。

### 鉴权、校验与错误

- 两个接口均要求有效 Web Session 和 `platformLists` 权限；未登录返回既有会话错误，无权限返回 `WORKSPACE_ACCESS_DENIED`。
- 新增的两个动态 `/api/web/*` 路径必须显式加入全局 API auth middleware 的 Web Session 路由允许范围，并由 controller 自行完成上述 Session 与权限校验；不得要求浏览器提交 `master-user-id`，也不得使用宽泛的全 `/api/web/*` 免检规则。
- 路径参数、`noteKind`、`content`、`actionRunId` 必须通过 Zod DTO 校验。
- 详情读取或研发记录保存发现同步快照不存在时，均返回 `MEEGLE_WORKITEM_NOT_FOUND` / HTTP 404。
- 非法请求返回 `INVALID_REQUEST` / HTTP 400。
- 本地数据读写异常返回区分 `MEEGLE_WORKITEM_DETAIL_READ_FAILED` 与 `MEEGLE_RESEARCH_NOTE_SAVE_FAILED`，不得只返回通用错误文本。
- 既有 `local_json` 非法时返回 `MEEGLE_WORKITEM_LOCAL_DATA_INVALID`，不得继续保存。
- 保存动作的日志和错误响应必须带 `actionRunId`、`layer`、`module`、`stage`、`errorCode`；不记录 token、cookie、完整研发记录正文或完整敏感平台响应。
- 正常请求沿用经过 DTO 校验的客户端 `actionRunId`。若请求因缺失或非法 `actionRunId` 而无法通过校验，服务端生成只用于本次错误诊断的 trace id，并在日志和 `INVALID_REQUEST` 响应中以 `actionRunId` 返回。

## 技术对象与职责

| 层 | 新增或调整对象 | 职责 |
| --- | --- | --- |
| FE | `MeegleWorkitemDetailPage`、路由解析、详情 API client、研发记录 modal | 路由、渲染、未保存确认、调用服务端 |
| Server HTTP | 详情/保存 DTO、controller、路由注册、API auth 动态路径规则 | Web Session、权限、请求与响应边界；保证请求不落入 `master-user-id` 鉴权链路 |
| Server service | `MeegleWorkitemDetailService` | 联合读取快照/本地数据、受控更新单个记录、返回类型化结果 |
| PostgreSQL store | 详情读取与本地记录 upsert store | 通过复合键读取，原子合并 `local_json` 的 `researchNotes` 命名空间 |
| 同步链路 | 无行为修改 | 继续作为 `meegle_workitem_syncs` 的唯一写入者 |

- 服务层通过明确 deps 注入 store，便于单测；controller 不直接编排数据库读写。
- 保存服务只接受受限的 `noteKind` 和字符串内容；noteKind 到 `specNotes` / `techNotes` / `devNotes` 的映射由服务端固定定义，不能把客户端路径直接作为任意 JSON path。
- FE 不读取 Meegle cookie、token 或动态字段元数据，也不直接调用 Meegle API。
- 此需求不新增 extension action，因此不需要在 popup 中硬编码新的 backend route。

## 验收标准

1. 从 Meegle 列表点击工作项编号或标题后，进入含编码参数的 Octo 本地详情 hash；“在 Meegle 中打开”仍指向对应原生 URL。
2. 直接打开同一详情 hash 时，仍显示 `Meegle / {工作项编号}` 两级面包屑，并受 `platformLists` 权限限制。
3. 已同步的工作项可显示标题、状态、负责人及定义的概要字段；缺失字段显示“未设置”。
4. 右侧 `Properties` 仅包含标题、状态、负责人；它们不可在本期编辑。
5. 三个研发记录入口在内容为空时均为灰色并显示“未填写”，任一入口的内容非空后只有该入口变为绿色并显示“已填写”。
6. 修改并保存技术记录后，需求记录和开发记录内容保持不变；刷新详情页后技术记录仍存在。
7. 并发保存两个不同研发记录后两份内容均存在；同一研发记录并发保存时最后完成的有效写入生效。
8. 清空任一记录并保存后，该入口变为灰色，另外两个入口不受影响；对原本为空的记录保存空内容不会创建空本地行。
9. 详情或保存目标不存在时显示/返回可恢复的 404，不会触发 Meegle 实时读取，也不会创建空本地记录。
10. 未登录、权限不足、非法 `noteKind`、过长内容、非法历史 `local_json`、保存异常均返回明确错误；失败时 FE 不丢失编辑内容。
11. 保存请求和服务端日志可通过同一个 `actionRunId` 关联；日志不包含 cookie、token、完整研发记录正文或完整敏感 payload。
12. 本期不改变同步流程，也不向 Meegle 发起字段更新请求。

## 验证计划

| 层级 | 验证内容 |
| --- | --- |
| FE unit | hash 路由解析、直接深链父级面包屑、列表内部详情链接、灰/绿与状态文案判定；将弹窗 dirty/saving/error 状态抽成纯 reducer 或状态函数，覆盖未保存确认、成功关闭、失败保留输入 |
| FE API unit | 详情响应解析、保存请求体与错误信封解析 |
| Server unit | DTO、Unicode code point 上限、空白规范化、权限分支、详情/保存目标不存在、幂等空保存、非法 JSON、错误映射 |
| PostgreSQL store integration | 同步快照与本地记录联合读取；保留其它 `local_json` 键；不同 note 并发保存不互相覆盖；同值保存不更新时间 |
| Mock integration | 详情与保存 controller 的 Web Session / `platformLists` 鉴权；动态 Web 路由绕过 `master-user-id` middleware 后仍由 controller fail closed |
| Route contract | `server/src/index.test.ts` 覆盖 GET/PUT 注册；`server/src/http/api-auth.test.ts` 覆盖两个动态 Web Session 路径及相邻非 Web 路径仍受保护 |
| Build | `pnpm --dir fe test`、`pnpm --dir fe build`、`pnpm --dir server test`、`pnpm --dir server build` |
| Live smoke（后续环境具备时） | 以已同步 seed workitem 登录 FE，验证直接深链、未保存关闭确认、一次保存、刷新持久化、空记录清空和原生 Meegle 外链；单独标记为 live，不以 mock 结果替代 |

## 实施顺序

1. 固化详情/保存 DTO、内容规范化、错误信封与 `actionRunId` 契约。
2. 定义 store 接口并实现同步快照存在性校验、受控联合读取和原子单 note upsert；先完成 PostgreSQL integration tests。
3. 实现 service/controller、注册 GET/PUT 路由，并同步更新全局 API auth 动态 Web 路由规则与 route/auth tests。
4. 添加 FE 路由、直接深链面包屑、详情 API client、详情页、独立 modal 状态逻辑与 FE 测试。
5. 将 Meegle 列表编号和标题切换至本地详情页，保留原生 Meegle 外链。
6. 执行 build/test；在可用 Web Session 与已同步 seed data 的环境完成 live smoke。

## 风险与后续

- `meegle_workitem_octo.local_json` 是通用扩展字段；必须用受限命名空间和原子合并，避免未来其它本地字段被覆盖。
- 当前 `local_json` 为 text；实现若通过 PostgreSQL JSONB 表达式更新，必须使用参数绑定并在非法 JSON 时 fail closed。若使用事务合并，必须锁定目标本地行，不能依赖进程内锁。
- 动态 Web 路由需要跳过旧的 `master-user-id` middleware，但每条路由必须自行校验 Web Session；路由测试需同时防止误放开相邻 API。
- 同步快照是最终一次同步结果，可能过期；页面需显示更新时间，但本期不擅自实时刷新。
- 后续若要把研发记录写回 Meegle，必须先完成 Meegle metadata resolver 的语义字段映射和可写性验证；不得复用本期本地保存接口直接写 `field_*`。
- 后续若扩展到协作编辑或审计，需要另行定义作者、版本冲突、历史记录和权限模型，不应隐式加入本期。

## 开放问题

无阻塞问题。首版按本 PRD 已确定的“仅 Octo 本地保存、20,000 Unicode code point 上限、空白内容规范化为空字符串、不同 note 原子合并、同一 note 最后写入生效、使用现有 `platformLists` 权限”实施；如需更细角色控制、多人历史、版本冲突 UI 或回写 Meegle，应另开需求。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-08-18 | planned | 已完成 PRD，明确页面、数据归属、接口、鉴权、并发和验证计划。 | 尚未实施与验证；按“实施顺序”推进。 |

## 关联

- [平台同步与本地快照说明](../../tenways-octo/it-platform-sync.md)
