---
title: "Meegle 负责人统一使用 Current owner"
module: "platform-sync"
status: completed
requirement_version: 1
created_on: 2026-08-28
updated_on: 2026-08-28
closed_on: 2026-08-28
owner: Codex
related:
  - "../../tenways-octo/it-platform-sync.md"
---

# Meegle 负责人统一使用 Current owner

## 目标

将 Octo Meegle 快照和列表中的“负责人”统一定义为 Meegle 系统字段 `current_status_operator`（Current owner），支持多人姓名展示；不再从当前流程节点的第一个 owner 推断负责人，也不引入类型专属的长期角色负责人 fallback。

## 验收标准

- [x] MQL 列表与 batch detail 均读取 `current_status_operator`。
- [x] 多位 Current owner 去重后按稳定源顺序投影到现有 `assignee` 字符串。
- [x] Current owner 为空时持久化为空，不回退到节点 owner、Task Owner 或其他角色。
- [x] 单条、全量和增量 Meegle 同步使用同一负责人语义。
- [x] Server 定向测试和 build 通过；执行全量测试并记录既有环境失败；完成现有快照回填核对。

## 背景与范围

现有 `MeegleShellClient` 将 `work_item_current_node[0].owners[0].name` 写入 `assignee`，但 FE 将该字段显示为“负责人”。真实元数据确认 `current_status_operator` 的显示名为 `Current owner`、类型为 `multi-user`；MQL 返回 `user_value_list`，batch detail 返回 `work_item_fields[].value` 人员数组。本任务只调整 Meegle adapter、同步投影、相关文档和测试，不改变 FE/API 字段名或数据库 schema。

## 方案与决策

在 Meegle adapter 中集中定义稳定系统字段 key 和人员显示名归一化。Shell MQL 显式选择 Current owner，batch detail 显式请求并解析同一字段；同步服务在 detail 缺少该值时保留同轮 MQL 候选值。现有 `assignee: string` 继续作为兼容投影，多人以 `, ` 连接。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-28 | v1 | in_progress | 已完成只读诊断和真实协议抽样：Current owner 为 multi-user，MQL 与 batch detail 均可读取。 | 实现、测试、历史回填。 |
| 2026-08-28 | v1 | completed | MQL、detail、兼容 parser 和同步服务已统一投影 Current owner；完成四类全量同步与聚合核对。 | 全量测试仍受当前 Node 的 `node:sqlite` 缺失和既有 logger 落盘测试失败影响。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Meegle 只读协议探测 | 通过 | 元数据、MQL 和 batch detail 均确认 `current_status_operator` 返回形态。 | 未写入 Meegle。 |
| Server 定向测试 | 通过 | 3 个文件、49 个用例通过。 | 覆盖 parser、Shell MQL/detail、单条/全量/增量同步字段请求。 |
| Server build | 通过 | `pnpm --dir server build`。 | TypeScript 编译通过。 |
| Server 全量测试 | 有既有环境失败 | 122 个文件、585 个用例通过；6 个 SQLite 文件因 Node v22.12.0 缺少 `node:sqlite` 无法加载，logger 落盘用例单独复跑仍失败。 | 与本次 Meegle 改动无关；相关 Meegle/同步用例均通过。 |
| 历史快照回填 | 通过 | Full sync 四类共处理 1,209 条活动快照；聚合核对 159 条有 Current owner、1,050 条为空、25 条为多人 Current owner。 | 回填只读取 Meegle 并写本地 PostgreSQL，没有修改 Meegle 工作项。 |

## 关联

- `server/src/adapters/meegle/meegle-client.ts`
- `server/src/adapters/meegle/meegle-shell-client.ts`
- `server/src/application/services/platform-sync.service.ts`
- `docs/tenways-octo/it-platform-sync.md`
