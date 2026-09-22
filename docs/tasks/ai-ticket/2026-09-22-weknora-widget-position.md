---
title: "WeKnora 嵌入图标位置与尺寸调整"
module: ai-ticket
status: done
requirement_version: 2
created_on: 2026-09-22
updated_on: 2026-09-22
closed_on: 2026-09-22
owner: Codex
related: []
---

# WeKnora 嵌入图标位置与尺寸调整

## 目标与范围

将现有 WeKnora 浮窗入口从右上角移到右下角，并将按钮从 56px 缩至 44px、内部图标从 24px 缩至 20px。

## 验收标准

- [x] SDK 初始化使用 `position: "bottom-right"`。
- [x] 现有 widget 测试通过。
- [x] 入口尺寸样式调整完成并通过 FE 构建。

## 方案与决策

沿用 SDK 的 position 配置。当前任务目录未找到原 WeKnora 接入记录，本次位置调整独立建档。

v2 补充尺寸调整：已读取部署中的公开 SDK，按钮直接追加到 body，使用 `aria-label="octo 客服"`，尺寸为行内样式且无入口尺寸参数。使用该限定选择器覆盖宽高与字号；聊天面板尺寸不变。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-22 | v1 | done | 更新初始化位置与现有测试断言；定向测试通过 | 未部署或浏览器实测 |
| 2026-09-22 | v2 | done | 入口改为 44px，图标 20px；FE 构建和现有 widget 测试通过 | 未浏览器实测；样式依赖当前 SDK 的 DOM 和 aria-label |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 单测 / mock SDK | 通过 | `node --test fe/src/lib/weknora-widget.test.js` | 不证明外部 SDK 实际渲染 |
| 构建 / 差异检查 | 通过 | `pnpm --dir fe build`、`git diff --check` | 本地验证 |
| Live E2E / 部署验证 | 未执行 | - | 未确认线上位置和尺寸 |
