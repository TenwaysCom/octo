---
title: "Meegle 工作项默认按类型折叠分组"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-09-03
updated_on: 2026-09-03
closed_on: 2026-09-03
owner: TBD
related:
  - "/#meegle-workitems"
  - "../platform-sync/2026-08-27-list-view-kanban-and-grouping.md"
---

# Meegle 工作项默认按类型折叠分组

## 目标

让 `/#meegle-workitems` 在没有会话内已保存视图配置时，默认使用列表视图、按工作项类型分组，并在数据首次加载后折叠所有类型组。用户已经调整并保存于当前 FE 会话的分组和展开状态继续优先恢复。

## 验收标准

- [x] 缺失或非法的 Meegle 主分组配置默认归一化为 `workitemType`。
- [x] 首次加载出工作项分组后，所有类型组默认折叠。
- [x] “重置”恢复按类型分组并重新折叠所有类型组。
- [x] 已保存的合法分组和折叠状态不被默认值覆盖。
- [x] FE 测试和 production build 通过。

## 背景与范围

页面已有主分组折叠状态，但原默认分组为状态；同时默认折叠 effect 会在数据尚为空时提前记住配置，导致真实分组加载后不再初始化折叠。本任务只调整 FE 默认视图状态，不改查询、筛选、Server 或同步契约。

## 方案与决策

在 Meegle 视图配置模块声明 `DEFAULT_MEEGLE_GROUP_BY = "workitemType"`，归一化与重置共同使用。默认折叠 effect 在分组数据非空后才记录配置并生成唯一折叠 key；恢复出的折叠数组继续走既有 `restored` 分支。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-03 | v1 | in_progress | 已调整默认配置、首次数据折叠时机和重置行为，并补充纯函数测试。 | 运行 FE test/build；未执行登录态浏览器验收。 |
| 2026-09-03 | v1 | done | 默认主分组已改为类型；首次数据加载和重置后会折叠全部类型组；已有会话状态保持优先。FE test/build 通过。 | 未执行登录态浏览器验收。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 全量测试 | 通过 | `pnpm --dir fe test`：31/31 个测试文件通过。 | Node 单测不覆盖浏览器折叠点击交互。 |
| FE production build | 通过 | `pnpm --dir fe build`：Vite 处理 63 个模块并成功生成 assets。 | 未部署或重启 FE 服务。 |

## 关联

- `fe/src/lib/meegle-view-config.js`
- `fe/src/lib/meegle-view-config.test.js`
- `fe/src/pages/PlatformListPage.jsx`
