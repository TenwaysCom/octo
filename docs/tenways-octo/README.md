# IT 协同助手文档索引

本文档集描述一个面向 PM / 需求负责人的跨平台协同助手。该工具不替代 Lark、Meegle、GitHub，也不维护独立项目主数据；它通过浏览器插件与服务端智能编排，提供跨平台半自动建单、A1/A2 智能分析补全、以及 PM 即时分析能力。

## 文档列表

1. [需求概述](./01-requirements-overview.md)
2. [业务流程设计](./02-business-flow.md)
3. [PRD](./03-prd.md)
4. [总体架构设计](./04-architecture.md)
5. [AI Agent / Skill 设计](./05-ai-agent-skill-design.md)
6. [数据与安全设计](./06-data-security.md)
7. [一期实施路线](./07-phase-1-rollout.md)
8. [开放问题与待补设计](./08-open-questions.md)
9. [Meegle Adapter 适配设计](./09-meegle-adapter-design.md)
10. [Meegle 轻认证桥设计](./10-meegle-auth-bridge-design.md)
11. [插件消息协议与 API Schema](./11-extension-message-and-api-schema.md)
12. [字段 Schema 与状态机](./12-field-schema-and-state-machine.md)
13. [代码结构与校验设计](./13-code-structure-and-validation-design.md)
14. [详细开发计划](../superpowers/plans/2026-03-20-tenways-octo-implementation-plan.md)
15. [PM 分析 Prompt 迭代记录模板](./14-pm-analysis-prompt-iteration-log.md)
16. [认证流程设计](./16-auth-flow-design.md)
17. [V2 Agent Platform / ACP 演进设计](./14-v2-architecture-design.md)
18. [ACP 设计](./17-acp-design.md)

## 当前设计结论

- 目标用户：PM / 需求负责人
- 一期核心能力：跨平台半自动建单 + A1/A2 智能分析补全 + PM 即时分析
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
  - `Lark A1/A2`：需求与工单来源主源
  - `Meegle B1/B2`：基于 `project_key + workitem_type_key` 的工作项执行平台
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

- B1 / B2 对应的真实 `workitem_type_key`
- 必填 `field_value_pairs` 组装策略
- `workflow task` 与顶层 `workitem` 的边界
- `user token / refresh token` 的缓存与刷新策略
