---
title: "Lark Ticket Finish 同步关闭时间"
module: "platform-data"
status: completed
requirement_version: 1
created_on: 2026-09-14
updated_on: 2026-09-14
closed_on: 2026-09-14
owner: Codex
related:
  - "../../../server/src/application/services/lark-ticket-field-update.service.ts"
---

# Lark Ticket Finish 同步关闭时间

## 目标

Ticket 状态改为 Finish 时，将关闭时间更新为当前时间并同步到 Lark Base。

## 验收标准

- [x] Web 字段更新在一次 Base 请求中写入 Finish 和当前关闭时间，覆盖旧值。
- [x] 返回 closedAt 并沿用单 Ticket 同步，让页面与本地投影刷新。
- [x] Meegle 到 Lark 推送中的 Finish 写入包含关闭时间。
- [x] 非 Finish 修改不写关闭时间；平台写入失败不执行本地同步。

## 背景与范围

两个现有 Finish 写入入口此前只更新状态。关闭时间投影读取逻辑已经存在，但字段更新响应未返回 closedAt。本次不补写历史 Ticket，不修改直接在 Lark 上操作时的平台自动化。

## 方案与决策

共用关闭时间字段常量；服务器使用 Date.now() 产生 Base 所需的毫秒时间戳。字段更新响应通过现有清洗器返回 ISO closedAt。保留 Base 成功、本地同步失败的部分成功语义。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-14 | v1 | completed | 两个写入入口及响应投影已修改，相关 17 项测试通过，构建通过 | 未执行真实 Base 写入；全量测试入口用例失败 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 服务 mock 测试 | 17 项通过 | lark-ticket-field-update.service.test.ts、meegle-lark-push.service.test.ts | 覆盖空/旧关闭时间、同请求写入、ISO 响应、失败不刷新；非 Finish 既有精确 payload 断言通过 |
| 全量服务端测试 | 920 通过、1 失败、1 跳过 | pnpm --dir server test | src/index.test.ts:118 期望 ENTRY_LOG_LEVEL=debug，子进程 stdout 为空；单独重跑仍失败，该入口文件有任务开始前的工作区改动 |
| 构建 | 通过 | pnpm --dir server build | TypeScript 编译 |
| 差异检查 | 通过 | git diff --check | 保留原有工作区修改 |
| 真实平台联调 | 未执行 | — | 未部署、未对真实 Ticket 写入 |

## 关联

- [技术对象生命周期](../../ai-dev/lifecycle/current-system-technical-objects.md#13-meegle-到-lark-推送生命周期)
