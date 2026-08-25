# Lark List Records 接口能力研究

> 研究时间：2026-08-17 | 所属领域：Lark Bitable / Octo 平台同步 | 研究对象类型：技术接口与同步架构

## 一、结论先行

对 Tenways Octo 当前的 Lark Ticket 增量同步，`listRecords()` 返回的数据够用。增量查询得到的每条 `record` 可以直接交给现有 `upsertLarkBaseTicket()`，没有必要再逐条调用 `getRecord()`。

这个结论有三组互相独立的证据：

1. Lark 官方接口契约中，List 与 Get 的记录主体都是 `record_id + fields`；打开 `automatic_fields` 后，两者都可返回 `created_time` 和 `last_modified_time`。
2. 当前安装的 `@larksuiteoapi/node-sdk` 1.63.1 为 List 与 Get 声明了相同的记录响应结构；Octo 也让两条路径共用同一个 `mapRecord()`。
3. 在真实授权环境中抽取 3 条 Ticket 做只读对照，每条 List 和 Get 都返回 68 个业务字段；字段值、创建时间、最后修改时间全部一致。

“够用”有明确范围：它指当前同步快照、清洗投影、列表展示和 AI 上下文需要的数据都够。它不代表一次 List 能拿到与一条 Ticket 有关的所有外部资源：分享链接不受 List 保证，附件返回元数据而不是文件内容，人员敏感信息受权限控制，当前 Octo mapper 也没有保留创建人、修改人和 `record_url`。

因此建议把问题拆成两层：

- 当前性能修复：继续使用已有 List 增量筛选，但直接 UPSERT List 返回的记录，移除逐条 Get。
- 接口长期演进：Lark 已把 List 标记为历史接口，后续单独评估迁移到 Search；这不应阻塞眼前消除 N+1 请求。

## 二、问题是怎么形成的

Octo 的 Lark Ticket 同步经历了两个自然阶段。

早期全量同步的逻辑很直接：分页调用 List，遍历返回的 records，过滤终态，然后直接 UPSERT。这个路径本身已经在生产代码里证明 List 的业务字段足以完成快照写入和本地清洗。

后续引入增量同步时，系统需要解决新的问题：从 checkpoint 向前回退五分钟，使用 Bitable 的“最后修改时间”字段在源端筛选候选记录，再依据 API 返回的 `last_modified_time` 校验并推进水位。候选查询仍然使用 List，而且已经显式打开 `automatic_fields=true`。

额外耗时来自增量编排的复用方式。代码先通过 List 得到完整候选 records，却没有像全量路径一样直接写入，而是只取 `record_id`，逐条进入原有单 Ticket 同步函数。单 Ticket 函数再调用一次 Get，随后才 UPSERT。

于是一次增量同步变成：

```text
List 增量候选（1 次或少量分页请求）
  -> Get Ticket 1
  -> Get Ticket 2
  -> Get Ticket 3
  -> ...
  -> Get Ticket N
  -> 清洗本轮快照
  -> 推进 checkpoint
```

这不是 Lark 增量协议要求，而是内部复用单条同步函数形成的 N+1。全量路径早已采用“List record 直接 UPSERT”，说明项目中不存在必须逐条 Get 才能落库的统一约束。

2026-08-17 的真实运行把这个问题放大了：一次增量查询命中 40 条 Ticket。候选 List 大约用了 3 秒，随后 40 次串行 Get 用了约 73 秒，数据库写入、清洗和 checkpoint 推进不到 1 秒。整个 Server 任务约 77 秒完成，但 Nginx `/api/` 使用默认 60 秒读取超时，浏览器先收到 504，页面因统一 catch 文案显示“同步失败，请检查授权和服务端配置后重试”。数据库证据显示任务实际成功写入 40 条并推进了 checkpoint。

问题的关键不是“增量失效”，而是“增量候选仍被逐条重复读取”。

## 三、四种记录读取方式的横向比较

Lark Bitable 当前与这个问题相关的能力有四种：List、Get、Batch Get 和 Search。

List 与 Get 的直接比较：

| 维度 | List records | Get record | 对当前同步的判断 |
| --- | --- | --- | --- |
| 目标 | 分页列出或用公式筛选多条记录 | 按一个 record ID 读取 | 增量已经持有 List record |
| 当前用途 | 全量和增量候选入口 | 单条同步及当前重复详情读取 | 增量 Get 可移除 |
| 业务 `fields` | 返回 | 返回 | 相同授权下没有补充价值 |
| `record_id` | 返回 | 返回 | 两者都满足 |
| 自动创建/修改时间 | 支持 `automatic_fields` | 支持 `automatic_fields` | 两者都满足 |
| 分享链接保证 | 没有专用请求参数 | 支持请求 `with_shared_url`，但当前未传 | 当前两者都不保证 |
| 单次记录上限 | 最多 500，支持分页 | 1 | 40 条为 1 次对 40 次 |
| 官方定位 | 历史接口，不再推荐 | 当前接口 | 后续迁移 Search |

Batch Get 与 Search 的补充定位：

| 维度 | Batch Get | Search records |
| --- | --- | --- |
| 目标 | 按一组 record IDs 读取 | 用结构化条件查询多条记录 |
| 当前 Octo 是否使用 | 详情页按需补分享链接 | 尚未用于平台同步 |
| 业务 `fields` / `record_id` | 返回 | 返回 |
| 自动创建/修改时间 | 支持 `automatic_fields` | 支持 `automatic_fields` |
| 分享链接 | 支持 `with_shared_url=true` | 不应依赖 |
| 单次记录上限 | 最多 100 IDs | 最多 500，支持分页 |
| 增量筛选 | 不适用 | 结构化 `filter` |
| 官方定位 | 当前接口 | 官方推荐替代 List |
| 40 条时的最少请求数 | 1 次 | 1 页时 1 次 |

对当前 Octo 的问题，List 已经完成了两件最重要的事：源端筛选候选、返回候选完整字段。Get 没有提供新的必要信息。

Batch Get 的价值集中在一个特例：当业务明确要求分享链接时，可把多个 ID 合成一次请求并设置 `with_shared_url=true`。Octo 已经采用更节制的策略——详情页发现本地没有 URL 时，才为当前 Ticket 调一次 Batch Get，并把 URL 保存到 `lark_base_ticket_octo`。这让普通同步不必为所有 Ticket 提前生成或拉取链接。

Search 是长期方向。它用 POST 和结构化条件替代历史 List 的公式字符串，仍支持分页、字段投影和自动字段。迁移前需要对 Ticket 表实际字段做回归，尤其关注多行文本、公式和查找引用的返回格式，因为 Search 与 List 的可选格式参数并不完全相同。迁移 Search 与移除当前 N+1 是两个不同风险级别的动作，最好分开提交和验证。

## 四、List 到底返回什么

### 4.1 当前同步所需的记录主体

官方把一条 Bitable record 定义为 `record_id` 与 `fields` 的组合。`fields` 是按字段名称索引的 map，值会根据字段类型表现为字符串、数字、布尔值、字符串数组或对象数组。

Octo 当前没有给 List 传 `field_names`，因此没有主动裁剪业务字段。只要调用身份能读取，Ticket 表中的业务字段会进入 `fields`。这些字段覆盖当前清洗代码读取的：

- Ticket 编号
- Issue 类型
- 需求人
- 负责人
- 紧急度
- 创建时间
- Details Description / Issue Description
- Meegle 链接
- Lark Message / Thread 链接
- 标题与状态字段
- Ticket AI 历史字段的只读快照输入

Octo 的 store 保存 `fields_json`，清洗逻辑再从这份字段 map 计算投影。因此只要 List 与 Get 的 `fields` 一致，后续清洗、展示和 AI 上下文就不会因为移除 Get 而缺字段。

### 4.2 自动字段

List 默认不返回创建时间、最后修改时间、创建人、修改人等自动字段。当前增量调用已经传入 `automaticFields: true`，adapter 会把它映射为官方参数 `automatic_fields=true`。

Lark 的官方字段名是：

- `created_time`
- `last_modified_time`
- `created_by`
- `last_modified_by`

Octo 的 `mapRecord()` 会把 `created_time` 标准化为 ISO UTC，并把 `last_modified_time` 映射到内部名称 `updated_time`。这个内部 `updated_time` 用于写入 `source_updated_at` 和推进 checkpoint。

List 与 Get 都经过同一个 mapper，因此不会因入口不同产生时间语义差异。增量安全性真正依赖的是 `automatic_fields=true` 与缺失时间时 fail closed；它不依赖逐条 Get。

### 4.3 复杂字段

List 返回的是字段值，不是只有标题和状态的“列表摘要”。官方记录数据结构覆盖文本、数字、单选、多选、日期、复选框、人员、附件、关联、公式、查找引用、地理位置等字段。

但“拿到字段值”和“拿到资源全部内容”是两回事：

- 附件字段返回 `file_token`、文件名、大小、类型、URL 等元数据，不返回文件二进制。若要下载文件，仍需素材相关接口。
- 人员字段能否返回 ID、名称、邮箱、头像等子字段，取决于应用权限、调用身份和 `user_id_type`。Get 使用相同 token，不能绕过字段权限。
- 多行文本若要保留更结构化的链接或 @人员对象，需要考虑 `text_field_as_array=true`。Octo 当前 List 与 Get 都没有设置它，因此两者使用相同默认格式。
- 公式和查找引用若要改用被引用字段的格式，需要 `display_formula_ref=true`。Octo 当前两条路径同样没有设置，因此移除 Get 不会改变现有表现。
- 空字段可能不出现在 `fields` map 中；这是记录响应语义，不是 List 独有的缺失。

### 4.4 权限边界

List 返回的是“当前 user access token 有权看到的全部字段”，不是“Base 中客观存在的全部字段”。高级权限、行权限、列权限和通讯录权限都可能影响返回。

对于当前优化，这个边界不会造成 List/Get 差异，因为两者使用同一个 Octo 用户授权和相同的默认 ID/格式参数。如果某个字段因权限不可见，逐条 Get 通常也不会把它补回来。权限问题应以授权和数据访问配置解决，不能通过 N+1 Get 规避。

## 五、Octo 实际消费了哪些信息

### 5.1 平台快照表

`lark_base_ticket_syncs` 的同步写入只需要：

- `base_id + table_id + record_id`
- 标题
- Ticket 状态
- 完整 `fields_json`
- `created_time`
- `source_updated_at`
- 本地同步时间、最后看见时间和 stale 标记

这些数据都能从当前 List response 加 mapper 得到。

### 5.2 清洗投影

清洗阶段不访问 Lark。它从刚写入的 `fields_json` 与 `created_time` 中读取 Ticket 编号、Issue 类型、需求人、负责人、紧急度、详情描述、Meegle 链接和消息链接，再更新同一快照行的清洗列。

因此，若 List 返回的 `fields` 与 Get 一致，清洗结果也一致。真实样本已经验证这一点的输入条件：每条样本的业务字段数量与字段值完全相同。

### 5.3 Ticket 详情与 AI 上下文

Web Ticket 详情、筛选、分组和 AI Session 使用的是 PostgreSQL 快照以及 `_octo` 表中的本地数据。它们不要求同步阶段逐条 Get。

AI 上下文需要标题、状态、类型、描述和资源链接。这些来源于快照字段和清洗投影。分享链接若缺失，会由详情页按需补齐；Ticket AI 写入也位于 `_octo` 表，不依赖增量阶段再次读取 Lark。

### 5.4 当前 mapper 没有保存的信息

SDK 的 List/Get 类型还声明了 `created_by`、`last_modified_by` 与 `record_url`。Octo 的 `LarkBitableRecord` 和 `mapRecord()` 当前没有保留前两类人员自动字段与 `record_url`。

这不是 List 不够用，而是 Octo 当前没有消费。如果未来产品需要展示修改人或使用 `record_url`，应先扩展领域模型、数据库归属和展示协议，再决定字段来源。保留逐条 Get 并不会让当前数据库自动拥有这些信息。

## 六、分享链接为什么是例外

分享链接最容易让人误以为“List 不完整，所以必须 Get”。官方行为需要更细地看：

- List 请求没有 `with_shared_url` 参数，不能把 `shared_url` 当成稳定返回保证。
- 单条 Get 支持 `with_shared_url=true`，但 Octo 当前的 `getRecord()` 只设置了 `automatic_fields=true`，没有设置 `with_shared_url`。
- 真实 3 条样本里，List 和当前 Get 的 `shared_url` 都为空。
- Batch Get 明确支持 `with_shared_url=true`，每次最多读取 100 个 ID。

所以，当前逐条 Get 并没有补到分享链接。删除它不会损失已有保证。

Octo 现有设计已经给出更合适的答案：分享链接属于 `_octo` 本地缓存。详情页只有在链接缺失且用户真的打开 Ticket 时，才调用 `batch_get(with_shared_url=true)` 获取，并只写入 `lark_base_ticket_octo.shared_url`。增量同步没有链接时也不会清空旧缓存。

如果未来业务决定“列表页每条 Ticket 都必须立即有分享链接”，再考虑对本轮 ID 分组调用 Batch Get。即便如此，40 条也只需 1 次批量请求，而不是 40 次 Get。

## 七、真实环境对照

为了避免只根据文档和 TypeScript 类型下结论，本次研究使用现有授权对 3 条 Ticket 做了只读 List/Get 对照。验证过程只输出字段数量和一致性布尔值，不输出 Ticket 内容、人员资料、记录 ID、cookie 或 token。

结果如下：

| 样本 | List 字段数 | Get 字段数 | 字段值完全一致 | 创建时间一致 | 最后修改时间一致 | List/Get 分享链接 |
| --- | ---: | ---: | --- | --- | --- | --- |
| 1 | 68 | 68 | 是 | 是 | 是 | 均无 |
| 2 | 68 | 68 | 是 | 是 | 是 | 均无 |
| 3 | 68 | 68 | 是 | 是 | 是 | 均无 |

这个样本不能证明 Lark 平台上任意 Base、任意权限和任意未来版本永远完全一致，但它足以验证当前生产 Ticket 表、当前授权和当前 adapter 参数下，逐条 Get 没有补充同步所需字段。

再结合 SDK 1.63.1 的生成类型、官方文档和全量同步既有实现，结论的置信度较高。

## 八、建议的改造路径

### 8.1 第一阶段：直接复用 List record

在 `incrementalSyncLarkBaseTickets()` 中保留现有：

- checkpoint 回退五分钟
- 源端最后修改时间过滤
- `automatic_fields=true`
- 分页
- 所有返回记录必须有合法 `updated_time`，否则失败且不推进水位
- 同步后清洗
- 全部成功后推进 checkpoint

只替换中间写入方式：

```text
当前：for record -> syncLarkBaseTicket(record_id) -> getRecord -> upsert
建议：for record -> upsertLarkBaseTicket(input, record)
```

本次 40 条在单页内，可把 Lark 请求从 41 次降为 1 次。按观测耗时估算，Server 主流程可从约 77 秒降到约 4 秒，直接避开 Nginx 60 秒超时。具体耗时仍受 Lark、数据库和字段大小影响，不能把 4 秒作为 SLA。

### 8.2 第二阶段：补足测试

最少应增加以下回归：

1. List mapper 输入包含复杂 `fields`、`created_time`、`last_modified_time`，断言标准化记录完整。
2. 增量路径直接把 List record 交给 store，并断言 `getRecord()` 未调用。
3. 清洗结果在改造前后保持一致。
4. 多页增量仍逐页完整处理并只在全部成功后推进水位。
5. 任一候选缺失 `last_modified_time` 时失败，不推进 checkpoint。
6. List response 没有 `shared_url` 时，不清空 `_octo.shared_url`。
7. 如果以后使用 Batch Get 补 URL，覆盖 forbidden/absent IDs 的行为。

### 8.3 第三阶段：接口超时与可观测性

当前 Lark SDK 普通 HTTP client 没有设置请求超时。即使移除 N+1，单个 Lark 请求仍可能无限等待。应为 adapter 增加明确的 timeout、结构化错误码和阶段日志，至少区分：

- 候选查询超时
- 单页解析失败
- 快照写入失败
- 清洗失败
- checkpoint 推进失败

FE 也应展示服务端返回的安全错误码，避免任何网络错误都提示“检查授权和服务端配置”。这不是 List 能力问题，但会直接影响用户判断同步是否真正失败。

### 8.4 第四阶段：迁移 Search

官方已经不推荐 List。迁移 Search 时建议单独执行：

1. 用当前 Ticket 表做 List/Search 返回格式对照。
2. 验证“最后更新时间”字段能否使用结构化 `isGreaterEqual` 条件表达同一阈值。
3. 验证分页、并列时间戳和五分钟重叠语义。
4. 对人员、多行文本、公式、查找引用和附件字段做回归。
5. 保持 `last_modified_time` 为 checkpoint 权威时间，不以业务字段或本地同步时间替代。

Search 迁移属于接口现代化；去掉逐条 Get 属于消除现有重复调用。把两者绑在一次修改里会扩大风险。

## 九、风险判断

| 风险 | 当前判断 | 应对 |
| --- | --- | --- |
| List 缺业务字段 | 当前真实表未发现；官方和 SDK 契约与 Get 一致 | 增加复杂字段映射测试；保留运行期缺时间 fail closed |
| 分享链接缺失 | 会发生，但当前 Get 也未保证 | 沿用详情页 Batch Get 按需 hydration |
| 人员敏感字段缺失 | 取决于授权，不是 List/Get 差异 | 在授权范围解决；不输出或记录敏感数据 |
| 附件内容不完整 | List 只返回附件元数据 | 真正下载时使用素材接口 |
| 大响应 | 单页字段多时可能响应过大 | 适当减小 page size，必要时评估 `field_names` 投影 |
| List 被官方淘汰 | 已标记为历史接口 | 独立迁移 Search，不阻塞 N+1 修复 |
| 并发导致限流 | 直接复用 List 不新增并发，风险最低 | 不以 40 个并发 Get 作为首选方案 |
| checkpoint 漏数据 | 与移除 Get 无直接关系 | 保留五分钟重叠、自动字段校验和成功后推进 |

## 十、最终判断

`listRecords` 对当前 Octo Lark Ticket 同步是够用的。

它可以拿到当前身份有权读取的完整业务 `fields`，并在 `automatic_fields=true` 时拿到同步所需的创建时间和最后修改时间。当前 3 条真实样本中，List 与 Get 的 68 个字段及两个时间字段完全一致；现有全量同步也已经长期直接使用 List record 落库。

它不能被描述为“拿到全部相关信息”：分享链接没有稳定保证，附件不是文件本体，权限外字段不会返回，Octo mapper 也主动忽略了当前业务不用的人员自动字段和 `record_url`。这些边界并不构成保留逐条 Get 的理由，因为当前 Get 使用相同授权、相同格式默认值，也没有请求分享链接。

最稳妥的工程决策是：立即让增量路径复用 List record，保留分享链接的现有按需 Batch Get；随后以独立任务评估 Search 迁移和 adapter timeout。

## 信息来源

- Lark 开放平台：[列出记录](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/list?lang=zh-CN)，访问时间 2026-08-17。
- Lark 开放平台：[查询记录 Search](https://open.feishu.cn/document/docs/bitable-v1/app-table-record/search?lang=zh-CN)，访问时间 2026-08-17。
- Lark 开放平台：[批量获取记录](https://open.feishu.cn/document/docs/bitable-v1/app-table-record/batch_get?lang=zh-CN)，访问时间 2026-08-17。
- Lark 开放平台：[多维表格概述](https://open.feishu.cn/document/server-docs/docs/bitable-v1/bitable-overview?lang=zh-CN)，访问时间 2026-08-17。
- Lark 开放平台：[多维表格数据结构概述](https://open.feishu.cn/document/server-docs/docs/bitable-v1/bitable-structure)，访问时间 2026-08-17。
- Lark 开放平台：[附件字段说明](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-field/attachment?lang=zh-CN)，访问时间 2026-08-17。
- Lark 官方 Node SDK：[larksuite/node-sdk](https://github.com/larksuite/node-sdk)，访问时间 2026-08-17；项目安装版本 1.63.1。
- Octo 本地代码、测试、2026-08-17 结构化 API/App 日志及 PostgreSQL checkpoint/写入计数；核验过程未输出响应体、Ticket 内容、cookie、token 或用户资料。

## 方法论说明

本报告使用横纵分析法：纵向回看 Octo 从全量同步到 checkpoint 增量同步的实现演进，横向比较 List、Get、Batch Get 与 Search 的能力边界，再用当前 SDK 类型和真实环境样本交叉验证工程判断。
