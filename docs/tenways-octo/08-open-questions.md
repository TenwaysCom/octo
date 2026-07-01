# 开放问题与待补设计

## 1. Meegle 适配器

基于 `meegle_clients` 当前实现，待确认的问题已经从“有没有这些能力”收敛成“这些能力如何接入业务架构”：

- B1 与 B2 各自对应什么 `workitem_type_key`
- 是否有必须依赖的 `template_id`
- 创建时最小 `field_value_pairs` 集合是什么
- `workitem key` 与 `workitem id` 在业务链路中分别怎么保存
- `workflow task` 是否进入一期主流程

## 2. 用户识别细节

需要后续确认：

- Lark 页面能稳定读取到哪些用户标识
- Meegle 页面能稳定读取到哪些用户标识
- GitHub 页面是否以 `login`、`user id` 还是其他字段作为映射键
- Meegle 页面读取到的用户信息是否能直接映射为 `user_key`

## 3. AI 输入边界

需要进一步明确：

- 是否允许将附件内容送入 AI
- 哪些字段必须脱敏
- 是否需要按场景配置不同的敏感字段策略
- Meegle 字段元数据是否全部可进入 AI，还是只传候选字段摘要

## 4. 规则配置细节

需要后续沉淀：

- A1 什么时候建议转 B2
- A1 什么时候建议转 A2
- A2 什么时候可以进入 B1
- 需求与 Bug 的优先级建议逻辑
- 哪些情况下应触发 `workflow state change` 而不是创建/更新 workitem

## 5. Meegle 认证策略

- 已确定采用 `方案 B`：`auth code` 由插件侧借助当前登录态直接申请
- `plugin_token`、`user_token`、`refresh_token` 的缓存与刷新策略
- open_api 请求头里的 `X-PLUGIN-TOKEN` 在实现上应承载哪一种 token 值
- 是否需要为不同项目维护不同 plugin 配置

## 6. GitHub 分析范围

第一期只明确其作为交付状态来源，但后续还需确认：

- 是否分析 review 状态
- 是否分析 merge 阻塞
- 是否关联多个 PR 到一个 B1 / B2

## 7. 未来可扩展方向

- 个人授权模式
- 自动提醒 / 定时巡检
- 多团队支持
- 更复杂的规则引擎
- 更丰富的交付分析
