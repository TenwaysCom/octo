---
title: "修改 staging 前后端重启脚本"
module: "engineering-ops"
status: completed
requirement_version: 1
created_on: 2026-09-11
updated_on: 2026-09-11
closed_on: 2026-09-11
owner: Codex
related: []
---

# 修改 staging 前后端重启脚本

## 目标

将 `scripts/restart-staging-fe-n-server.sh` 改为用户指定的四步流程。

## 验收标准

- [x] 依次执行 `pnpm --dir server build`、`pm2 restart octo-server-staging`、`make fe-build`、`git status`。
- [x] Bash 语法检查通过。

## 背景与范围

仅修改脚本，不实际构建或重启服务。

## 方案与决策

从脚本位置定位项目根目录，四步提供进度提示；命令失败时停止执行。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-11 | v1 | completed | 四步命令已更新，Bash 语法检查通过 | 未执行实际构建和重启 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 | 通过 | `bash -n scripts/restart-staging-fe-n-server.sh` | 不覆盖实际服务运行 |

## 关联

- `scripts/restart-staging-fe-n-server.sh`
