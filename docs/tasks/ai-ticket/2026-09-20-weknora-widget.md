---
title: "Lark Ticket WeKnora 浮窗"
module: ai-ticket
status: done
requirement_version: 1
created_on: 2026-09-20
updated_on: 2026-09-20
closed_on: 2026-09-20
owner: Codex
related: []
---

# Lark Ticket WeKnora 浮窗

## 目标与范围

在已登录的 Lark Ticket 列表及详情页展示 octo 客服浮窗；后端兑换短时令牌，长期发布 Token 仅保存在服务端。不自动传送 Ticket 内容，不修改外部频道配置，不部署。

## 验收标准

- [x] 仅 Ticket 页面挂载，离开/退出后销毁，异步加载完成后不产生遗留浮窗。
- [x] 两个令牌路由验证真实 Octo session；禁止缓存，错误不泄漏上游内容。
- [x] 兑换使用固定频道、服务端 Token 和配置 Origin；有超时和响应校验。
- [x] 相关测试、FE 和 Server 构建通过。

## 方案与决策

使用公开 SDK 的 init/destroy API，避免 SPA 重复注入自动初始化脚本。SDK 会携带 Cookie 请求令牌并自动刷新。保留 `/weknora/embed-token`，FE 使用兼容现有反向代理的 `/api/weknora/embed-token`。成功响应按 SDK 返回 `{ token, expiresIn }`，失败使用结构化 Octo error。无业务请求参数，拒绝 query 覆盖配置。认证复用 resolveLarkWebSessionIdentity。

服务端设置 `WEKNORA_PUBLISH_TOKEN`；`WEKNORA_EMBED_ORIGIN` 为 FE 对外 origin，未设置则取 `LARK_OAUTH_CALLBACK_URL` 的 origin。频道 allowed_origins 必须包含该 FE origin。配置缺失返回 503，上游失败返回 502。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-20 | v1 | in_progress | 已读取公开 SDK 并实现 FE、接口、adapter 和测试 | 执行本地验证；未进行真实 Token 兑换或部署 |

| 2026-09-20 | v1 | done | 本地实现、29 项 Server 测试、227 项 FE 测试和两端构建通过 | 未部署，真实兑换与浏览器联调待环境配置后执行 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 相关单测 / mock HTTP | 29/29 通过 | Vitest: controller、adapter、api-auth、index | 无真实 WeKnora 兑换 |
| FE 全量单测 | 227/227 通过 | node --test | 挂载与异步清理使用 mock SDK |
| 构建 | Server tsc / FE vite build 通过 | 本地输出 | 非部署证明 |
| 差异检查 | git diff --check 通过 | 本地输出 | 无提交或部署 |
| Live E2E | 未执行 | 未配置发布 Token | 待真实浏览器、allowed_origins 和部署联调 |

验证命令从各 package 目录直接调用 node_modules/.bin/vitest、tsc、vite；pnpm 在复用 node_modules 的 worktree 触发自动安装检查并因无 TTY 退出，未修改依赖配置。
