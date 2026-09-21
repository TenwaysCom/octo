---
title: "Ticket 操作反馈改为右上角通知"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-09-20
updated_on: 2026-09-20
closed_on: 2026-09-20
owner: TBD
related:
  - "2026-09-11-lark-ticket-context-menu-actions.md"
---

# Ticket 操作反馈改为右上角通知

## 目标与范围

将 Ticket 列表操作反馈从占据列表空间的居中文字改为右上角浮动 notification，3 秒自动关闭。范围仅 FE 提示展示，不改变操作接口或详情页反馈。

## 验收标准

- [x] 操作成功和失败反馈显示为右上角卡片，不占据列表布局空间。
- [x] 3 秒自动关闭，新提示重新计时，卸载清理定时器；支持手动关闭。
- [x] 保留原有消息、Meegle 链接及成功／失败区分，适配窄屏及减少动画偏好。
- [x] FE 检查和差异检查通过。

## 方案与决策

复用现有 ticketActionMessage 状态，通过 portal 渲染到 body 避免父级裁切；effect 管理计时器。沿用项目颜色，提供状态图标、关闭按钮和辅助技术通知语义，无新增依赖。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-20 | v1 | done | 已完成通知展示、自动关闭及静态审阅，FE 现有单测与构建通过 | 未执行浏览器 E2E 或部署 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态审阅与差异检查 | 通过 | portal 固定定位、3000ms 计时及 effect 清理、原有链接保留；`git diff --check` | 未做浏览器视觉检查 |
| 现有单测与构建 | 通过 | `pnpm --dir fe check`、`git diff --check` | 不证明浏览器或生产行为 |
| live E2E、部署运行时 | 未执行 | - | 无真实平台写入或部署 |
