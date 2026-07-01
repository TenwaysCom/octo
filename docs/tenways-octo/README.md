# IT 协同助手文档索引

本文档集描述一个面向 PM / 需求负责人的跨平台协同助手。该工具不替代 Lark、Meegle、GitHub，也不维护独立项目主数据；它通过浏览器插件与服务端智能编排，提供跨平台半自动建单、Lark Bug / Lark User Story 分析补全、以及 PM 即时分析能力。

## 文档边界

- `docs/tenways-octo/` 是产品、业务流程、架构和协议设计文档，面向项目成员理解系统。
- `docs/ai-dev/` 是当前工程治理入口，包含 agent 执行规则、技术对象 lifecycle、代码边界、问题优先级和需求 / review 模板。
- `docs/reference-acp/` 是 ACP 外部参考资料快照，不代表 Octo 当前实现状态；Octo 当前 ACP 落地设计以 [ACP 设计](./17-acp-design.md) 为准。
- `AGENTS.md` 是 AI agent 修改代码前的轻量入口；详细规则从 `docs/ai-dev/` 读取。

整理文档时优先判断文档类型：当前设计放在本目录，工程执行规则放到 `docs/ai-dev/`，外部参考或历史方案必须标明状态，避免被当作当前实现依据。

## 当前系统文档

这些文档描述当前系统应该如何被理解和实现。新需求、代码修改、接口调整和 agent 任务应优先读取这一组。

1. [需求概述](./01-requirements-overview.md)
2. [业务流程设计](./02-business-flow.md)
3. [PRD](./03-prd.md)
4. [总体架构设计](./04-architecture.md)
5. [AI Agent / Skill 设计](./05-ai-agent-skill-design.md)
6. [数据与安全设计](./06-data-security.md)
7. [开放问题与待补设计](./08-open-questions.md)
8. [Meegle Adapter 适配设计](./09-meegle-adapter-design.md)
9. [Meegle 轻认证桥设计](./10-meegle-auth-bridge-design.md)
10. [插件消息协议与 API Schema](./11-extension-message-and-api-schema.md)
11. [字段 Schema 与状态机](./12-field-schema-and-state-machine.md)
12. [代码结构与校验设计](./13-code-structure-and-validation-design.md)
13. [PM 分析 Prompt 迭代记录模板](./14-pm-analysis-prompt-iteration-log.md)
14. [ACP 设计](./17-acp-design.md)
15. [用户身份系统设计](./18-user-identity-design.md)
16. [插件使用文档](./20-extension-user-guide.md)

## 历史 / 演进 / 参考文档

这些文档可以解释设计来源、历史取舍和未来方向，但不应直接作为当前接口、命名或实现依据。引用这组文档时，需要同时确认上面的当前系统文档和 `docs/ai-dev/` 规则。

- [一期实施路线](./history/07-phase-1-rollout.md)：历史 rollout 计划，具体执行顺序以当前 issue map / execution plan 为准。
- [详细开发计划](../superpowers/plans/2026-03-20-it-pm-assistant-implementation-plan.md)：早期开发计划，用于追溯背景，不作为当前实现 checklist。
- [V2 Agent Platform / ACP 演进设计](./history/14-v2-architecture-design.md)：演进设想，当前 ACP 落点仍以 [ACP 设计](./17-acp-design.md) 为准。
- [Popup Refactor Plan](./history/15-popup-refactor-plan.md)：历史实施计划，里面的旧接口路径不作为当前实现依据。
- [ACP 与 PM Analysis / Skills 结合讨论草案](./history/18-acp-pm-analysis-skill-notes.md)：未来 skills / ACP 结合讨论，不能覆盖当前 ACP V1 边界。
- [认证流程设计（已归档）](./archived/16-auth-flow-design.md)
- [Lark Base 多维表格插件替补方案（已归档）](./archived/19-lark-base-plugin-fallback-design.md)

## 当前设计结论

- 目标用户：PM / 需求负责人
- 一期核心能力：跨平台半自动建单 + Lark Bug / Lark User Story 智能分析补全 + PM 即时分析
- 主要入口：浏览器插件
- 插件职责：触发器 + 上下文采集 + 展示层
- 核心智能：服务端 `agents + skills`
- 数据策略：实时拉取，不做 Lark / Meegle / GitHub 业务镜像
- 主身份：`Lark ID`
- Meegle 接入模型：`plugin_id/plugin_secret -> plugin_token -> auth code -> user token / refresh token`，运行时请求携带 `X-USER-KEY`
- Meegle 授权策略：采用 `方案 B`，由浏览器插件在当前登录页面直接申请 `auth code`，服务端只接收 `auth code`
- ACP 当前落点：`V1` 先做 `PM Analysis ACP Facade`
  - 单个 `POST` 流式 chat 接口
  - 规则化 follow-up
  - `Managed Redis` session 持久化
  - 详细设计见 [ACP 设计](./17-acp-design.md)
- 外部平台定位：
  - `Lark Bug / Lark User Story`：需求与工单来源主源
  - `Meegle Product Bug / Meegle User Story`：基于 `project_key + workitem_type_key` 的工作项执行平台
  - `GitHub PR`：交付状态来源

## 当前边界

- 不做独立 PM 进度看板页面
- 不做 Lark 和 Meegle 双向同步表
- 不做 PR 描述生成
- 不做全自动状态推进
- 不做多团队、多租户
- 不在 ACP `V1` 中引入通用 orchestrator / 多场景统一网关

## 待补重点

`Meegle` 适配已经根据 `meegle_clients` 做了第一轮收敛，但仍需结合真实项目配置继续补细：

- Meegle Product Bug / Meegle User Story 对应的真实 `workitem_type_key`
- 必填 `field_value_pairs` 组装策略
- `workflow task` 与顶层 `workitem` 的边界
- `user token / refresh token` 的缓存与刷新策略
