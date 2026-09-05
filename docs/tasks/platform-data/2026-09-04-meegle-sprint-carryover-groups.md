---
title: "Meegle Sprint 详情结转工作项分组"
module: "platform-data"
status: done
requirement_version: 2
created_on: 2026-09-04
updated_on: 2026-09-04
closed_on: 2026-09-04
owner: TBD
related:
  - "2026-08-27-meegle-sprint-ui.md"
  - "2026-08-27-meegle-sprint-history.md"
---

# Meegle Sprint 详情结转工作项分组

## 目标

在 Sprint 详情中把当前 Sprint 内的工作项与已结转到后续 Sprint 的工作项分开显示；结转项继续显示目标 Sprint 名称。本任务只使用既有 FE DTO，不修改 Server、同步或归属历史契约。

## 验收标准

- [x] 工作项按现有筛选和排序结果分为“已结转至后续 Sprint”和“本 Sprint 工作项”，并优先展示结转区段。
- [x] 带 `carryoverToSprintId` 或 `carryoverToSprintName` 的工作项只显示在结转分组。
- [x] 结转项显示“结转至 XXX Sprint”；目标名称缺失时显示安全兜底文案。
- [x] 既有列、排序、筛选及用户配置的分组/子分组继续在各结转分组内生效。
- [x] FE 测试和 production build 通过。

## 背景与范围

Sprint 归属历史将已转入后续 Sprint 的工作项保留在原 Sprint，并在 FE DTO 上投影 `carryoverToSprintId/name`。此前详情表格仅在工作项标题下显示结转 badge，用户无法快速区分原 Sprint 内仍在范围的工作项和后续 Sprint 接续的工作项。

## 方案与决策

v1 将筛选并排序后的工作项按 carryover 字段切分为当前/结转两个区段。v2 调整展示优先级：结转区段在前，当前 Sprint 区段在后。各区段内继续应用现有的 Group by、Sub group by、列与排序设置；折叠状态用区段 key 前缀隔离，避免相同分组名称互相影响。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-04 | v1 | in_progress | 已完成 FE 展示、纯函数分区及回归测试覆盖。 | 运行 FE 测试和 production build；未执行登录态浏览器视觉验收。 |
| 2026-09-04 | v1 | done | 当前/结转区段、结转目标 badge 和按区段隔离的分组折叠状态已完成；FE 测试与 production build 通过。 | 未执行登录态浏览器视觉验收。 |
| 2026-09-04 | v2 | in_progress | 需求调整为结转区段优先展示；已更新分区顺序与回归断言。 | 运行 FE 测试和 production build。 |
| 2026-09-04 | v2 | done | 结转区段现优先展示；完整 FE 测试与 production build 通过。 | 未执行登录态浏览器视觉验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 全量测试 | 通过 | `pnpm --dir fe test`：33/33 测试文件通过，包含结转优先分区的纯函数覆盖。 | Node 测试不覆盖登录态浏览器视觉。 |
| FE production build | 通过 | `pnpm --dir fe build`：Vite 处理 65 个模块并成功生成 assets。 | 未部署或重启 FE 服务。 |

## 关联

- `fe/src/pages/MeegleSprintPages.jsx`
- `fe/src/lib/meegle-sprint-workitem-view.js`
- `fe/src/lib/meegle-sprint-workitem-view.test.js`
- `fe/src/styles/global.css`
