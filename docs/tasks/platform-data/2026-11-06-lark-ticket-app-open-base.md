---
title: "Ticket 窄页打开 Lark Base"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-11-06
updated_on: 2026-11-06
closed_on: 2026-11-06
owner: TBD
related:
  - "docs/tasks/platform-data/2026-10-21-lark-app-create-meegle.md"
---

# Ticket 窄页打开 Lark Base

## 目标

在 Ticket AI 窄页的“打开 Meegle”后增加“打开 Lark Base”，打开当前 Ticket 的原始 Base 记录。

## 验收标准

- [x] 入口位于 Meegle 操作后，在新标签页打开当前 Ticket 的 HTTP(S) Base 记录链接。
- [x] 未缓存记录链接时复用已有 shared-url 接口获取；失败可重试，切换 Ticket 不串链接。
- [x] 无编辑权限仍可打开，窄屏自然换行且无横向溢出。
- [x] FE 检查与浏览器模拟验证通过，记录未部署、未做真实平台验证的边界。

## 背景与范围

仅调整 FE 窄页入口，复用已有服务端共享链接读取能力；不新增 API、配置或依赖，不执行部署或真实平台写入。

## 方案与决策

优先使用 Ticket 的 sharedUrl；缺失时沿用详情页的共享链接读取接口。独立组件按完整 Ticket 标识隔离加载状态与晚到响应。复用现有外链安全检查、属性栏布局和操作样式。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-11-06 | v1 | in_progress | 已定位窄页 Meegle 操作、详情页 shared-url 读取及链接安全校验 | 实现入口并检查构建、模拟浏览器行为 |
| 2026-11-06 | v1 | done | 入口及缺失链接读取、失败重试已完成；FE check 与浏览器 11 组模拟验证通过 | 仅本地合成数据；未部署、未访问真实平台 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 单测 | 通过 | `pnpm --dir fe check`：51 项通过，0 失败 | 现有单测回归，不证明部署或真实平台行为 |
| FE 静态构建 / 差异 | 通过 | 同一命令的 Vite build；`git diff --check` | 本地构建，未部署 |
| 浏览器模拟集成 | 通过 | 复用 `fe/manual-tests/lark-ticket-field-edits.browser.mjs`，临时追加入口验收后运行 `/tmp/octo-open-base.browser.mjs`，11 组 PASS；输出 `/tmp/octo-open-base-browser.log` | 合成 Ticket 和模拟 API；320/390/560px 无溢出；验证顺序、新标签页属性、只读可用、缺失链接、晚到响应隔离、非法 URL 拦截与失败重试。localhost 监听受沙箱限制后在沙箱外执行。临时断言已适配开发模式 StrictMode 的两次读取 |
| Live E2E / 部署验证 | 未执行 | - | 本次未部署或访问真实平台 |

## 关联

- [现有 Meegle 操作](2026-10-21-lark-app-create-meegle.md)
