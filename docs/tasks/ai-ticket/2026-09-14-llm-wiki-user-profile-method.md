---
title: "llm-wiki IT 服务用户画像方法"
module: ai-ticket
status: completed
requirement_version: 1
created_on: 2026-09-14
updated_on: 2026-09-14
closed_on: 2026-09-14
owner: TBD
related:
  - "./2026-09-14-it-service-user-profile-feasibility.md"
---

# llm-wiki IT 服务用户画像方法

## 目标

将用户确认的 Ticket + Shadow AI 优先、消息按需补证及查询/生成分工整理成 llm-wiki 可使用的方法文档。

## 验收标准

- [x] 明确输入来源、身份归属、Shadow 实际嵌套字段、证据与新鲜度边界。
- [x] 提供生成步骤、更新规则、一页式模板、可复用提示词和语义验收样例。

## 方案与决策

方法正文统一维护在 [llm-wiki 用户画像方法](../../tenways-octo/llm-wiki-user-service-profile-method.md)。本任务仅交付方法文档，不创建定时任务或真实用户画像，不修改远端 llm-wiki、不发布或写回数据库。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-14 | v1 | completed | 对照当前 Shadow 写入结构、既有数据核查与本轮讨论，完成方法和执行模板。 | 尚未在 llm-wiki 执行；真实抽取准确率和生成任务未验证。 |

## 验证

文档字段路径对照当前 shadow summary service；检查 Markdown 链接目标及 diff 空白。没有产品代码更改，不运行产品测试。沿用原始需求人归属、Shadow 版本及证据边界的核查规则，无新增故障需要写入学习账本。
