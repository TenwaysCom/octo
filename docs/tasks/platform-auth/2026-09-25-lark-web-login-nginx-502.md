---
title: "FE Lark 登录 nginx 502 排障"
module: "platform-auth"
status: done
requirement_version: 1
created_on: 2026-09-25
updated_on: 2026-09-25
closed_on: 2026-09-25
owner: Codex
related:
  - "server/src/adapters/ai/model-request-client.ts"
---

# FE Lark 登录 nginx 502 排障

## 目标与范围

定位 `/api/lark/auth/web/start` 的 nginx 502 原因。本次为只读诊断，不安装依赖、不构建或重启生产服务。

## 验收标准

- [x] 检查实际 nginx 上游、端口和登录入口响应。
- [x] 给出启动故障证据和恢复建议，区分诊断与恢复验证。

## 结论与决策

生产 nginx `/api/` 指向 `127.0.0.1:3000`，实际 TCP 连接被拒绝；通过本机 18443 HTTPS 入口、生产域名 SNI 请求登录路径返回 502。测试端口 3030 可连接。

PM2 的 `octo-server-production` 显示 online，PID 1936193，最近启动时间为 2026-09-24 20:05:43 +08:00，但该进程没有 API 监听，也没有对应 app 启动成功日志。PM2 error 日志末尾报 `ERR_MODULE_NOT_FOUND: Cannot find package 'undici' imported from .../server/dist/adapters/ai/model-request-client.js`。

`server/package.json` 已在 devDependencies 声明 `undici`，但 `server/pnpm-lock.yaml` 没有该包记录，`server/node_modules/undici` 不存在；在 server 目录执行 Node 模块解析同样返回 `ERR_MODULE_NOT_FOUND`。代码引入依赖后，安装状态和锁文件未同步，阻断服务启动。PM2 online 不能作为 HTTP 就绪证据。

建议后续同步锁文件并安装声明的依赖，再重启生产 API，验证 3000 监听和登录入口 302，最后验证真实 Lark 回调。当前部署脚本使用 `pnpm install --frozen-lockfile`，仅重启或按原锁文件安装不足以解决依赖不一致。生产工作区存在其他未提交改动，恢复时需明确部署内容。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-25 | v1 | done | 完成 nginx 配置、主机端口、PM2 状态、错误日志和模块解析交叉核对 | 未执行恢复；未验证 Lark 授权回调 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 | 确认依赖声明与锁文件不一致 | package.json、server/pnpm-lock.yaml、dist 模块 import | 未修改业务代码 |
| 已部署运行时 | 复现 502；3000 connection refused；3030 可连接 | 本机 nginx HTTPS 请求，仅记录状态码 | 未携带用户凭据，未跟随授权跳转 |
| 模块解析 | ERR_MODULE_NOT_FOUND: undici | server 目录 Node import.meta.resolve | 与 PM2 error 日志一致 |
| 单测 / mock integration / live E2E | 未执行 | 只读运行时诊断 | 不宣称已修复或登录成功 |

## 证据位置

- `/etc/nginx/sites-enabled/octo.conf`
- `/home/deploy/.pm2/logs/octo-server-production-error-5.log`
- `/home/deploy/.pm2/pm2.log`
- [依赖声明](../../../server/package.json)
- [部署脚本](../../../scripts/deploy-prod.sh)
