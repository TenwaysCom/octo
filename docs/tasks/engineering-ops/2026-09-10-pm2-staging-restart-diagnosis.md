---
title: "定位 staging Server PM2 连续重启原因"
module: "engineering-ops"
status: completed
requirement_version: 2
created_on: 2026-09-10
updated_on: 2026-09-10
closed_on: 2026-09-10
owner: Codex
related:
  - "../../../ecosystem.config.cjs"
---

# 定位 staging Server PM2 连续重启原因

## 目标

查明 `octo-server-staging` 此前连续重启的原因，并按用户后续要求将 Server PM2 文件监听限制为 `dist`。不启停服务。

## 验收标准

- [x] 用 PM2 日志确认触发原因，并与仓库配置交叉核对。
- [x] 确认当前进程状态，说明修复方向及未验证边界。
- [x] Server 配置仅监听 `dist`，完成语法和配置值检查。

## 背景与范围

检查 PM2 daemon 日志、目标进程 describe 和根目录 ecosystem 配置；不读取凭证或业务响应。

## 方案与决策

原先的 `watch: true` 监听了 Server 工作目录内的运行日志。日志写入触发 PM2 重启，随后启动日志再次触发重启，形成循环。v2 按用户明确要求改为 `watch: ["dist"]`，相对 Server 的 `cwd` 仅监听构建产物目录；替代 v1 仅诊断的决定。Worker 配置保持不变。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-10 | v1 | completed | PM2 日志时间 14:21:02–14:22:15 共 132 条目标应用文件变化重启事件，其中 api 日志 1 次、app 日志 131 次；14:22:16 停止监听并停止进程。describe 显示 stopped、累计重启 133 次、watch 关闭。 | 当前进程中的 watch 已关闭，但仓库配置仍为 true；未修改或启动服务。 |
| 2026-09-10 | v2 | completed | Server 的 watch 改为 `["dist"]`；Node 语法检查及加载配置后的断言通过。 | 仅更新配置文件，未重新加载 PM2 或启动服务；运行时生效尚未验证。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 运行时只读检查 | 根因确认 | `/home/deploy/.pm2/pm2.log` 明确记录 `Change detected on path logs/app.2026-09-10.1.log for app octo-server-staging - restarting`，随后 code 0 / SIGINT 退出 | 解释本次日志触发的重启循环，不覆盖全部历史重启原因 |
| 进程状态 | 已停止 | `pm2 describe octo-server-staging` | 为查询时快照；初次沙箱访问 socket 失败后，使用获批只读查询成功 |
| 配置检查 | 语法及配置值检查通过 | `node --check ecosystem.config.cjs`；加载配置断言 Server watch 为 `["dist"]`、cwd 为 Server 目录、Worker watch 为 false | 未重新加载 PM2；无业务代码变更，未运行构建或业务测试 |

## 关联

- [PM2 配置](../../../ecosystem.config.cjs)
