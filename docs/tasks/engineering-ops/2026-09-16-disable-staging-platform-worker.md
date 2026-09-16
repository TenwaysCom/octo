---
title: "仅 production 启用 platform sync worker"
module: "engineering-ops"
status: done
requirement_version: 2
created_on: 2026-09-16
updated_on: 2026-09-16
closed_on: 2026-09-16
owner: Codex
related:
  - "../../../ecosystem.config.cjs"
---

# 仅 production 启用 platform sync worker

## 目标

ecosystem 仅在 NODE_ENV=production 时维护 API Server 与 platform sync worker；其他环境只维护 API Server。已删除的 staging Worker 保持停用。本次不部署 production，不修改环境文件或重启 API Server。

## 验收标准

- [x] production 包含 Server 与 Worker；staging、development、test 及自定义环境只包含 Server。
- [x] v1 已完成 PM2 staging Worker 删除及保存；v2 不操作运行中进程。
- [x] 配置语法、环境分支与相关文档按 v2 重新检查。

## 背景与范围

用户已授权执行上一轮提出的配置过滤、PM2 delete 和 save。工作树原有 .gitignore、技术对象文档及 PostgreSQL 网络任务记录改动须保留。

## 方案与决策

v2 按 server/.env 的 NODE_ENV，仅 production 保留 Worker，所有环境保留 Server。v1 的“仅排除 staging，其他环境保留 Worker”规则已被替代（superseded），其静态分支检查不再作为 v2 完成依据。移除配置不会停止既有进程，v1 已删除 octo-platform-sync-worker-staging 并保存 PM2 列表；当时列表中无其他独立 Worker，本次无新增进程操作。手工直接启动 Worker 不受此配置约束。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-16 | v1 | in_progress | 已检查工作树、现有 ecosystem 和任务记录，确认实施范围。 | 修改配置并验证 PM2 当前与保存列表。 |
| 2026-09-16 | v1 | done | 已过滤 staging Worker，更新运行说明与技术对象文档。通过 PM2 API 删除已核对 cwd 的目标进程并执行 dump（对应 pm2 save）；当前与保存列表均只有 octo-server-staging、octo-server、clash、odoo-docs。逐项断言其他进程 PID、启动时间、重启次数与状态未变。 | 未部署 production，未运行同步业务。 |
| 2026-09-16 | v2 | in_progress | 用户改为仅 production 注册 Worker；已更新目标与验收标准，重新打开配置分支及文档检查。影响限于 ecosystem 与说明，既有 staging 停用操作仍有效。 | 修改配置并重新检查所有环境分支。 |
| 2026-09-16 | v2 | done | ecosystem 改为仅 production 保留 Worker；同步运行说明及技术对象文档，六种环境配置断言与语法检查通过。 | 未操作 PM2，未部署 production。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 | v2 通过 | node --check ecosystem.config.cjs；隔离执行并断言 production / staging / development / test / preview / production-preview 的进程名、Server cwd/script/watch、Worker script/watch/instances；实际 .env 仅注册 octo-server-staging；git diff --check | 未构建应用，不启动其他环境；v1 静态结果已被替代。 |
| 运行时验证 | v1 已通过，v2 无进程操作 | v1 PM2 删除目标后 read-back；读取 dump.pm2 仅校验进程名称，与当前列表一致，均不含 staging Worker；其他进程保持 online 且 PID、启动时间、重启次数不变 | 未进行整机重启恢复测试；不输出环境变量或凭据；不代表 production 部署。 |
| 单测 / mock integration / live E2E | 不执行 | 仅进程配置与运维变更 | 不验证同步业务或 production 部署。 |

PM2 使用全局安装路径；本仓库未安装 PM2 模块。初次沙箱连接 socket 返回 EPERM，后通过获批的提权调用完成检查和变更，无需修改 PM2 权限或安装依赖。

## 关联

- [平台同步文档](../../tenways-octo/it-platform-sync.md)
