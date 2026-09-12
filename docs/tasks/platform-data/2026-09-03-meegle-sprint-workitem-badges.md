---
title: "Meegle Sprint 工作项信息 badge 与用户展示"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-09-03
updated_on: 2026-09-03
closed_on: 2026-09-03
owner: TBD
related:
  - "#meegle-sprints/13658870"
  - "2026-08-31-show-meegle-workitem-system.md"
  - "../platform-sync/2026-09-01-meegle-related-people.md"
---

# Meegle Sprint 工作项信息 badge 与用户展示

## 目标

在 Meegle Sprint 详情的工作项表格中，将状态、项目、Version、System 和优先级显示为紧凑 badge，并让负责人、当前相关人的姓名复用统一 `User` 组件。只调整已有同步字段的 FE 展示，不修改 Server、同步、清洗或 API 契约。

## 验收标准

- [x] 状态 badge 复用普通 Meegle 列表的状态色分级。
- [x] 项目、Version、System、优先级使用可显示完整 title 的紧凑 badge。
- [x] 负责人使用 `User` 组件，空值保持 `-`。
- [x] 当前相关人保留角色、前两项和 `+N` 展开语义，姓名改用 `User` 组件。
- [x] FE 测试和 production build 通过。

## 背景与范围

Sprint 工作项 DTO 已提供 `status`、`projectName/projectKey`、`version`、`system`、`priority`、`assignee` 和 `relatedPeople`。现有页面除类型和结转信息外主要显示纯文本；本任务只统一视觉语义和人员展示。

## 方案与决策

把普通列表已有的 Meegle 状态 tone 纯函数移到共享行模型模块，由普通列表和 Sprint 页面共同使用。Sprint 的其他枚举字段使用页面局部 badge 样式。相关人组件继续负责角色分组和 popover，只将人员节点替换为 `User`。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-03 | v1 | in_progress | 已完成代码路径确认并实现展示改动。 | 运行 FE test/build；未执行登录态浏览器视觉验收。 |
| 2026-09-03 | v1 | done | 状态 tone 已共享；Sprint 枚举字段已改为 badge；负责人和相关人姓名已使用 `User`。FE test/build 通过。 | 未执行登录态浏览器视觉验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 全量测试 | 通过 | `pnpm --dir fe test`：31/31 个测试文件通过。 | Node 单测不包含浏览器视觉验收。 |
| FE production build | 通过 | `pnpm --dir fe build`：Vite 处理 63 个模块并成功生成 assets。 | 未部署或重启 FE 服务。 |

## 关联

- `fe/src/pages/MeegleSprintPages.jsx`
- `fe/src/components/platform/MeegleRelatedPeople.jsx`
- `fe/src/components/user/User.jsx`
- `fe/src/lib/platform-list-rows.js`
- `fe/src/styles/global.css`
