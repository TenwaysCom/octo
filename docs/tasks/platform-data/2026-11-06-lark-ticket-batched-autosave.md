---
title: "Ticket 按记录合并自动保存与提交恢复"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-11-06
updated_on: 2026-11-06
closed_on: 2026-11-06
owner: Codex
related:
  - "2026-11-06-lark-ticket-source-errors-and-deletion.md"
  - "../platform-sync/2026-10-21-lark-ticket-edit-sync-performance.md"
---

# Ticket 按记录合并自动保存与提交恢复

## 目标

Octo 六项属性立即回显；同 Ticket 停手 1 秒合并保存，最长等待 3 秒。服务端接受多个属性，一次校验、一次 Lark 更新、一次 Octo 同步，并持久保存提交编号和结果。提供字段冲突、部分成功及超时恢复。DSH 可复用接口，本次不修改外部 DSH 仓库、不部署、不对真实 Lark 写入。

## 验收标准

- [x] 连改三项只产生一次 Lark 更新和一次同步；同字段最后选择胜出，改回原值不发送。
- [x] 保存中继续编辑进入下一批；旧响应不覆盖后续修改，切换 Ticket 保留队列，列表详情一致。
- [x] 草稿按 API 地址和账号暂存；刷新后回读核对再发送，退出或换账号不续发旧账号草稿。
- [x] 只提交改动字段；字段级预期值不符时保留草稿并让用户选择采用远端或保留本地重新提交。
- [x] Lark 成功、Octo 同步失败只重试同步；明确拒绝保留草稿及具体错误。
- [x] 超时按提交编号查询并回读；未知结果阻止该 Ticket 后续发送，提供重新核对入口。
- [x] 相关 Server/FE 单测、构建及合成浏览器检查完成，记录真实平台和部署验证边界。

## 背景与范围

工作区已有来源错误/软删除等未提交改动，继续保留。既有单字段 `/fields`（含解决方案）保留兼容；六属性使用新批量提交接口。沿用 Web session、platformSync 权限、元数据缓存、关闭时间、人员与头像投影及结构化错误。并发防护降低覆盖风险，不能与 Lark 网页形成原子互斥。

## 方案与决策

- App 持有按 Base/Table/Record 分组的合并队列，已发出批次与后续草稿隔离。
- PostgreSQL 保存提交状态、请求摘要及字段差异；未确定结果的记录持有 Ticket 写入锁，重放相同提交不重复写入。
- 回读只核对本次字段；未知写入不能因读回旧值就自动重试。
- 浏览器只暂存本次编辑差异及基线，不保存凭据或完整 Ticket。恢复在已确认账号身份后进行。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-11-06 | v1 | in_progress | 已检查工作区、现有编辑链路与读写/同步契约 | 实现批量提交、持久状态和 UI 恢复 |
| 2026-11-06 | v1 | in_progress | 新增 [提交服务](../../../server/src/application/services/lark-ticket-field-submission.service.ts)、[持久 store](../../../server/src/adapters/postgres/lark-ticket-field-submission-store.ts)、[批量队列](../../../fe/src/services/lark-ticket/lark-ticket-batched-edits.js)和共享保存状态 UI | 以合成数据验证，未连接真实平台 |
| 2026-11-06 | v1 | done | Server/FE 全量本地测试与构建通过；[批量浏览器脚本](../../../fe/manual-tests/lark-ticket-batched-save.browser.mjs)和[头像脚本](../../../fe/manual-tests/lark-ticket-avatars.browser.mjs)通过。接口和生命周期已同步 | 只交付代码；未执行目标库迁移、部署、真实 Lark 写入或外部 DSH 改造 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 | 通过 | `pnpm --dir server build`、`pnpm --dir fe build`、`git diff --check` | 不证明运行时部署 |
| Server 单测与 mock integration | 1,494 通过，7 跳过；204 文件通过、2 文件跳过 | `pnpm --dir server test`；[提交测试](../../../server/src/application/services/lark-ticket-field-submission.service.test.ts)含 12 项持久 claim/结果/冲突/恢复场景 | PostgreSQL adapter 使用 pg-mem；平台 API 为 mock，跳过项沿用原集成环境条件 |
| FE 单测 | 318 通过 | `pnpm --dir fe exec node --test --test-isolation=none`；[编辑队列测试](../../../fe/src/services/lark-ticket/lark-ticket-field-edits.test.js)、[API 测试](../../../fe/src/services/lark-ticket/lark-ticket-actions-api.test.js) | 原 `pnpm --dir fe check` 也通过；本环境默认进程隔离输出按文件汇总，最终以无隔离命令核对具体用例 |
| 浏览器 mock integration | 通过 | `OCTO_FIELD_BROWSER_EXECUTABLE=/opt/google/chrome/chrome pnpm --dir fe exec node manual-tests/lark-ticket-batched-save.browser.mjs`；同方式运行 `lark-ticket-avatars.browser.mjs` | 真实 React + Chromium，模拟所有 API/图片。覆盖三属性一批、保存中编辑、改回不发送、导航、冲突选择、仅同步、超时查询/回读、刷新、换账号、窄屏及头像恢复；不是真实平台 E2E |
| live E2E / 目标库迁移 / 已部署运行时 | 未执行 | 无平台写入、迁移或部署操作 | 发布需正常 schema migration 建立提交表；DSH 调用新协议需其客户端独立接入 |

## 实现复核与边界

- 兼容单字段 `/fields`（含解决方案手动保存），六属性使用新协议；旧客户端不获得提交恢复和跨批次锁保证。
- 来源不存在时仍保留草稿。可放弃明确未保存的草稿再标记 Octo 删除；未知批次不可通过放弃操作绕过写锁。
- 冲突期间改回原基线不能被误判为无变化；以用户审阅的新远端值重新提交。放弃冲突重试的人员草稿时，恢复最新确认的姓名、ID 和头像；这些近失问题已由回归测试覆盖，无需重复录入跨任务规则库。
- 初次入口检查暴露 eager store 初始化，已改为按请求取 store；完整入口测试通过。沙箱内 loopback 测试及 Vite 的 `listen EPERM` 经获批在允许本地端口的环境重跑后通过，不归为应用故障。
- 重新核对全部目标字段相符只能证明当前目标状态，不能追溯证明历史由哪次编辑造成。源回读与 Lark 更新非原子；无法保证与 Lark 网页完全互斥。
- 浏览器使用 sessionStorage，只保证同标签刷新恢复；存储不可用时提示，关闭标签不承诺恢复。提交状态写入 PostgreSQL，未知效果的锁不会因刷新或服务重启丢失。

## 关联

- [批量接口与恢复契约](../../tenways-octo/lark-ticket-batched-save.md)
- [当前技术对象生命周期](../../ai-dev/lifecycle/current-system-technical-objects.md#lark-ticket-字段编辑与确认)
