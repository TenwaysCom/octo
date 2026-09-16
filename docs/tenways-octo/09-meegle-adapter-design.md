# Meegle Adapter 适配设计

## 1. 设计目的

本文件用于把现有总体架构里的 `Meegle Adapter` 从概念层落到“贴近 `meegle_clients` 当前实现”的版本，明确认证链路、对象模型、接口边界和一期接入策略。

## 2. 从 `meegle_clients` 提取出的关键事实

### 2.1 认证链路不是单 token

当前参考实现与接口文档共同表明，认证能力包含：

- `plugin_id`
- `plugin_secret`
- `plugin_token`
- `user_key`
- `auth_code`
- `user_token`
- `refresh_token`

目标认证主链路应为：

1. 用 `plugin_id / plugin_secret` 换 `plugin_token`
2. 浏览器插件基于当前登录态直接申请 `auth code`
3. 用 `plugin_token + auth code` 换 `user token / refresh token`
4. 调用 open_api 时携带用户态 token 与 `X-USER-KEY`
5. 后续通过 `refresh_token` 刷新 `user token`

这意味着在我们的系统架构里，Meegle 接入应建模为：

> `团队级插件凭证 + 用户级授权码交换 + 用户级 token 生命周期管理`

而不是一个模糊的“团队 token”。

需要补充说明的是：

- `meegle_clients` 现有代码已经实现了 `get_plugin_token(...)`、`get_user_token(...)`、`refresh_user_token(...)`
- 正式产品链路采用 `方案 B`，因此 `auth code` 应由插件侧完成申请后再传给服务端
- `meegle_clients` 中的 `auth_cookie` 只保留为 CLI / 本地调试兜底能力

### 2.2 Meegle 的核心对象是 workitem，不只是 task

`meegle_clients` 的核心操作围绕：

- `project / space`
- `workitem`
- `workflow`
- `task`
- `comment`
- `attachment`
- `view`
- `field`
- `template`

因此在我们的领域模型中：

- `B1 / B2` 应优先映射为 `Meegle workitem`
- `workflow task` 属于 workitem 下的执行细项
- `task` 不应在第一版架构里直接等同于 `B1 / B2`

### 2.3 建单依赖项目上下文与元数据

创建 workitem 的接口不是只传标题即可，而是可能依赖：

- `project_key`
- `workitem_type_key`
- `template_id`
- `field_value_pairs`
- `X-IDEM-UUID`

因此我们的 AI 输出与执行草稿都必须对齐这个结构。

## 3. 适配后的 Meegle 子架构

建议把 `Meegle Adapter` 拆成四层：

### 3.1 MeegleAuthService

职责：

- 保存 `plugin_id / plugin_secret`
- 获取并缓存 `plugin_token`
- 接收插件侧传入的 `auth code`
- 兑换并缓存 `user token / refresh token`
- 刷新 `user token`
- 统一构造运行时请求头与 `X-USER-KEY`

### 3.2 MeegleCatalogService

职责：

- 查询可访问 `project / space`
- 查询 `workitem_type`
- 查询 `field`
- 查询 `template / workflow template`
- 查询 `workitem meta`

这是创建前置服务，不应由 Agent 直接拼接硬编码字段。

### 3.3 MeegleExecutionService

职责：

- `create_workitem`
- `update_workitem`
- `get_workitem_details`
- `filter_workitems`
- `filter_workitems_across_projects`
- `get_workflow_details`
- `operate_workflow_node`
- `update_workflow_node`
- `change_workflow_state`
- `create_task / get_tasks / update_task`

### 3.4 MeegleCollaborationService

职责：

- `comment`
- `attachment`
- `view`
- `bot_join_chat`

这一层一期不一定完全开放给插件，但适配器边界应预留。

## 4. 与现有产品架构的接口

在当前系统里，服务端 Agent 不应该直接调用零散的 `MeegleClient` 方法，而应通过统一的 Adapter 接口：

### 4.1 Catalog 接口

- `resolve_projects(user_key)`
- `list_workitem_types(project_key)`
- `get_workitem_meta(project_key, workitem_type_key)`
- `get_fields(project_key)`
- `get_workflow_templates(project_key, workitem_type_key)`

### 4.2 Execution 接口

- `create_execution_item(draft)`
- `update_execution_item(draft)`
- `get_execution_item(project_key, workitem_type_key, workitem_id)`
- `search_execution_items(project_key, filters)`
- `get_execution_workflow(project_key, workitem_type_key, workitem_id)`

### 4.3 Collaboration 接口

- `add_comment(...)`
- `list_comments(...)`
- `upload_attachment(...)`

## 5. Agent 输出需要如何变化

原先设计里的 `ExecutionDraft` 过于泛化。对接 Meegle 后，A1 / A2 Agent 应输出：

- `target_project_key`
- `target_workitem_type_key`
- `name`
- `template_id`
- `field_value_pairs`
- `source_refs`
- `owner_user_keys`
- `workflow_hint`
- `idempotency_hint`

其中：

- `source_refs` 用于把 A1 / A2 来源信息回挂到创建动作里
- `workflow_hint` 用于后续决定是否需要操作 workflow / task
- `idempotency_hint` 用于避免重复创建

## 6. B1 / B2 在适配层中的推荐映射

当前先按架构建议定义，不把具体 type 写死：

- `B2`：优先映射到 `bug` 或等价的自定义缺陷类 `workitem_type_key`
- `B1`：优先映射到 `story`、`feature`、`requirement` 或等价的自定义需求类 `workitem_type_key`

最终以真实项目的 `workitem type` 元数据为准。

## 7. 一期接入策略

建议第一期只落以下能力：

1. `plugin_token -> auth code -> user token / refresh token` 主链路
2. `project / type / meta` 查询
3. `workitem` 创建、读取、更新
4. `workflow` 读取
5. `comment` 和 `attachment` 留接口，不强依赖上线

不建议第一期一开始就做：

- 全量 `workflow task` 自动化
- 复杂视图管理
- 机器人入群自动编排

## 8. 需要和业务共同确认的事项

1. B1 / B2 各自落在哪个 `project_key`
2. B1 / B2 各自对应什么 `workitem_type_key`
3. 必填字段和默认模板是什么
4. 是否需要在创建后立即读取 `workflow details`
5. 是否需要在一期使用 `task` 层能力

## 9. 对总体架构的直接影响

这份参考实现意味着总体架构需要做以下收敛：

1. `Credential Service` 必须显式支持 `plugin credentials + auth code exchange + token cache`
2. `Meegle Adapter` 必须拆出 `Catalog / Execution / Collaboration` 三类能力
3. `ExecutionDraft` 必须升级为 `Meegle-aware` 的结构化草稿
4. 一期实施顺序里要把 `meta discovery` 提前，否则 AI 草稿无法可靠落地
5. 浏览器插件必须具备申请并上传 `auth code` 的轻认证桥能力
