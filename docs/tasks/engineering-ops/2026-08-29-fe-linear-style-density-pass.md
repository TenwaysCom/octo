---
title: "FE Linear 风格密度与视觉收敛"
module: "engineering-ops"
status: done
requirement_version: 1
created_on: 2026-08-29
updated_on: 2026-08-29
closed_on: 2026-08-29
owner: TBD
related:
  - "fe/src/styles/global.css"
---

# FE Linear 风格密度与视觉收敛

## 目标

在 `fe` 现有页面上做低成本的 Linear 风格视觉优化:压缩侧边栏/页面/表格信息密度,移除列表与表格的过度卡片化(多余阴影、大圆角、虚线框),导航选中态从渐变背景改为细左侧指示条,统一工具栏按钮与 badge 的尺寸和颜色,简化空状态。不做暗黑模式、Cmd+K、搜索、路由、API 或业务功能变更。

## 验收标准

- [x] 侧边栏宽度 250px → 224px,导航项/子项/分组间距收紧,选中态为 2px 品牌色左指示条 + 浅底,无渐变
- [x] 表格容器去阴影、圆角 12→8,th/td padding 由 13/15×18 压缩到 8/9×14
- [x] 列表/看板/分组卡片去阴影、圆角收敛到 6–10px,分组与看板列去掉品牌色描边底色
- [x] 工具栏控件统一 32px 高、6px 圆角(search input、filter button、分页、load-more、secondary-button);filter tab 圆角收敛至 6px,实际高度约 25px 未强制 32px
- [x] badge 颜色收敛到 `:root` 的 `--octo-badge-*` 变量,尺寸统一为 `padding: 3px 7px; font-size: 11px`
- [x] 空状态(`.list-message`、`.ticket-ai-session-empty`、`.list-load-more`)去掉虚线框与底色,只留文本
- [x] `pnpm --dir fe test` 91/91、`pnpm --dir fe build` 通过；功能样式改动仅在 `fe/src/styles/global.css`

## 背景与范围

- 功能样式改动集中在 `fe/src/styles/global.css`,未触碰任何 JSX/JS、路由或 API。
- 登录页(`.auth-*`、`.visual-*`、`.primary-button`、`.plugin-login-button`)与浮层阴影(modal、下拉 panel)刻意保留,不在本次范围。
- 顺带修复潜在 bug:`--octo-brand-soft` 被 `.profile-nav__count` 和 `.github-user:hover` 引用但从未在 `:root` 定义,本次补上。

## 方案与决策

- 用 `:root` 新增 10 组 `--octo-badge-{tone}-{text,bg}` 变量替代散落的硬编码色对(`#6d28d9/#ede9fe` 等),badge 修饰类只改引用不换语义。
- 导航选中指示条用 `::before` 绝对定位实现(2px、`left: 2px`),避免 inset box-shadow 与圆角裁切问题。
- 媒体查询同步收紧:860px 下侧边栏 padding、480px 下 workspace-header 高度(62→52,原先反而比桌面高)。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-08-29 | v1 | done | `fe/src/styles/global.css` 完成 Linear 风格密度调整；`pnpm --dir fe test` 91/91、`pnpm --dir fe build` 均通过 | 浏览器目视回归未执行 |
| 2026-08-29 | v1 | done | 复审:diff 严格限于侧栏/页面/表格密度、去卡片化、导航左指示条、按钮与 badge 收敛、空状态简化六项范围,无越界改动(无暗黑模式/Cmd+K/路由/API/依赖);`--octo-brand-soft` 定义与两处引用已核对;badge 变量引用与 `:root` 定义一致 | 本轮环境(rescue)禁止 pnpm 脚本与 `node --test`,测试/构建沿用上一轮 91/91 与 build 通过证据(此后代码零改动);浏览器目视回归需登录态 dev server,本环境无法安全启动,未执行 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 单测 | 通过 | `pnpm --dir fe test`(node --test)91/91 | 均为纯逻辑测试,不覆盖 CSS |
| 静态检查 | 通过 | CSS 花括号 707/707 平衡;引用的 32 个 `--octo-*` 变量全部在 `:root` 有定义 | 非完整 CSS 解析器校验 |
| 构建 | 通过 | `pnpm --dir fe build`；Vite 8.2.0，52 个模块，391ms | 仅生产构建，不含浏览器目视验收 |
| 运行时验证 | 未执行 | - | 未做浏览器目视检查 |

## 关联

- `docs/ai-dev/rules/system-boundaries-and-code-rules.md`
