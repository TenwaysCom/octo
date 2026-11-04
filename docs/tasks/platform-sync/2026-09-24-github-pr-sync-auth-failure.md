---
title: "Platform Work GitHub PR 更新失败排查"
module: platform-sync
status: done
requirement_version: 1
created_on: 2026-09-24
updated_on: 2026-09-24
closed_on: 2026-09-24
owner: TBD
related:
  - "server/src/application/services/platform-sync.service.ts"
  - "server/src/adapters/github/github-client.ts"
---

# Platform Work GitHub PR 更新失败排查

## 目标

定位 Platform Work 更新 GitHub PR 失败原因。本任务仅排障，不更换凭据、重启服务或执行平台写入。

## 验收标准

- [x] 找到失败请求并关联同步审计记录。
- [x] 明确底层错误、影响范围和恢复方向，注明证据边界。

## 方案与决策

只读检查本机服务日志、同步审计表及调用代码；不输出凭据或完整平台载荷。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-24 | v1 | done | 本地时间 11:58:59，POST `/api/web/platform-sync-sources/github-odoo-uk`，11:59:00 返回 502 / SYNC_FAILED；actionRunId `e9a9e041-9788-49bf-8ec9-19f8e932cdfa`。只读查询 `platform_sync_runs` 确认 TenwaysCom/tenways-ukk 底层错误为 GITHUB_API_ERROR / GitHub API error: 401。9 月 23 日 TenwaysCom/Tenways、TWS-lance/odoo_tenways 同样有 401。 | 需检查并替换服务端有效 GitHub 凭据，再重新加载服务环境并重试；未执行恢复操作。 |

## 结论

同步使用服务端 `GITHUB_TOKEN`，由 GitHubClient 作为 Bearer 凭据发送。此次失败是 GitHub API 认证失败；外层接口将底层错误包装为通用 502 / SYNC_FAILED。现有证据无法区分凭据过期、撤销或错误配置，不应断言具体失效原因。

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 | 已核对凭据来源与 HTTP 错误处理 | platform-sync.service.ts、github-client.ts、web-platform-sync.controller.ts | 无业务代码修改 |
| 运行时记录核验 | 已确认本次失败及另外两个仓库的同类错误 | server/logs/api.2026-09-24.2.log；platform_sync_runs 只读事务查询 | 历史失败证据，不证明当前凭据恢复 |
| 单测 / mock integration / live E2E | 未执行 | 本任务仅诊断 | 未重试同步、未部署或重启 |

## 关联

- [同步服务](../../../server/src/application/services/platform-sync.service.ts)
- [GitHub adapter](../../../server/src/adapters/github/github-client.ts)
