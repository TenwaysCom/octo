# 数据与安全设计

## 1. 信息架构

系统只管理两类数据：

1. `长期配置型数据`
2. `运行时临时数据`

长期配置型数据保存于服务端；运行时数据只在请求生命周期内存在，不作为平台业务镜像持久保存。

## 2. 长期配置型数据

### 2.1 用户身份映射

以 `Lark ID` 为主身份，映射到：

- `Meegle userKey`
- `GitHub ID`

建议字段：

- `larkId`
- `larkName`
- `meegleUserKey`
- `githubId`
- `mappingStatus`
- `lastVerifiedAt`

### 2.2 平台凭证配置

第一期优先使用团队级服务凭证。

建议保存：

- 平台类型
- 凭证引用
- 凭证状态
- 更新时间

真实敏感值不直接散落在业务表中，应保存于安全存储。

对 `Meegle` 而言，需要显式区分：

- `plugin_id`
- `plugin_secret`
- `plugin_token`（认证交换阶段缓存）
- `user_key`（来自用户映射）
- `auth_code`
- `user_token`
- `refresh_token`

正式产品链路采用 `方案 B`，因此浏览器里的原始登录 `Cookie` 不属于服务端长期配置项。

### 2.3 规则与模板

包括：

- A1 分流规则
- A2 进入 B1 的规则
- 描述模板
- 提测说明模板
- Agent / Skill 输出 schema

### 2.4 操作审计

保存：

- 操作人 `operatorLarkId`
- 来源平台与记录号
- 目标平台与记录号
- 动作类型
- 成功 / 失败状态
- 关键摘要

## 3. 运行时统一对象

### 3.1 IntakeItem

统一表示来自 Lark A1/A2 的输入对象。

### 3.2 ExecutionDraft

统一表示准备写入 B1/B2 的任务草稿。

对于 Meegle，需要进一步细化为：

- `project_key`
- `workitem_type_key`
- `workitem_id`（更新场景）
- `template_id`
- `field_value_pairs`
- `workflow_action`
- `owner_user_keys`

### 3.3 AnalysisContext

统一表示一次 PM 即时分析的输入范围与归一化数据。

### 3.4 AnalysisReport

统一表示一次即时分析的结果，包括摘要、阻塞项、风险项、待补项和建议动作。

## 4. 安全策略

1. 插件不保存团队级 API token。
2. 所有敏感凭证只保存在服务端安全存储。
3. 插件与服务端之间使用短期会话或签名请求。
4. AI 请求只发送当前场景所需最小上下文。
5. 可配置敏感字段脱敏规则。
6. `plugin_token`、`user_token`、`refresh_token` 只在服务端缓存或安全存储，不落到浏览器侧。
7. `auth_code` 应视为一次性短期敏感凭证，完成兑换后立即失效或丢弃。
8. 原始登录 `Cookie` 只留在浏览器插件所在页面环境中，不上传到服务端。
9. `auth_cookie` 仅允许出现在本地 CLI / 调试工具配置中，不作为正式产品依赖。

## 5. 异常与风险控制

### 5.1 用户识别失败

降级为只分析、不执行，并提示用户确认身份映射。

### 5.2 平台拉取失败

允许返回部分分析结果，但不允许基于不完整数据执行建单。

### 5.3 AI 输出不合法

所有输出必须经过 schema 校验；不合规时只返回草稿和告警。

### 5.4 重复创建

创建 B1 / B2 前必须进行幂等检查，依据来源记录 ID、近期操作记录和目标平台引用进行判断。

对于 Meegle，还应把 `X-IDEM-UUID` 作为执行层默认能力，而不是由业务流程自行处理。

### 5.5 Token 失效

当 `user_token` 失效时，应优先使用 `refresh_token` 刷新；刷新失败时，再重新发起 `auth code` 申请流程。

## 6. 数据边界

明确不存：

- Lark A1/A2 全量副本
- Meegle B1/B2 全量副本
- GitHub PR 全量副本
- 独立项目任务池

可短期缓存但不作为主数据：

- 最近一次分析结果
- 最近一次创建草稿
- 最近一次上下文读取结果
- 最近一次 `Meegle project/type/meta` 查询缓存
