# IT 协同助手设计说明

## 设计摘要

本设计聚焦一个面向 PM / 需求负责人的跨平台协同助手。产品第一期不做独立项目看板，不做平台业务镜像，而是通过浏览器插件和服务端 Agent / Skill 编排，提供：

1. 跨平台半自动建单
2. A1 / A2 智能分析补全
3. PM 即时分析

## 关键决策

- 主入口：浏览器插件
- 插件定位：触发器 + 上下文采集 + 展示层
- 智能核心：服务端 `agents + skills`
- 数据策略：实时拉取，不维护 Lark / Meegle / GitHub 镜像
- 主身份：`Lark ID`
- Meegle 接入：基于 `plugin_id/plugin_secret -> plugin_token -> auth code -> user token / refresh token`，请求侧携带 `X-USER-KEY`
- Meegle 授权策略：采用 `方案 B`，插件直接申请 `auth code`，服务端只接收 `auth code`
- 外部平台角色：
  - `Lark A1/A2` 为来源主源
  - `Meegle B1/B2` 为基于 `workitem` 的执行平台
  - `GitHub PR` 为交付状态来源

## 一期范围

- `A1 -> B2` 半自动建单
- `A2 -> B1` 半自动建单
- A1/A2 智能分析补全
- PM 即时分析
- 身份映射、规则模板与最小审计

## 明确不做

- 独立 PM 看板页面
- 业务镜像与双向同步表
- PR 描述生成
- 全自动流转
- 多租户

## 设计文档索引

完整设计拆分为以下文档：

- [文档索引](/home/uynil/projects/tw-itdog/docs/it-pm-assistant/README.md)
- [需求概述](/home/uynil/projects/tw-itdog/docs/it-pm-assistant/01-requirements-overview.md)
- [业务流程设计](/home/uynil/projects/tw-itdog/docs/it-pm-assistant/02-business-flow.md)
- [PRD](/home/uynil/projects/tw-itdog/docs/it-pm-assistant/03-prd.md)
- [总体架构设计](/home/uynil/projects/tw-itdog/docs/it-pm-assistant/04-architecture.md)
- [AI Agent / Skill 设计](/home/uynil/projects/tw-itdog/docs/it-pm-assistant/05-ai-agent-skill-design.md)
- [数据与安全设计](/home/uynil/projects/tw-itdog/docs/it-pm-assistant/06-data-security.md)
- [一期实施路线](/home/uynil/projects/tw-itdog/docs/it-pm-assistant/07-phase-1-rollout.md)
- [开放问题与待补设计](/home/uynil/projects/tw-itdog/docs/it-pm-assistant/08-open-questions.md)
- [Meegle Adapter 适配设计](/home/uynil/projects/tw-itdog/docs/it-pm-assistant/09-meegle-adapter-design.md)
- [Meegle 轻认证桥设计](/home/uynil/projects/tw-itdog/docs/it-pm-assistant/10-meegle-auth-bridge-design.md)
- [插件消息协议与 API Schema](/home/uynil/projects/tw-itdog/docs/it-pm-assistant/11-extension-message-and-api-schema.md)

## 待补说明

`Meegle` 适配设计已根据 `meegle_clients` 做了第一轮收敛，但业务字段和类型映射仍需结合真实项目配置进一步补齐。
