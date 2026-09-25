---
title: "Meegle 页面 Odoo.sh 构建状态重复请求与 503 排查"
module: platform-data
status: blocked
requirement_version: 3
created_on: 2026-09-24
updated_on: 2026-09-24
closed_on: null
owner: Codex
related:
  - "../../../fe/src/components/platform/OdooShBuildStatus.jsx"
  - "../../../server/src/application/services/odoo-devops-branches.service.ts"
---

# Meegle 页面 Odoo.sh 构建状态重复请求与 503 排查

## 目标

解释构建状态接口请求量与 503 的关系，以及 GitHub PR 列表响应慢的原因。v3 实施列表非阻塞缓存读取、环境失败冷却、前端同 PR 共享与有限轮询；不执行部署。

## 验收标准

- [x] 确认调用入口、轮询和失败停止条件。
- [x] 检查本地当日日志，区分已确认事实与未确认原因。
- [x] 检查 GitHub PR 列表的阻塞依赖与请求耗时。

- [x] PR 列表不等待上游，明确刷新中、不可用和旧数据。
- [x] 同 PR 共享请求及轮询，失败冷却，轮询有上限且卸载后停止。
- [ ] 环境失败冷却覆盖冷/旧缓存；相关测试与构建通过。

## 方案与决策

v3 当前实现：

- 列表和预览使用 `getOrStartRefresh` 返回缓存/刷新中/不可用；DTO 与 FE 保留 availability 和 stale 标记。Meegle 原有首屏本地读取边界不变。
- 冷/旧缓存页面刷新失败后冷却 30 秒；同步 list 入口也尊重失败冷却。显式及定时 refresh 保留强制刷新语义。
- FE 同标签页按 API base + owner/repo + PR + headRef 共享请求和轮询。最多 6 次，间隔 1/2/4/8/8 秒，单次超时 10 秒；失败停止、结果短存 30 秒。最后消费者卸载停止后续轮询，StrictMode 首次 cleanup 不阻止重挂载加载。
- 清除 DevOps 缓存同时清理 FE 缓存和 PR 预览缓存；忽略重置前的迟到响应。
- 旧数据显示“旧数据”。当前快照没有可靠的源更新时间，本次不以 Redis 读取时间冒充更新时间。

以下诊断描述为 v1/v2 原实现，相关行为已由上述 v3 实现替代：

- FE `OdooShBuildStatus` 每个实例独立请求；202 refreshing 按服务端建议每秒轮询，无次数上限；503 进入 unavailable，当前实例停止。
- API helper 未对构建请求使用已有的 pending 请求去重机制。同一 PR 出现在多个工作项时可产生重复请求；重新挂载也会重新请求。尚未用浏览器证据确认用户此次持续请求具体属于哪种情况。
- Sprint 关联 PR 总是挂载该组件；PlatformList 的关联 PR 在缺少持久化构建信息时挂载。链接带 headRef 与 FE 调用相符，扩展 background 的该调用不带 headRef。
- 服务端按环境合并进行中的刷新；无缓存且刷新失败后 5 秒内返回 unavailable，由 controller 转成 503。因此浏览器请求量不等于上游调用量。
- GitHub PR 列表读取本地记录后，await 各环境 `odooDevopsBranchesService.list()` 才返回；无有效缓存时等待上游，失败则返回空构建数组。该同步 list 路径没有使用 getOrStartRefresh 的失败冷却判断。adapter 超时为 30 秒，各环境并行。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-24 | v1 | done | 本地 api 当日日志扫描时该路径完成响应包含 116 次 202、127 次 503、3 次 404（所有 PR 合计）。app 日志中 Odoo adapter 当日有 198 条带 status=502 的记录；19:31:20–19:31:51 EU/UK/US 均有上游 502。 | 未确认 502 的网关/上游根因，未将聚合计数归到 PR #223；未做浏览器复现或生产主动请求。 |
| 2026-09-24 | v2 | done | 用户补充 PR 列表响应慢，扩展并完成诊断。列表 19:31:20 返回 200 耗时 5055 ms、19:31:25 返回 200 耗时 5022 ms，与同秒上游 502 / platform-data 降级日志相符；近期其他列表响应也约 5 秒，包括 304。静态调用链证明列表等待构建上游。 | 未做分阶段耗时追踪，不能量化 DB/鉴权占比；未定位上游 502 根因。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 | 已检查调用和错误分支 | 上述组件、platform-data-api.js、github-pr-odoo-devops-build.controller.ts、odoo-devops-branches.service.ts | 当前工作区代码，不证明部署版本一致 |
| 已有运行日志 | 已检查安全字段 | server/logs/api.2026-09-24.*、server/logs/app.2026-09-24.* | 聚合统计，不含凭证或完整 payload |
| 单测 / live E2E / 部署验证 | 未执行 | — | 仅诊断，无行为改动 |


## v3 实施与验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 单测 / mock integration | 45 项通过 | `pnpm --dir server test src/application/services/odoo-devops-branches.service.test.ts src/application/services/platform-data.service.test.ts src/modules/platform-data/platform-data.controller.test.ts src/modules/github-pr-odoo-devops-build/github-pr-odoo-devops-build.controller.test.ts` | 上游悬而未决时列表立即返回；失败降级；冷/旧缓存冷却；DTO 状态保留 |
| FE 测试及构建 | 通过 | `pnpm --dir fe check`，runner 汇总 47 项（按测试文件汇总） | 共享、退避、冷却、卸载、StrictMode、缓存重置、迟到响应和状态解析；非浏览器 E2E。构建有 >500 kB chunk 提示 |
| Server 构建 | 阻塞 | `pnpm --dir server build` 报 `TS2307: Cannot find module 'undici'`，位于 `model-request-client.ts` 及其测试 | 原有 package.json 已声明 devDependency，但 node_modules/锁文件缺少该包；未改依赖清单或锁文件 |
| 部署 / live E2E | 未执行 | 无部署操作 | 上游 502 根因仍待排查，不能用本地测试宣称线上耗时已下降 |

当前状态为 blocked，仅剩 server 完整构建验证受工作区依赖不完整阻塞。后续由工作区维护者补齐已有 undici 安装/锁文件后重新执行 server build；成功后可关闭该验证项。本次业务代码开发与上述测试已完成。

建议部署后验收（未执行）：

1. 在 Odoo.sh 不可用或慢响应时打开 GitHub PR 列表：本地 PR 可返回，构建显示刷新中/暂不可用；有旧缓存时保留并标注旧数据。
2. 同一 PR 关联多个 Meegle 工作项：浏览器仅一条共享轮询序列，持续 202 最多 6 次；503 后停止，30 秒内重新挂载不再重复发送。
3. 离开页面后没有后续轮询；清除 DevOps 缓存后重新加载，旧响应不会覆盖重置后的结果。

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-24 | v3 | blocked | 已完成列表解耦、环境冷却、FE 共享有限轮询与状态显示；测试及 FE 构建通过 | server 构建受现有 undici 缺失阻塞；未部署 |

复杂任务复核：StrictMode 清理和缓存重置迟到响应两个易错边界已加入回归测试；不另写重复学习规则。依赖缺失的已验证修复尚不存在，不将未验证安装建议写为错误库中的已解决事件。
