---
title: "定位 FE OdooSH build 状态不显示原因（hosts 钉死失效 IP）"
module: "engineering-ops"
status: completed
requirement_version: 1
created_on: 2026-09-10
updated_on: 2026-09-11
closed_on: 2026-09-10
owner: jack
related:
  - "../../../server/src/adapters/odoo-devops/odoo-devops-branches-client.ts"
  - "../../../server/src/modules/github-pr-odoo-devops-build/github-pr-odoo-devops-build.controller.ts"
---

# 定位 FE OdooSH build 状态不显示原因（hosts 钉死失效 IP）

## 目标

FE 打开 Meegle workitem 或 GitHub PR 时不显示 OdooSH build 状态；查明原因并回答 "DevOps session 是否过期"。

## 验收标准

- [x] 从 app/api 日志定位失败签名与起始时间。
- [x] 区分网络层失败与授权失败，回答 session 是否过期。
- [x] 复现 server 的上游请求，确认修复后全环境 200。

## 背景与范围

仅诊断与验证，不修改代码；排查全程不输出 cookie、session 值或响应体。

## 方案与决策

日志侧：`ODOO_DEVOPS_BRANCHES_REQUEST_FAILED` 带 `status` 字段为 HTTP 非 2xx，不带 `status` 为 fetch 抛错（网络层）；`ODOO_DEVOPS_BRANCHES_AUTH_REJECTED` 才对应 session 失效。网络侧：`getent` 与 `dig @上游DNS` 对比定位 `/etc/hosts` 覆盖，`tracepath` 确认丢包位置，最后用 `server/.env` 的 session 模拟三环境请求验证。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-10 | v1 | completed | app 日志 2026-09-10 16:33 起共 72 次 `ODOO_DEVOPS_BRANCHES_REQUEST_FAILED` 全部不带 `status`（fetch 抛错），无 `AUTH_REJECTED`；`/api/web/github-pr-odoo-devops-build` 返回 202/503。session 曾于 09-09 12:36 过期（AUTH_REJECTED 401/403/302），当天 12:54 更新 `server/.env` 后正常，今日失败与 session 无关。 | — |
| 2026-09-10 | v1 | completed | 根因：`/etc/hosts` 第 12 行将 `devops.odoo.tenways.it` 钉死为 `192.168.59.103`，该内网 IP 不可达（网关 192.168.0.1 回 `Destination Host Unreachable`，ping/tracepath 证实）；上游 DNS 223.5.5.5 解析为 58.60.106.226 且该路径服务正常（TLS SAN `*.odoo.tenways.it`，未授权 401）。odoo_devops_new 后端实际监听本机 `0.0.0.0:18443`。 | — |
| 2026-09-10 | v1 | completed | 修复：用户将 hosts 改回 `192.168.0.7 devops.odoo.tenways.it`。验证：用 `.env` session 模拟 eu/uk/us branches 请求全部 200（1.4–2.5s，client 超时 30s）。Node fetch 每次请求走 getaddrinfo，hosts 改动即时生效，无需重启。 | client `catch {}` 未记录 fetch 错误 cause，建议后续记录非敏感 `error.message` 便于区分 DNS/超时/拒绝；未改代码。 |
| 2026-09-11 | v1 | completed | FE 仍不显示的跟进：hosts 修复后端到端复验全部正常。用临时 web session 实测：列表接口 `odooShBuilds` 已填充（PR 1224=eu done/failed，1225/1226=eu done/success）；build 接口对 1224 返回 `eu done/failed`、PR 75 返回 `us done/failed`。PR head_ref 在 `github_pr_syncs` 均有值。Meegle 工作项列表的关联 PR 在 `attachMeegleRelations` 中硬编码 `odooShBuilds: []`，属设计行为，永远走行内实时拉取。临时 session 已删除。 | 结论为强刷 FE 即可显示；两个 PR 构建结果本身是 failed（红点）属真实状态。注意 AGENTS.md 写 server 端口 3040，实际 `.env` 为 3030，文档待更新。 |
