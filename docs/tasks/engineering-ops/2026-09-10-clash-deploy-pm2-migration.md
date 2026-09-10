---
title: "将 rick 的 Clash 迁移到 deploy PM2"
module: "engineering-ops"
status: completed
requirement_version: 1
created_on: 2026-09-10
updated_on: 2026-09-10
closed_on: 2026-09-10
owner: Codex
related:
  - "./2026-09-10-pm2-staging-restart-diagnosis.md"
---

# 将 rick 的 Clash 迁移到 deploy PM2

## 目标

完整复制 `/home/rick/.config/clash` 到 `/home/deploy/.config/clash`，由 deploy 的 PM2 维护，保留原目录用于回退。

## 验收标准

- [x] 完整复制并调整目标目录所有权，敏感配置不进入仓库。
- [x] 修正副本中的用户路径及启停入口，迁移现有定时更新。
- [x] deploy PM2 托管唯一 Clash 实例，验证端口、代理请求、重启及保存进程列表。

## 背景与范围

原服务由 rick 的 `proxy-toggle.sh` 以 nohup 启动；rick 有每日 06:00 的订阅更新任务。deploy 已有三个 PM2 应用及 enabled 的 pm2-deploy 系统服务。本任务不更改 Octo 业务代码或其他应用配置。

## 方案与决策

先复制并校验，再切换进程。PM2 直接托管 Clash 二进制，关闭 watch；副本的启动、重启和更新回退入口使用 PM2。只迁移相关 cron 条目，不动其他任务。日志与订阅凭证不写入任务记录。

运行配置位于 `/home/deploy/.config/clash/ecosystem.config.cjs`，应用名 `clash`，明确设置配置及数据目录、单实例、自动重启、3 秒重启间隔。目录权限为 700，所有副本文件归 deploy。每日 06:00 使用服务器原有时区；原条目保存在目标目录的 `rick-update.cron.backup`。原 rick 目录未改动，回退时先停止 deploy PM2 实例，再恢复旧服务及该 cron，避免端口争用。

维护命令：`pm2 status clash`、`pm2 logs clash --lines 100`、`pm2 restart clash`。deploy 副本的 `proxy-toggle.sh restart` 兼容入口已转发至 PM2；`start.sh` 与订阅更新的启动回退使用 PM2。`start.sh` 显式配置现有 Node/PM2 路径，以适配 cron 环境。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-10 | v1 | in_progress | 确认目标目录尚不存在；发现 convert.py 的旧用户绝对路径、nohup 启动入口和每日更新任务。 | 复制并修正目标副本，校验后切换。 |
| 2026-09-10 | v1 | completed | 完整复制 21 个文件并验证静态内容；修正两个 Python 绝对路径及 shell 启停入口。停止经 PID、属主和可执行文件确认的 rick 实例后刷新 cache.db，启动 deploy PM2 Clash。迁移 cron，验证兼容重启并执行 pm2 save。 | 未实际重启主机，未执行订阅下载更新；保留源目录。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 文件与静态校验 | 通过 | 复制时静态文件摘要一致；全部副本文件归 deploy；活动脚本和 YAML 无旧用户绝对路径；bash -n、node --check、Python AST、PyYAML import、Clash -t 均通过 | 活跃日志及缓存不作为复制摘要比较对象，cache.db 在停止旧实例后重新复制 |
| 运行时验证 | 通过 | 唯一 Clash 实例属于 deploy；PM2 online、watch=false；7890 与 9090 监听属该 PID；兼容脚本重启后 PID 更新、累计重启 1 次 | 未通过强杀额外测试崩溃恢复 |
| 网络验证 | 通过 | 切换后及重启后经 127.0.0.1:7890 请求 Google 均返回 HTTP 302；控制接口 /version 均返回 HTTP 200 | 不输出响应体，不覆盖全部代理节点 |
| 定时与持久化 | 配置确认 | rick 原 cron 已移除，deploy 相同计划存在，其他 cron 保留；dump.pm2 包含 Clash；pm2-deploy 为 enabled | 既有 systemd 单元当前 inactive，PM2 daemon 独立运行；未启动/重启该单元或主机，开机恢复未实测；订阅下载与定时触发未执行 |

## 复盘

仅复制目录会遗留更新器的旧用户路径和原用户的定时入口；仅将 nohup 包装脚本纳入 PM2 则无法托管实际服务。迁移前已识别并修正这些风险。持久规则见学习账本，任务事实以本文为准。

## 关联

- [PM2 staging 重启诊断](./2026-09-10-pm2-staging-restart-diagnosis.md)
