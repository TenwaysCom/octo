---
title: "TEN-144：Lark Shadow Eval / Badcase 标注"
module: "ai-ticket"
status: done
requirement_version: 4
created_on: 2026-10-21
updated_on: 2026-10-21
closed_on: 2026-10-21
owner: TBD
related:
  - "https://linear.app/tenways/issue/TEN-144/lark-入口可以直接更新badcase更新原因"
  - "https://github.com/TenwaysCom/octo/issues/177"
---

# TEN-144：Lark Shadow Eval / Badcase 标注

## 目标与范围（v4）

在飞书 Ticket AI 页的 Shadow 分析区实现纳入 Eval、标记 Badcase、编辑标注及保存保障，与主站共用样本。v3 根据用户最新授权，扩展为部署测试环境、执行数据库迁移，并验收飞书入口与主站完整流程。原本地交付结果保留，部署/真实验收单独重新打开。

v3 的真实客户端操作已由用户回复“测试可用”确认。v4 根据用户追加的“整体更简洁、重点更清楚”优化评测操作区与两端共用编辑器：突出状态、合并重复操作，优先展示标签/原因，收起选填和分析详情，保持窄屏保存按钮可达。范围为现有 FE 交互与排版，不增加业务能力或接口。

用户已通过 grilling Q1–Q12 确认并明确“都按建议，确认实现”。v1 设计草案由 v2 替代，旧设计证据不作为实施完成依据。

## 已确认决策

- 只评价成功的 Shadow 分析，入口放在对应区域。暂无、失败、跳过或缺少有效快照版本时禁用；不评价 Wiki 某次回答或人工回复草稿。
- 每版 Shadow 输出独立冻结；重新分析产生新的评价对象，不覆盖或继承旧标记。历史 legacy 样本保留原身份，不推断为 Shadow。
- Lark / 主站共用样本及当前状态、标签、原因。任何有 platformLists 权限的登录用户可参与；My evals 表示曾参与，不是个人私有副本。
- 一键纳入 Eval 立即保存；Badcase 打开表单，填写后原子提交；打开、取消不写入。
- Shadow Badcase 要求至少一个既有失败标签和 1–4000 字非空失败说明；人工意图和期望结果选填。用户无需判断技术根因，两个入口一致。
- 编辑状态保留已填内容；原因只保存最新版，显示最近标注人和时间，不新增原因正文历史。
- 首次保存前输出/线程版本改变应拒绝并保留输入；重新查看后再提交，线程变化时须重新分析。已存历史样本可编辑标注，冻结输出不可改。
- 同次结果不明重试复用 actionRunId；已提交重试返回当前状态，不重复记录或覆盖后续保存。并发首次保存或过期表单必须明确冲突，不能虚报成功。

## 验收与实现

- [x] Lark 操作区支持一键纳入、直接 Badcase、编辑全部标注，展示状态/标注人/时间。
- [x] 主站共享编辑器及验证规则，显示冻结的 Shadow，支持选择历史评测版本；当前结果匹配自己的版本。
- [x] 样本身份包含来源及结果版本，同快照多次分析独立；旧数据不重新分类。
- [x] 首次保存锁定源、核对当前输出/线程及准入条件；样本与审核事务提交。
- [x] 全部 Eval API 校验 Web Session 和 platformLists，身份不可由输入指定；编辑必须携带 expectedUpdatedAt。
- [x] 幂等重试优先于版本冲突检查；过期表单拒绝；重读保留修改、合并未编辑字段并显示最新标注。
- [x] 单测、模拟数据库、隔离真实 PostgreSQL 事务/并发验证通过；FE check、Server build、路由检查通过。
- [x] 浏览器模拟交互 6 组复验通过，记录与真实客户端的边界。

代码：

- [Shadow Lark 操作区](../../../fe/src/components/lark-ticket/LarkShadowEvalControls.jsx)、[共用编辑器](../../../fe/src/components/lark-ticket/LarkTicketEvalEditor.jsx)、[主站工作面](../../../fe/src/components/lark-ticket/LarkTicketAiWorkspace.jsx)
- [业务服务](../../../server/src/application/services/lark-ticket-eval-dataset.service.ts)、[样本存储](../../../server/src/adapters/postgres/lark-ticket-eval-sample-store.ts)、[请求 DTO](../../../server/src/domain/lark-ticket-eval-sample.ts)、[输出版本](../../../server/src/domain/shadow-eval-version.ts)
- [API controller](../../../server/src/modules/lark-ticket/lark-ticket.controller.ts)、[迁移入口](../../../server/src/adapters/postgres/database.ts)

## 可执行验收场景

| 场景 | 操作与通过标准 | 本地证据 |
| --- | --- | --- |
| 纳入 Eval | 当前成功 Shadow 一键加入，刷新和主站读到同一样本 | API / 浏览器模拟 |
| 直接 Badcase | 打开/取消不写入，缺标签/空原因/超长拒绝；合法保存一次提交样本、标注、审核 | DTO、store、浏览器模拟、真实 PG |
| 编辑及状态切换 | 回填当前标注，改回 Eval 保留原因、标签和人工标准字段 | store、浏览器模拟 |
| 同线程重跑 | 新结果未标记，同线程快照建立独立新样本；旧结果冻结内容不变且可编辑 | 版本单测、真实 PG |
| 结果过期 | 打开后结果改变，首次提交拒绝；重读后预览更新，输入保留 | 服务单测、真实 PG、浏览器模拟 |
| 并发与跨入口 | 同版本同时保存只有一个成功，其他请求冲突；显式重读后可保存 | store、真实 PG、共享编辑器模拟 |
| 重试与回滚 | 已成功但响应丢失，重试同 ID；原请求重放不覆盖后续标注；审核失败样本也回滚 | 真实 PG、浏览器模拟 |
| 权限与归属 | 未登录 401，无页面权限 403，伪造身份拒绝；两人均保留 My evals 归属 | controller、store / 平台分页单测 |
| 来源/历史 | legacy 保留；冻结样本不混入当前 Shadow；主站选择历史版本 | 迁移集成、FE 单测 / 浏览器模拟 |
| Ticket 切换与窄屏 | 旧响应不污染新 Ticket；390px 面板标签、输入与按钮可达，原因按文本展示 | 浏览器模拟、SSR |

## 验证证据与边界

| 类型 | 结果 | 证据 / 命令 | 边界 |
| --- | --- | --- | --- |
| Server 静态检查 | 通过 | `pnpm --dir server build` | TypeScript 编译，不代表部署。 |
| Server 定向单测 / pg-mem | 132 项通过（57 项核心 + 75 项投影/Shadow 回归） | eval service/store/controller、Shadow projection/version、platform-data controller | 包含准入、身份、版本与参与过滤；pg-mem 不能证明真实锁/回滚。 |
| 路由注册 | 3 项通过，1 项未运行 | `pnpm --dir server test src/index.test.ts -t 'index routes'` | 有意只运行路由；入口 logger 测试不属于本任务。 |
| 隔离 PostgreSQL integration | 6 项通过 | [可复现测试](../../../server/src/adapters/postgres/lark-ticket-eval-sample-store.integration.test.ts)；显式 `OCTO_EVAL_TEST_POSTGRES_URI` | 独立本机 octo_eval_test 数据库，未连接应用库；覆盖迁移重复执行、竞争、源锁、审核失败回滚。 |
| FE 自动化 / 构建 | 48 个测试入口及生产构建通过 | `pnpm --dir fe check`；[标注逻辑测试](../../../fe/src/lib/lark-ticket-eval-save.test.js) | 包含 SSR、API、重试和来源隔离，不证明真实客户端。 |
| Chromium 模拟集成 | 6 组通过 | [浏览器脚本](../../../fe/manual-tests/lark-ticket-eval.browser.mjs) | 全部为合成资料及模拟 API；覆盖 Lark 保存、冲突、断网重试、过期输出、Ticket 响应隔离、主站回读/历史版本，包含 390px 目检。 |
| 文档 / 差异 | 通过 | 本记录、FE guide、Eval 契约与生命周期；13 个新增引用有效 | 保留同时发生的无关工作树变更；生命周期文档中既有 WeKnora 缺失引用未在本任务修复。 |
| v2 交付时的 Live E2E / 目标环境迁移 / 部署 | 当时未执行 | v3 部署和运行验收见下文 | v2 本地结果不作为部署证据。 |

隔离 PG 可复现命令：`OCTO_EVAL_TEST_POSTGRES_URI=postgresql://<test-user>@127.0.0.1:<test-port>/octo_eval_test pnpm --dir server test src/adapters/postgres/lark-ticket-eval-sample-store.integration.test.ts`。必须为一次性本机专用测试库；测试不会回退读取 POSTGRES_URI 或 DATABASE_URL。

浏览器复现：`pnpm --dir fe exec node manual-tests/lark-ticket-eval.browser.mjs`。复用 Extension 的 Playwright devDependency 和匹配的已安装 Chromium；必要时显式设置 OCTO_EVAL_BROWSER_EXECUTABLE。API 全 mock，不依赖真实用户数据。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-10-21 | v1 | done | 需求、代码核查及设计草案交付。 | 仅设计，后被 v2 取代。 |
| 2026-10-21 | v2 | in_progress | 用户确认 Q1–Q12 并授权实现；重新打开实施验收。 | 未部署。 |
| 2026-10-21 | v2 | in_progress | 实现版本身份、Shadow 冻结、共用编辑、权限与事务保护；单测、真实 PG 和主要浏览器场景通过。 | 浏览器检查发现嵌套 fieldset 的通用 label/input 样式影响窄屏，已修正并复验；主站版本选择最终复验中。 |
| 2026-10-21 | v2 | done | 本地实现与验收完成：132 项核心/回归、3 项路由、6 项真实 PG、48 个 FE 测试入口及 6 组浏览器 mock 场景通过；两端构建、文档链接与差异检查通过。 | 未执行目标库迁移、部署或真实 Lark 客户端验收。 |
| 2026-10-21 | v3 | in_progress | 用户授权测试部署与迁移；14:05（香港时间）发布 Server/FE，迁移后原 16 条样本、3 条审核内容指纹一致；仅重启 staging，其他 5 个进程未改变。 | 真实测试站浏览器验收进行中；真实飞书客户端免登待验证。 |
| 2026-10-21 | v3 | in_progress | 14:22 完成 10 组真实测试站验收；修复 1280px + 标签侧栏遮挡操作按钮，补发 FE；6 组本地浏览器 mock 回归通过。14:23 复核公开产物及健康、原 16/3 条数据内容指纹不变，QA 数据已清理。 | 仅剩真实飞书客户端入口/免登与实际操作待验，不将临时 QA Session 当作免登证据。 |
| 2026-10-21 | v3 | done | 用户回复“测试可用”，确认真实飞书入口操作可用。 | 用户反馈，不是独立采集的首次 H5 免登日志。 |
| 2026-10-21 | v4 | done | 用户要求 UI“整体更简洁、重点更清楚”；精简评测操作、突出标签/原因、折叠分析与选填标准、固定保存/错误提示。FE check 49 个入口及构建、6 组 mock 浏览器、10 组真实测试站回归均通过；15:28 核对最终公开产物一致。 | 本轮仅更新测试 FE；QA 数据已清理，无 Server 重启或数据库迁移。真实客户端旧版操作已由用户确认，本次 UI 用浏览器验证，未另采免登日志。 |

## 失败复盘

- pg-mem 的 DO NOTHING RETURNING 与真实 PostgreSQL 行为有差异；属于已有 [ERR-20260826-001](../../../.learnings/ERRORS.md#err-20260826-001-scheduled-sync-integration-verification)，不重复新增规则。本次增加隔离 PG 验证并发、重读及回滚。
- 浏览器测试使用已安装 Chromium 时，Playwright 默认查找的二进制版本不同；测试提供显式 executablePath，不新增依赖。相同 hash 导航不用于测试重置，脚本显式 reload。
- 窄屏表单继承旧 fieldset label 的 inline-flex 和 Lark input 全宽规则；修正为外层字段 grid、复选框独立宽度。此为本任务样式问题，留在任务内，不新增通用学习条目。
- 部署验收发现 1280px 主站标签侧栏遮挡新增 Eval 按钮；按列表容器实际宽度重排 AI 输出和 Eval 行，将操作区放在首行；只在列表容器启用 containment，避免影响外部固定弹窗。见 [ERR-20261021-002](../../../.learnings/ERRORS.md#err-20261021-002-ticket-eval-actions-covered-by-tag-sidebar)。自动化同时关闭视图配置浮层后再操作列表；合成资料补齐主站既有 AI 输出视图所要求的正式 AI 字段，不改变原过滤规则。

## 发布与兼容性

先构建 Server，再对确认目标库执行 `pnpm --dir server db:migrate`，协调部署 Server/FE；v3 已在下述测试环境执行。迁移增加 source/output_version 并替换样本唯一键，旧 ID 和标注保留。旧 Server 创建 SQL 不兼容新唯一索引，旧 FE 无 expectedUpdatedAt 的编辑被拒绝，发布时需统一版本并刷新页面。

回退不能直接恢复旧唯一键：同快照可能已有多个 Shadow 版本，需先制定保留这些数据的兼容策略。本任务不执行 db:reset、不自动降级或删除样本。

## 关联

- [当前 Eval 行为契约](../../ai-dev/2026-09-01-lark-ticket-ai-output-and-eval-dataset-prd.md#shadow-eval-版本与保存契约)
- [原 Eval 工作面任务](2026-09-01-lark-ticket-ai-output-eval-dataset-views.md)
- [Lark 应用接入说明](../../../fe/docs/lark-ticket-app.md)

## v3 测试环境部署与验收

用户明确要求“部署到测试环境，执行数据库迁移，再验收一下飞书入口和主站的完整流程”。目标：本机 PM2 `octo-server-staging`，cwd 为本仓库 server；NODE_ENV=staging，端口 3030，目标数据库 `tenways_octo_test_1021`，对外 origin 为 `https://octotest.odoo.tenways.it:18443`。只从配置读取非敏感摘要，不记录连接凭据。

- [x] 核实测试环境与备份；迁移保留原样本与审核记录。
- [x] 发布 Server/FE，仅重启 staging，验证其他进程未改变。
- [x] 对外健康、部署产物及真实数据库状态回读。
- [x] 真实部署上的纳入 Eval、Badcase、编辑、状态切换、主站回读及冲突/重试验收。
- [x] 真实飞书客户端入口打开/登录/操作验收：用户回复“测试可用”；这是用户操作反馈，未补采独立 H5 免登链路日志。

部署时服务器没有飞书 GUI 或已有浏览器会话，先以临时 QA 会话完成浏览器实测，再由用户从真实飞书客户端操作并回复“测试可用”。两类证据分别记录。

### 已部署事实

- 部署时间：2026-10-21 14:05（香港时间）。发布当前已构建工作树，无新增提交；`pnpm --dir server build` 和 `pnpm --dir fe build` 均通过。PM2 `octo-server-staging` 新 PID 3228977、online，其他 5 个进程的 PID / 启动时间不变，未重启生产。
- 迁移前已完成目标测试库的 `pg_dump` 备份（11,304,574 bytes），本机受限目录 `/tmp/ten144-staging-release-yscE24`，目录 700 / 文件 600。备份不是公开交付物，未读取或输出内容。
- 迁移成功新增 `source` / `output_version` 和输出唯一索引。原 16 条样本均为 legacy；原样本和 3 条审核的字段指纹与迁移前完全一致。未执行 reset 或自动降级。
- `http://127.0.0.1:3030/api/health` 与公开测试站健康接口均成功，`status=ok`；公开 index 及 18 个静态资源的 SHA-256 全部与本次本机构建一致。安全元数据记录为上述目录的 `before.json` / `after-migration.json` / `postflight.json`。
- 测试入口：[飞书分析页](https://octotest.odoo.tenways.it:18443/#lark-app-thread-analysis)、[主站 Ticket](https://octotest.odoo.tenways.it:18443/#lark-tickets)。已打开的旧页面需刷新。
- v3 验收中发现主站侧栏遮挡操作按钮，修复后再次构建并发布 FE；当时最终 `index.html` 指纹 `afcdff73cd714acedd3e64ac585ca246d864f3bbcac76c441f02164b48ad9a0b`，主样式资源 `index-b64WJ16e.css`。14:23 公开产物核对一致，Server 无需再次重启，迁移无需重复执行。该版后由下述 v4 UI 发布替代。

### 真实测试站验收边界

验收通过公开测试域名，使用实际部署 FE、Server 和测试库，不 mock API。测试资料为专用合成 Ticket/Shadow，包含主站 AI 输出视图既有准入要求的正式 AI 字段，两个 dev QA 用户及一个 viewer QA 用户；只为这些新 QA 用户建立临时 Web Session，未读取、导出或复用真实用户 cookie。结束时清理本次 QA 样本、审核、Ticket、用户及会话，不写外部飞书记录、不发送消息或调用模型。

v3 最终运行 `ten144-32f1cb7a-754d-425f-98ca-e402a29d1941` 于 14:22:23–14:22:32（香港时间）通过 10 组场景；安全结果已保留为本机 `/tmp/ten144-staging-release-yscE24/live-acceptance-v3.json`，`success=true`、`qaDataCleaned=true`。操作脚本为本次受保护的临时脚本 `/tmp/ten144-staging-live.mjs`，只允许上述 staging DB / origin；不是通用生产测试命令。

| 真实部署场景 | 实际结果 |
| --- | --- |
| 飞书页面打开并取消 Badcase | 正确加载所选合成 Ticket；取消后数据库无样本。 |
| 飞书直接 Badcase | 缺标签/原因提示不写入；合法提交后实际库中一个 Shadow 样本和一条审核，字段一致。 |
| 主站编辑及飞书回读 | 主站改回 Eval 并填人工意图；飞书刷新读到同一 ID 和修改，原原因保留。 |
| 双会话并发编辑 | B 更新后 A 旧表单收到 409；原因输入保留，显式重读后可保存。 |
| 成功请求重放与参与归属 | 原 actionRunId 重放返回成功但不覆盖后续原因，不增加审核；两位参与者均在 mine=true 中找到样本。 |
| 飞书一键纳入 Eval | 同线程快照的新 Shadow 成为独立 Eval 样本，未复用旧标记。 |
| 初次保存前结果更新 | 拒绝旧输出 409 且无误建；重读显示新结果并保留原因，随后提交成功。 |
| 主站历史版本 | 选择旧版并打开编辑器，显示冻结 v1，不混入当前 v4 内容。 |
| 主站新建及标记 Badcase | 1280px + 标签侧栏下直接点击 AI 输出行的加入 Eval，编辑为 Badcase；飞书刷新读到新样本及相同原因。 |
| 运行时权限与输入 | 匿名 401，viewer 读写 403，缺原因及伪造 reviewer 输入 400。 |

最终只读核对：原样本数 16、指纹 `610df1901b0e7a1f73c14aae21b3157f`；原审核数 3、指纹 `91ffe4aed858e41dd9939ffa1673de67`。与备份前完全相同，所有临时 QA 数据均已清理；其他 5 个 PM2 进程保持原 PID / 启动时间。

浏览器自动化验证两端页面业务、真实 API、权限与持久化；真实飞书客户端另由用户回复“测试可用”确认。未将 QA Session 当作 H5 免登证据，未独立采集首次免登链路日志。v3 按用户实际反馈验收完成。

## v4 UI 优化验收

- [x] 操作区按当前状态突出主操作，隐藏重复/已完成动作，保留读取与错误提示。
- [x] 共用表单以失败标签和原因为重点，人工标准与 AI 分析可展开，既有值保留。
- [x] 390px 下无横向溢出，原因输入全宽，弹窗按钮与错误提示常驻可达，键盘可展开和导航。
- [x] 保存、取消、状态切换、冲突重读、重试及历史版本浏览器回归通过。
- [x] 构建发布测试前端并核对公开产物；此次无需数据库迁移或 Server 重启。

v4 验证分别记录：

- FE 自动化 / 构建：`pnpm --dir fe check` 49 个测试入口及生产构建通过。此次 FE 包新增入口来自同时进行的字段编辑任务，不归入本次新增功能。
- 本地 mock 浏览器：既有 6 组场景复验通过，补验折叠标准展开输入、收起后保存、键盘 Enter/Tab/Shift+Tab、390px 原因区宽度、错误提示和保存按钮可达。脚本仍只用合成数据和 mock API。
- 目检截图：`/tmp/octo-eval-controls-mobile.png`、`/tmp/octo-eval-form-mobile.png`、`/tmp/octo-eval-form-desktop.png`，全部为本地合成资料；真实页面组件截图，不是设计图。清理旧 fieldset 的通用 flex 规则，避免原因标题/字数挤到输入框旁。
- 真实部署回归：运行 `ten144-4ba51295-2d81-426a-95a6-9d519bfd7068`，10 组场景全部通过，使用同样的专用 QA 会话/合成 Ticket 边界；`success=true`、`qaDataCleaned=true`，证据 `/tmp/ten144-staging-release-yscE24/live-acceptance-v4.json`。原 10 场景不再重复列举；脚本增加显式展开分析/人工标准的用户操作。
- 发布运行时：15:28 公开 index 及 18 个资源哈希与当前 FE 构建一致；index SHA-256 `454c90b12e455cd2e1596bf00e4ca308877ffbc9adaac39e5e61d55fabe7515d`，样式 `index-3zkSbIRC.css`。健康正常，Server PID 和其余 5 个 PM2 进程不变。证据 `/tmp/ten144-staging-release-yscE24/postflight-v4.json`。
