---
title: "Lark App 分析页异步接入 WeKnora"
module: ai-ticket
status: done
requirement_version: 1
created_on: 2026-09-25
updated_on: 2026-09-25
closed_on: 2026-09-25
owner: Codex
related: []
---

# Lark App 分析页异步接入 WeKnora

## 目标与范围

已登录的 Lark App Ticket 分析页复用客服浮窗。SDK 和服务可用性异步检测，不阻塞页面；服务无响应时不显示入口。仅修改 FE，复用现有 embed-token 接口，不更改服务端契约或发送 Ticket 内容。

## 验收标准

- [x] Lark App 分析页挂载现有浮窗。
- [x] SDK 与 embed-token 均成功后显示；失败、超时或离开页面后不显示。
- [x] 相关单测和 FE 构建通过。

## 方案与决策

复用现有组件及位置、样式。并行加载 SDK 与请求现有 embed-token 接口确认上游可用，8 秒未完成即放弃本次挂载；SDK 缓存命中时仍需检查上游。可用性检查的 token 不保存；SDK 沿用既有 tokenEndpoint 获取会话。离开页面中止检测、销毁已挂载浮窗。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-25 | v1 | done | 已接入 lark-app；增加异步可用性检查、8 秒超时与离开页面中止；FE check 通过 | 未部署，未真实 Lark 客户端验收 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 单测 / mock | 通过 | `pnpm --dir fe check`：46 个测试文件通过；涵盖 SDK 失败、服务拒绝、无效响应、超时及离开页面后的迟到响应 | 使用 mock SDK / fetch，不证明外部 SDK 实际渲染 |
| 构建 / 静态检查 | 通过 | FE Vite 构建、`git diff --check` | 构建有大于 500 kB 的 chunk 提示；本地检查 |
| Live E2E / 部署验证 | 未执行 | - | 本次不部署；尚未真实 Lark 客户端验收 |
