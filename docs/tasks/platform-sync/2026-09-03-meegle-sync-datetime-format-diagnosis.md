---
title: "Meegle 增量同步时间格式报错诊断"
module: "platform-sync"
status: done
requirement_version: 2
created_on: 2026-09-03
updated_on: 2026-09-03
closed_on: 2026-09-03
owner: Codex
related:
  - "9925646"
  - "2026-09-01-meegle-system-time-incremental-cleaning.md"
---

# Meegle 增量同步时间格式报错诊断

## 目标

定位并修复 Web 手工触发 Meegle 数据更新返回 502、前端提示检查授权和服务端配置的问题。修复只调整 MQL 查询时间字面量及其测试，不修改 checkpoint、历史快照或平台数据。

## 验收标准

- [x] 从最新 API 日志定位手工同步失败请求。
- [x] 从运行审计取得 Meegle 返回的安全错误摘要。
- [x] 区分授权、配置和 MQL 查询格式问题。
- [x] 确认受影响范围与 checkpoint 数据安全边界。
- [x] MQL 增量阈值恢复为 Meegle 支持的 ISO `T` 格式，存储格式保持不变。
- [x] 定向测试、Server build 和真实只读 MQL 验证通过。

## 背景与范围

2026-09-03 10:39 至 10:43，Web 手工同步 User Story、Tech Task 和 Sprint 均返回 HTTP 502；同一时段 Worker 的已配置 Meegle scope 也进入 blocked。API controller 对未知同步异常统一返回 `SYNC_FAILED`，FE 又将所有异常统一展示为“同步失败，请检查授权和服务端配置后重试”，因此页面文案不能代表根因。

日志与数据库检查只读取时间、状态、阶段、错误码和安全错误摘要，不读取或输出 token、cookie、用户资料或工作项内容。

## 方案与决策

- Server Web 会话与本机 Meegle CLI 是两套授权边界；当前同步使用 `MeegleShellClient`，实际执行服务器本机 `meegle workitem query`。
- Web Meegle token 在 10:39:47 成功刷新，本机 CLI 只读状态检查也为 authenticated，故本次 502 不是授权失效。
- 每个失败 run 的上游错误一致：`ErrMoqlInvalidArgument` / Code 2001，Meegle 明确报告空格分隔的时间（如 `2026-09-01 01:39:54`）不是支持的 datetime 格式。
- Meegle MQL datetime 协议要求 `YYYY-MM-DDThh:mm:ss` 或带时区的同类格式。当前 `formatMeegleSourceUpdatedAt()` 生成 `YYYY-MM-DD HH:mm:ss`，随后被 `MeegleShellClient` 原样拼入 `WHERE updated_at >= ...`。
- 回归由提交 `9925646` 引入：它在 2026-09-01 18:08 将增量查询阈值从 `Date.toISOString()` 改为空格分隔格式，并同步修改 mock 断言。运行审计显示 18:04 仍成功，18:10 起四类 Meegle scope 均以相同 Code 2001 失败。
- 查询在首个 MQL list 阶段失败，尚未进入 detail、UPSERT 或 cleaning；coordinator 只在完整成功后推进 checkpoint。因此现有快照没有被本次失败改坏，但 Meegle 数据从首轮失败后不再更新。
- v2 新增独立 `formatMeegleMqlDateTime()`，只让增量查询阈值恢复为 `Date.toISOString()`；`normalizeMeegleSourceUpdatedAt()`、checkpoint 和快照继续使用既有秒级空格格式，避免扩大数据迁移范围。
- staging build 完成后显式重启 `octo-server-staging` 与 `octo-platform-sync-worker-staging`；重启前 10:53 的手工失败经运行审计确认仍来自旧进程，重启后用户确认 Tech Task 与 Sprint 手工同步成功。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-03 | v1 | completed | API 日志、运行审计、CLI auth status、MQL 规范、代码与 Git 历史共同定位到查询 datetime 序列化回归。 | 修复应分离“源值/存储规范化格式”和“MQL 查询字面量格式”，并以真实只读 MQL 增加运行验证；本任务未实施修复。 |
| 2026-09-03 | v2 | completed | 查询 formatter 已与存储 formatter 分离；40 个定向测试、Server build、真实只读 MQL 和重启后的手工同步通过。 | 全量测试仍受既有 `node:sqlite` 环境缺失与 logger 落盘时序用例影响；与本次变更无关。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| API 日志 | 通过 | 10:39 User Story/Tech Task、10:43 Sprint 手工请求均返回 502；Worker 同期 blocked。 | Controller/FE 只展示通用 `SYNC_FAILED`。 |
| PostgreSQL 运行审计 | 通过 | 最近手工与定时失败均为 `ErrMoqlInvalidArgument` Code 2001，错误上下文明确指向不支持的空格 datetime。 | 只读查询并脱敏 project key；未读取 payload。 |
| 授权检查 | 通过 | 10:39 Web token refresh 成功；本机 Meegle CLI 为 authenticated。 | CLI 状态检查未读取凭证内容。 |
| 定向测试 | 通过 | `meegle-source-time`、`meegle-shell-client`、`platform-sync.service` 共 40/40。 | mock/单元边界。 |
| Server build | 通过 | `pnpm --dir server build`。 | TypeScript 静态验证。 |
| 真实只读 MQL | 通过 | auth、project、`updated_at` 元数据确认后，带 ISO `T` 阈值的 `LIMIT 1` 查询退出码为 0。 | 只输出聚合选择，不展示工作项内容。 |
| staging 手工同步 | 通过 | 重启 API/Worker 加载新 build 后，用户确认 Tech Task 与 Sprint 手工同步成功。 | 未执行 full、clean、backfill 或 checkpoint 重置。 |
| Server 全量测试 | 存在既有环境失败 | 129 个文件、637 项测试通过；6 个 SQLite suite 缺 `node:sqlite`，logger 文件落盘时序断言失败。 | 本次 40 个定向用例全部通过。 |

## 关联

- `server/src/utils/meegle-source-time.ts`
- `server/src/application/services/platform-sync.service.ts`
- `server/src/adapters/meegle/meegle-shell-client.ts`
- `server/src/modules/platform-sync/web-platform-sync.controller.ts`
- `fe/src/pages/SyncStatusPage.jsx`
- `docs/tenways-octo/it-platform-sync.md`
