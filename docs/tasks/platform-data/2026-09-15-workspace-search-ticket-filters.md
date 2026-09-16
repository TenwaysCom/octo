---
title: "Workspace 全局搜索与 Ticket 搜索、人员筛选"
module: platform-data
status: done
requirement_version: 4
created_on: 2026-09-15
updated_on: 2026-09-15
closed_on: 2026-09-15
owner: Codex
---

# Workspace 全局搜索与 Ticket 搜索、人员筛选

## 目标

Ticket 列表增加常驻搜索框；WORKSPACE 上方增加跨 Lark Ticket、Meegle Workitem、GitHub PR 的全局搜索；Ticket 常用过滤菜单增加需求人、负责人和 Issue 类型。

## 验收标准

- [x] Ticket 支持标题包含匹配（忽略英文大小写）和编号查找，搜索与其他筛选共同作用于后端全量快照，先筛选再分页。
- [x] Ticket 当前页搜索按 v3 参考图放在标题/面包屑栏右侧，使用紧凑输入框、搜索图标和内嵌清除按钮；加载、空结果和失败时仍可操作；修改查询重置分页，返回列表保留查询。
- [x] 全局搜索采用较小弹窗（桌面最大 1040×560px，窄屏保留边距并限制高度），保留顶部搜索栏、类型切换、紧凑结果行和详情入口。
- [x] 类型切换为全部 / Lark Ticket / Meegle Workitem / GitHub PR，在后端分页前筛选；切换重置分页并隔离旧响应。
- [x] 全局搜索沿用 Web session 和 platformLists 权限，仅返回轻量投影，支持分页与空结果/失败反馈。
- [x] Ticket 过滤菜单支持需求人、负责人、Issue 类型多选；同字段 OR、跨字段 AND；选项覆盖已同步数据。
- [x] 完成 v4 FE 构建与浏览器尺寸检查，记录未运行的真实环境验证。

- [x] 修复搜索与筛选选项被通用身份中间件误拦截；覆盖 Web session 成功、未登录、无权限与相邻受保护路径。

## 背景与范围

现有列表每次读取最多 1000 条后端记录、每页显示 50 条；负责人和 Issue 类型已有标签侧栏筛选，常用过滤菜单尚未显示。纯前端搜索会漏掉未加载记录。

本次采用后端查询，FE 管理输入、300ms 防抖与结果展示。默认只搜索 Octo 已同步数据，不调用外部平台搜索，不引入搜索引擎/新依赖，不扩展拼音或错字匹配。用户已明确确认：仅搜索已同步数据，标题关键词＋编号即可。

## 方案与决策

- v4：用户要求全局搜索框小一些，将 v2 最大 1680×720px 改为 1040×560px，桌面距顶部 40px；窄屏保留 12px 水平边距并限制最大高度 560px。仅修改弹窗尺寸 CSS。
- v3：按用户当前页搜索参考图，将 Ticket 搜索放入现有 `breadcrumbActions`，移除正文中的大搜索栏和独立清除按钮。保持 v2 全局搜索与后端查询契约；不扩展参考图中的其他列表功能。
- v2：用户提供全局搜索参考图，采用大幅浅色面板、顶部紧凑输入栏、胶囊类型切换、无表头单行结果；类型沿用当前三类数据。参考图中的 Projects/Documents、时间和高级筛选控件不引入本次功能范围。v1 四列表头布局被替代。
- 搜索查询使用参数化 SQL，标题按字面包含匹配；编号支持直接输入以及 GitHub 的 `#` 前缀。
- 编号映射：Lark `ticketNumber`；GitHub `pullNumber`；Meegle `workItemKey`，缺失时用 `workItemId`，同时允许按 ID 查询。
- Ticket 打开现有 Octo 详情；Meegle 和 GitHub 沿用平台详情入口。
- 人员字段沿用已清洗的展示名，通过分隔后的完整名字筛选，避免短名字误匹配长名字。
- 保留现有工作树中的 `.gitignore` 修改和独立的历史清理任务。
- 当前使用 PostgreSQL 字面子串查询，不新增索引或迁移；真实数据规模下的延迟尚未测量。搜索和人员选项以清洗后的持久化字段为准，未自动回填历史记录。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-15 | v1 | in_progress | 完成现有分页、筛选、编号映射和导航核对；选择复用 PostgreSQL 快照查询 | 实现与验证 |
| 2026-09-15 | v1 | in_progress | 完成查询、权限、编号投影、全量筛选选项与 FE；pg-mem 原生 SQL 能力差异见 [ERR-20260915-001](../../../.learnings/ERRORS.md#err-20260915-001--pg-mem-缺少-postgresql-字符串查询能力) | 模拟器测试不代表真实 PG 性能 |
| 2026-09-15 | v1 | in_progress | 浏览器模拟验证发现搜索框先消费 Escape；在 dialog 捕获阶段关闭并阻止事件传到背后页面。修复搜索初始化不应重置恢复的页码 | 回归键盘及导航恢复 |
| 2026-09-15 | v1 | done | FE 检查、Server 构建、相关 56 个 Server 用例、浏览器模拟交互通过；同步搜索接口生命周期文档 | 未部署；未做真实平台/数据库性能验证 |
| 2026-09-15 | v2 | in_progress | 按用户参考图重新打开全局搜索 UI、类型筛选与相关验证项 | v1 UI 证据不作为 v2 完成依据 |
| 2026-09-15 | v2 | done | 顶部输入栏、类型胶囊按钮、40px 紧凑行和彩色状态图标完成；`kind` 后端筛选在分页前应用。FE 检查、Server 构建、9 个定向用例及浏览器 mock integration 通过 | 未部署，未执行真实平台验证 |
| 2026-09-15 | v3 | in_progress | 按当前页搜索参考图重新打开位置、尺寸、清除交互与 FE 验证项 | v2 当前页搜索截图不作为 v3 位置验收依据 |
| 2026-09-15 | v3 | done | Ticket 搜索复用标题栏右侧 actions，桌面 180×28px、窄屏 150×28px；内嵌清除按钮恢复输入焦点。FE check 和浏览器模拟验证通过 | 本次仅 FE UI；未部署、未做真实平台验证 |
| 2026-09-15 | v4 | done | 缩小全局搜索弹窗，FE 构建及桌面/窄屏尺寸检查通过 | 仅 CSS 修改，未部署 |

| 2026-09-15 | v4 | in_progress | 用户报告筛选选项失败；运行日志确认两个新增接口返回 401 / Missing master-user-id header，遗漏通用认证中间件精确路径豁免 | 补齐路径并验证中间件与控制器组合；原浏览器 mock 未覆盖真实中间件 |

| 2026-09-15 | v4 | done | 补齐两个新增 Web 接口的精确路径豁免；中间件与控制器组合测试确认有效会话成功、未登录 401、无权限 403，相邻路径仍受保护 | 本地构建完成；尚无修复后的真实登录请求日志，不宣称运行环境已生效 |

## 验证

### v4 认证缺陷回归

- 运行日志：2026-09-15 11:21–11:24，两条新增接口返回 `401 / UNAUTHORIZED / Missing master-user-id header`，请求在读取快照前被通用中间件拒绝。
- 修复前：新增中间件与控制器组合用例复现失败（3 处断言失败）；修复后：`pnpm --dir server test src/http/api-auth.test.ts src/modules/platform-data/platform-search.controller.test.ts src/index.test.ts` 共 23 个用例通过。入口子进程用例在沙箱内 stdout 为空，获准本地重跑通过。
- 静态构建：`pnpm --dir server build` 与 `git diff --check` 通过。
- 验证边界：组合测试使用真实中间件和控制器、模拟 session resolver 与查询服务；没有执行真实登录 HTTP / 数据库 / 已部署验证，未主动重启运行服务。
- 复用已有错误条目 [ERR-20260901-008](../../../.learnings/ERRORS.md#err-20260901-008--eval-list-was-intercepted-by-header-authentication)，避免重复记录。

### v4 UI 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 静态构建 | 通过 | `pnpm --dir fe build`、`git diff --check` | 仅 CSS 尺寸改动，不重复单测或 Server 检查 |
| 浏览器 mock integration | 通过 | `/tmp/octo-search-size-browser.cjs`；1440px 视口弹窗 1040×560px、390px 视口弹窗 366×560px，均无横向溢出 | 模拟 API；未部署或验证真实平台 |

### v3 历史基线验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 单测 / 静态构建 | 通过，41 个测试文件 | `pnpm --dir fe check`、`git diff --check` | 仅 FE 改动；后端查询未修改，未重复 Server 检查 |
| 浏览器 mock integration | 通过 | 临时脚本 `/tmp/octo-page-search-ui-browser.cjs`；1440px / 390px 布局、标题栏右对齐、内嵌清除及焦点、加载/空结果/错误状态、导航返回保留查询 | 临时 Chrome profile 与模拟 API；截图 `/tmp/octo-page-search-ui-desktop.png`、`/tmp/octo-page-search-ui-mobile.png` |
| Live E2E / 已部署运行时 | 未执行 | - | 未连接真实平台、未部署 |

### v2 历史基线验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 单测 / 静态构建 | 通过，41 个测试文件 | `pnpm --dir fe check`；最后 CSS 调整后再次 `pnpm --dir fe build`；`git diff --check` | 无真实平台 |
| Server 单测 / 内存数据库测试 | 通过，9 个用例 | `pnpm --dir server test src/adapters/postgres/platform-search-store.test.ts src/modules/platform-data/platform-search.controller.test.ts` | pg-mem；验证类型在 limit/offset 前筛选、DTO 校验、service 传递；不代替真实 PG 性能验证 |
| Server 静态构建 | 通过 | `pnpm --dir server build` | 未部署 |
| 浏览器 mock integration | 通过 | 临时脚本 `/tmp/octo-search-ui-browser.cjs`；1440px / 390px 截图；验证类型切换重置分页、加载更多携带 kind、旧类型响应隔离、错误/空结果恢复、Escape 与焦点恢复 | 独立临时 Chrome profile，所有 API 使用模拟数据；无真实登录或平台请求 |
| Live E2E / 已部署运行时 | 未执行 | - | 仅完成本地开发和模拟验证 |

### v1 历史基线验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 | 通过 | `pnpm --dir server build`、`pnpm --dir fe check`、`git diff --check` | FE check 含测试与 Vite 构建；不代表部署 |
| FE 单测 | 通过，41 个测试文件 | `pnpm --dir fe check`；新增 [查询 API 测试](../../../fe/src/services/platform-data/platform-search-api.test.js)、[结果跳转测试](../../../fe/src/lib/platform-search.test.js)、[组合筛选测试](../../../fe/src/lib/platform-list-filters.test.js) | node:test 无组件 DOM 执行 |
| Server 单测 / 内存数据库测试 | 通过，52 个用例 | `pnpm --dir server test src/adapters/postgres/platform-search-store.test.ts src/adapters/postgres/platform-sync-store.test.ts src/modules/platform-data/platform-search.controller.test.ts src/modules/platform-data/platform-data.controller.test.ts src/application/services/platform-data.service.test.ts` | pg-mem 注册 `strpos` 与文本正则模拟函数；无真实 PG 或平台请求 |
| 路由 / 入口测试 | 通过，4 个用例 | `pnpm --dir server test src/index.test.ts` | 沙箱初跑子进程 stdout 为空；获准在本地重跑通过，未修改该既有测试行为 |
| 浏览器 mock integration | 通过 | Playwright + 独立临时 Chrome profile，FE `127.0.0.1:5179`，所有 API 使用模拟数据；验证跨页选项、搜索/筛选请求、空值/错误恢复、三种结果字段/链接、加载更多、过期响应隔离、Escape/焦点恢复、返回列表保留搜索、1366px/390px 布局 | 不使用真实身份、平台请求或数据库；临时脚本 `/tmp/octo-workspace-search-browser.cjs` |
| Live E2E / 已部署运行时 | 未执行 | - | 未连接真实平台、未做真实数据库延迟测量、未部署 |

## 关联

- [Workspace 搜索与 Ticket 筛选契约](../../ai-dev/lifecycle/current-system-technical-objects.md#workspace-搜索与-ticket-筛选)
