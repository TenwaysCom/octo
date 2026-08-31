---
title: "在 Meegle 工作项页面显示 System"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-08-31
updated_on: 2026-08-31
closed_on: 2026-08-31
owner: TBD
related:
  - "docs/tasks/platform-data/2026-08-27-meegle-sprint-ui.md"
---

# 在 Meegle 工作项页面显示 System

## 目标

在 `#meegle-workitems` 和 `#meegle-sprints/<sid>` 的 Meegle 工作项展示中显示 Server 已投影的 `system`，不修改同步、清洗、数据库或 API 契约。

## 验收标准

- [x] 普通 Meegle 工作项紧凑行在已有 `system` 时保持展示，窄屏不再隐藏。
- [x] Sprint 详情工作项表默认包含 System 列，空值显示“未设置”。
- [x] Sprint 详情支持按 System 排序、主分组和次分组。
- [x] FE 测试和 production build 通过。

## 背景与范围

Server `meegleWorkitemSchema`、Sprint membership 投影和 FE API parser 已包含可选 `system`。普通工作项页面已经配置 System 列，但紧凑行在 900px 以下隐藏；Sprint 详情工作项视图尚未声明 System 列。

## 方案与决策

复用现有 `item.system` 投影。普通工作项行只取消 System 的窄屏隐藏；Sprint 详情在既有列配置、取值函数、单元格和过滤字段中加入 System，并沿用通用排序/分组实现。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-31 | v1 | in_progress | 已确认 Server DTO 和 FE parser 均已传递 `system`；展示代码已修改。 | 运行 FE 测试和 build。 |
| 2026-08-31 | v1 | done | 普通列表 System 取消窄屏隐藏；Sprint 详情已增加 System 列、筛选、排序和分组。FE check 通过。 | 未执行登录态浏览器视觉验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 测试 | 通过 | `pnpm --dir fe check`：26/26 个测试文件通过。 | Node 单测，不包含登录态浏览器视觉验收。 |
| FE production build | 通过 | `pnpm --dir fe check`：Vite 处理 56 个模块并成功输出 production assets。 | 未部署或重启 FE 服务。 |

## 关联

- `fe/src/lib/platform-list-rows.js`
- `fe/src/lib/meegle-sprint-workitem-view.js`
- `fe/src/pages/MeegleSprintPages.jsx`
