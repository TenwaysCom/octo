---
title: "Ticket 字段编辑与 Lark 同步性能优化"
module: "platform-sync"
status: done
requirement_version: 3
created_on: 2026-10-21
updated_on: 2026-10-21
closed_on: 2026-10-21
owner: TBD
related:
  - "docs/tasks/platform-data/2026-09-11-lark-ticket-context-menu-actions.md"
  - "docs/tasks/platform-data/2026-09-11-lark-ticket-detail-field-editing.md"
  - "docs/tasks/platform-sync/2026-10-21-linear-github-sync-research.md"
---

# Ticket 字段编辑与 Lark 同步性能优化

## 目标

解释当前字段编辑的等待链路，核实 Linear GitHub 同步的公开机制，提出适配现有 Octo 的分阶段优化方案。v2 已授权实施第一阶段：立即回显、连续编辑、字段定义缓存及减少重复读取。保留同步 API 和写后读回，不引入持久队列或数据库变更，不执行部署。v1 的“仅调研”范围已被替代。v3 将同一属性编辑能力接入 `#lark-app-thread-analysis`，沿用权限与共享队列，不扩展服务端接口。

## 验收标准

- [x] 定位列表、详情的保存及回显链路，列出外部 API 调用。
- [x] 从已有日志提取安全耗时摘要，并说明样本和时效边界。
- [x] 区分 Linear 官方事实与对 Octo 的设计推论，提供原始来源。
- [x] 给出优先级、数据一致性要求及后续实施验收方式。

- [x] 列表及详情立即回显并允许连续修改，按完整 Ticket 标识保序。
- [x] 单字段失败回滚、同字段多次失败及旧完整响应均不覆盖后续修改。
- [x] 页面切换保留在途编辑，过期列表读取不能覆盖编辑；退出登录停止未发送任务。
- [x] 服务端缓存字段定义并隔离授权主体，已有本地快照跳过写前读取，保留写后同步清洗。
- [x] 完成针对性单测、FE 检查及 Server 构建，记录运行时验证边界。

- [x] Lark App 标题下六项属性可编辑；无 platformSync 权限时只读。
- [x] Lark App 连续修改立即回显，失败/部分成功及旧响应保护沿用共享队列。
- [x] 搜索切换 Ticket、跨页面及窄屏操作正常，不串记录；完成 FE check 与浏览器模拟集成。

## 背景与范围

用户反馈每次修改字段等待两秒多。列表和详情共用 `POST /api/web/lark-tickets/:recordId/fields`，该路由在 `server/src/modules/lark-ticket/lark-ticket.controller.ts` 注册。

当前范围是已有 Lark Base 字段的手工修改，不包含 AI 分析保存、创建 Meegle 工作项、全量同步或消息发送。

## 调研证据

### v1 实施前的保存链路

`server/src/application/services/lark-ticket-field-update.service.ts:updateLarkTicketField` 依次执行：

1. 读取用户授权，构造 Lark client；仅在过期条件满足时刷新 token。
2. `getRecord` 获取完整记录及字段名。
3. `getFields` 获取字段定义和类型，每次编辑均重新调用。
4. `updateRecord` 写入指定字段；`Finish` 同时写入关闭时间。
5. 调用 `PlatformSyncService.syncLarkBaseTicket`，再次解析授权，使用 `batchGetRecords` 拉取同一记录。
6. UPSERT 本地快照，再读本地快照并清洗、更新投影。
7. 返回响应后，FE 才更新列表或详情。

正常路径至少四次串行 Lark 数据 API 调用，不包含可选 token refresh、SDK 内部行为及首次打开选项菜单的独立请求。代码中没有发现固定两秒的等待逻辑。

`fe/src/components/lark-ticket/LarkTicketEditableProperties.jsx:save` 在 `await` 后调用 `onUpdated`，保存时所有属性按钮共用 `saving` 禁用状态。列表 `fe/src/pages/PlatformListPage.jsx:runTicketFieldAction` 同样等待成功响应才 patch 行，并按 ticket 防止重复提交。v1 时没有乐观回显。

值得注意：接口返回的 `ticket` 在重新同步前由旧记录与写入响应合成，并不是从最后一次同步后的数据库再读取；因此最后的远端读回主要保障本地快照完整性，不能简单描述成 UI 投影完全依赖读回结果。

### 已有耗时证据

只读扫描 `server/logs/api.*.log`，仅输出时间、状态和 durationMs，不输出请求正文、响应正文、用户标识或凭据。找到 2026-09-15 的三次对应 POST 完成记录：

| 请求样本 | HTTP 状态 | Server durationMs |
| --- | --- | --- |
| 1 | 200 | 3544 |
| 2 | 200 | 3481 |
| 3 | 200 | 4082 |

中位数 3544ms，范围 3481–4082ms。这是历史 Server 处理时间，不包含浏览器网络和渲染，也不能代表当前部署或当前 P95。HTTP 200 也不能独自证明远端与本地都一致。

现有日志不足以拆分每次外部调用的耗时；没有执行真实写入复现或修复实验。v1 按调研范围跳过诊断技能的写入复现、假设实验及回归修复阶段，不把调用链推论写成已测定的根因。

待验证假设按优先级为：① 多次串行外部往返占主要时间；② 写后重新拉取和清洗增加尾部等待；③ 详情全局禁用放大连续编辑的体感等待；④ token refresh 或网络尾延迟偶发放大请求。前三项存在代码结构证据，但各自耗时和贡献仍需阶段计时验证，不能归因于固定 Lark 写入延迟。

### Linear 的可借鉴部分

Linear 的 PR/commit 工作流关联与 GitHub Issues Sync 是不同能力。字段镜像应参考 Issues Sync；它支持标题、描述、状态、负责人等同步，并通过 issue 顶部 banner 单独显示同步状态和错误。[官方 GitHub 文档](https://linear.app/docs/github#configure-github-issues-sync)

Linear 官方工程文章明确其客户端维护本地数据库，创建 issue 或修改状态无需等待网络往返。这解释即时交互的架构基础，但不证明 GitHub 写入也是即时完成。[官方工程文章，2026-08-18](https://linear.app/now/rebuilding-delta-sync-read-path)

公开资料没有说明内置 GitHub Issues Sync 的 outbox、合并窗口、重试、防回环、冲突优先级或延迟 SLA。下述设计为 Octo 建议，不能声称是照搬 Linear 内部实现。更多来源与限制见[调研附录](2026-10-21-linear-github-sync-research.md)。

## 方案与决策

### 第一阶段：优先改善交互，并缩短现有同步请求

推荐先保持“Lark 确认写入后，才显示已同步”的成功语义。

- 选择后立即关闭菜单，按字段乐观回显并显示“保存中”，允许继续编辑其他字段。建议交互目标为 100ms 内回显；这是验收目标，尚未实测。失败只恢复对应版本的字段，不能回滚后续修改。列表、详情和导航缓存共享待保存覆盖层；切换 ticket 不串值。
- 保留同一 ticket 的请求顺序，在客户端排队；其他字段可以继续选择，不必继续锁住全部属性。旧响应不能覆盖新值；已有接口返回整条投影，实施时需要按版本合并，不能直接照旧展开整条响应覆盖。
- 字段定义在服务端短期缓存并合并并发读取。缓存覆盖原有权限范围，键需包含平台域名、租户/授权主体和 Base/Table，不能跨用户共享访问结论；建议从 5 分钟 TTL 起评估。每次写入仍校验用户权限，遇到明确字段定义失效时刷新元数据。
- 已有本地记录时用服务端快照及元数据定位字段，取消写前 `getRecord`；缺少本地数据时保留远端读取。FE 只提交语义字段和值，不承担平台映射。
- 第一轮可以继续保留写后一次完整读回，保障现有系统时间、人员等投影。元数据缓存命中且本地快照存在时，四次远端调用降为两次：`updateRecord → batchGetRecords`。这是结构目标，不是“延迟减半”的实测承诺。

随后评估把写入响应用于本地确认字段的原子增量更新，完整读回转为对账，使热路径进一步缩到一次远端写入。前置要求：稀疏响应、清空、人员显示、关闭时间和远端系统时间均有明确处理契约。不能简单把 `updated.fields` 当完整记录写进现有 UPSERT；该 UPSERT 会整体替换 `fields_json`，并将缺失 `updated_time` 写成空值。无法确认的系统时间不得用 `Date.now()` 冒充。

### v2 第一阶段实施结果

- FE 的 `lark-ticket-field-edits.js` 由 App 按登录用户及 API 地址持有，列表、详情和解决方案共用同一队列；完整 Base/Table/Record 标识隔离，单 Ticket 串行请求，不合并或跳过状态转换。属性选值后立即关闭菜单并回显，其他属性及同一属性可以继续选择；解决方案表单仍按原交互提交，但也进入同一队列。
- 按字段维护已确认值及在途修改。响应只确认本次字段（状态可附带关闭时间），其余完整投影字段不合并；失败回到最后已确认值，并继续叠加更新的在途值。Lark 已写、本地同步失败保留提交值并提示部分成功，不自动重写。
- App 同步维护导航缓存。读取响应按请求开始版本接受；平台列表请求的并发复用额外区分会话与编辑版本，防止新调用复用旧在途请求而绕过版本门禁。确认完成后的新读取可以接纳外部更新；部分成功在读到匹配值前保留覆盖层。退出登录丢弃尚未发送的修改；React StrictMode 的 effect 重放不会误销毁队列。
- Server 字段元数据缓存为进程内 5 分钟、最多 256 个键，以实际授权域名、masterUserId、Base/Table 隔离；并发加载共用 Promise，失败不缓存，字段缺失或写入失败失效，不自动重试写入。选项读取与字段写入共用缓存；每次仍先解析实际用户授权，远端写入继续校验平台权限。
- 已有本地 sourceFields 时跳过写前 getRecord；无快照则保留远端回退。保留写后 Batch Get、UPSERT 和清洗；复用已解析的 Lark client，完成后从同步后的本地 sourceFields 构造响应。热路径减少为两次远端数据调用，冷缓存/缺快照时仍增加相应读取；未承诺实测毫秒收益。
- 增加 auth、snapshot.read、record.read、metadata、write、sync 阶段的安全 elapsedMs 日志，以及总耗时和本地快照是否使用的信息，保留 actionRunId/layer/module/stage。
- 未新增依赖、数据库结构或后台持久任务；浏览器刷新前尚未发出的修改不具有持久化保证，真实 Lark 耗时需部署后复测。

### v3 Lark App 属性编辑

- `#lark-app-thread-analysis` 标题下属性栏接入同一 `LarkTicketEditableProperties`，显示状态、紧急度、需求人、负责人、类型、Business Line 六项；只依据现有 platformSync 权限显示编辑按钮，不改写入权限或 Server API。
- `LarkTicketAppPage` 使用 App 传入的共享队列与读取版本门禁；编辑立刻回显并关闭菜单，可以继续选择同一字段或其他字段。保存状态和错误只显示当前完整 Ticket 标识对应的记录。
- 搜索切换 Ticket、Lark App 与主站详情之间导航后，在途修改和失败回滚仍来自同一队列。属性变化不改变 AI 区域的组件 key，不重置同 Ticket 的回复草稿。
- 共享属性组件增加可选 className 与字段 title；Lark App 仅使用本页作用域样式把详情的双列网格改为紧凑行内布局，390px 窄屏换行。截图检查发现短状态被继承网格压成竖排后已修正，并补充短状态高度回归断言。
- v3 只修改 FE 接线、样式、模拟验收和文档；Server 无新增变更，未重复运行 Server 测试；v2 Server 证据仅作为既有公共契约的历史验证。

### 第二阶段：需要可靠的后台同步时，再引入持久任务（未实施）

若目标是“用户完成 Octo 保存后，即使刷新页面或 Server 重启也不丢待同步修改”，仅有乐观 UI 和进程内异步函数不足以保证。建议链路为：

```text
选择字段 → 立即回显“保存中”
              ↓
Server 事务保存修改意图 + outbox → 返回“Octo 已保存，待同步 Lark”
              ↓
Worker 限流/保序写 Lark → 更新确认快照和任务状态 → FE 显示“已同步”
```

这会改变现有接口的确认时机，应作为独立实施范围评审：

- 待同步值与 Lark 已确认事实分开存放，不能先覆盖外部快照并伪装已同步。现有 FE API 强制检查 `larkBaseUpdated === true`，异步接受应调整契约，不能继续提前返回该标记。
- 事务保证修改意图与任务同时落库；`actionRunId` 幂等，任务绑定实际操作人及其服务端授权。重试复用稳定的目标值，包括首次确定的关闭时间。
- 可合并同一 ticket 尚未发送的普通字段更新，例如 200–500ms 内负责人和紧急度组合成一次 `fields` 写入。状态转换可能触发 Lark 自动化或审计，未经业务确认不得合并跳过中间状态；已经发送的任务也不能随意改内容。
- 按记录维护版本顺序，并控制表/Base 级外部写入并发；Lark 官方概览建议同一个 Base 同时只进行一次 API 编辑，具体当前 API 限额需实施时核对。[Lark Base 官方概览](https://open.larksuite.com/document/server-docs/docs/bitable-v1/notification)
- 区分已拒绝、可重试失败、需重新授权和结果未知。超时不能直接当成未写入；先读取核实，仅对仍有效的版本执行恢复，不能让旧重试覆盖新值。
- 后台拉取只能更新已确认快照，不能抹掉较新的 pending 覆盖层。当前 UPSERT 没有远端版本新旧条件，需要补充顺序保护。
- Lark 直接编辑和 Octo 待同步编辑撞到同一字段时，建议先标冲突并保留双方值；跨系统缺乏原子条件写保证时，读前比较也不能宣称完全消除竞态。冲突优先级需实施前明确。
- 优先复用现有 PostgreSQL 和 Worker 的工程模式；`message_outbox` 是消息发送契约，不能直接当成 Ticket 字段任务使用。此建议不自动授权新增基础设施。

Lark → Octo 的事件驱动刷新可作为后续补充。官方 SDK 有多维表记录和字段变更事件接口，但本仓库未检出对应订阅处理；需要另行核对当前 Lark 应用权限、文件订阅和事件内容，不能假设开一个回调即可可靠双向同步。[Lark 官方 Go SDK 事件接口](https://pkg.go.dev/github.com/larksuite/oapi-sdk-go/v3/event/dispatcher#EventDispatcher.OnP2FileBitableRecordChangedV1) 即使增加事件，也要保留周期对账、去重和防回环；接收外部变更只更新快照，不自动再向 Lark 发相同写入。

### 后续实施验收

分别记录选值到回显、Server 保存确认、Lark 确认、本地完整对账四个指标；第一阶段只有后两个成功后才沿用现有完成提示。阶段日志使用 actionRunId、layer/module/stage/errorCode、elapsedMs、缓存命中及请求次数等安全摘要，不记录字段正文或凭据。

重点场景：连续修改不同字段、同字段 A→B→C、旧响应迟到、字段清空、人员变更、Finish 关闭时间、Lark 已写但本地失败、超时结果未知、授权过期、后台同步同时运行。第二阶段另验刷新与进程重启恢复、重复投递、限流、冲突、跨用户编辑。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-10-21 | v3 | done | Lark App 六属性编辑、权限只读、共享队列与读取门禁接入完成；FE check 49 个测试文件及构建通过，浏览器六组 PASS，窄屏截图检查通过 | 未部署、无真实 Lark 写入；不改 Server 或持久任务 |
| 2026-10-21 | v2 | done | 第一阶段实现完成，针对性单测、FE check、Server build、真实页面模拟集成通过；入口测试沙箱外复跑通过 | 尚未部署、未测真实 Lark 写入耗时；无持久任务 |
| 2026-10-21 | v1 | done | 完成代码调用链审查、历史日志安全聚合和 Linear 官方资料核对，形成两阶段优化建议 | 调研完成；无产品代码修改，实际性能收益及保存语义变更需要后续实施验证 |

## 验收场景与实际结果

本地浏览器使用合成 Ticket 和可控制延迟/失败的模拟 API，未使用真实授权；v3 扩展原模拟脚本并重跑以下场景：

| 操作 | 预期 | 实际验证 |
| --- | --- | --- |
| 连续选择状态、紧急度、再改状态，暂不返回首个请求 | 菜单立即关闭，三项按顺序排队，界面保持最后选择，其他字段可编辑 | 浏览器模拟集成通过 |
| 让旧响应返回整条旧投影 | 旧优先级/负责人不覆盖后续乐观值 | FE 单测及浏览器模拟集成通过 |
| 切换到下一条，在上一条保存失败后返回 | 只恢复失败字段，保留已成功字段，不影响当前其他 Ticket | 浏览器模拟集成通过 |
| 同一字段连续两次修改均失败 | 恢复最初已确认值，不恢复第一次失败的乐观值 | FE 单测及浏览器模拟集成通过 |
| Lark 已写但 Octo 同步失败 | 保留新值、显示带 Ticket 标识的部分成功提示 | FE 单测及浏览器模拟集成通过 |
| 队列待发送时退出登录 | 未发出的请求取消，不沿用后续会话 | FE 单测通过 |
| Lark App 六属性、搜索切换与主站详情导航 | 390px 窄屏可操作，编辑立即回显、失败不串记录、回复草稿保留，主站详情共享在途值和回滚 | v3 浏览器模拟集成通过 |
| Lark App 无 platformSync 权限 | 六项属性只读，不显示修改按钮或发出写请求 | v3 浏览器模拟集成通过 |
| 同一用户打开选项后连续写两个字段 | 只加载一次元数据，有本地快照时不执行写前 getRecord，两个写后同步仍执行 | Server mock service 单测通过 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 本次提交隔离验证 | 通过 | 从 Git index 导出临时副本：FE check 48 个测试文件及构建，Server 四个相关文件 59 项及构建，浏览器九组 PASS | 仅本次暂存内容；不含并行 Eval 改动，无真实平台写入或部署 |
| 代码静态审查 | 完成 | 字段服务、PlatformSyncService、Postgres store、FE 列表/详情、路由注册 | 不代表当前部署代码 |
| 历史日志只读分析 | 完成 | 三次 POST，3481/3544/4082ms | 2026-09-15 样本，不是本日测量，无逐阶段耗时 |
| 官方资料核对 | 完成 | 正文及 Linear 附录原始链接 | 不推定未公开内部实现 |
| 差异及文档检查 | 完成 | `git diff --check`；同步 lifecycle、FE guide 和任务索引 | 保留工作区其他任务改动 |
| Server 单测 / service mock / controller（v2） | 通过 | 四个相关文件共 71 项：字段服务 24、缓存 2、平台同步 27、字段动作 controller 18 | 无真实平台调用 |
| 路由与入口测试（v2） | 通过（沙箱外复跑） | `pnpm --dir server test src/index.test.ts`，4 项通过 | 初次沙箱内 `.env` 子进程 stdout 为空导致 1 项失败；沙箱外完整重跑通过，未修改该测试 |
| Server 静态构建（v2） | 通过 | `pnpm --dir server build` | 不代表部署运行 |
| FE 单测与构建（v3 重跑） | 通过 | `pnpm --dir fe check`，49 个测试文件及 Vite 构建通过 | 包含队列及读取版本隔离回归；没有真实平台写入 |
| 浏览器模拟集成 | 通过 | `node fe/manual-tests/lark-ticket-field-edits.browser.mjs`，本机 Vite + 已安装 Chromium，输出六组 PASS（v3 扩展 Lark App 权限、搜索切换、跨页回滚与窄屏断言） | 沙箱无法监听 localhost，使用沙箱外运行；Playwright 默认浏览器版本不在本机，用 `OCTO_FIELD_BROWSER_EXECUTABLE` 指向已有 Chromium；无新增依赖 |
| live E2E / 已部署运行时验证 | 未运行 | - | 未执行真实 Lark 写入、部署或性能复测 |

## 复盘

- 旧读取的开始时间必须对应实际请求，不能把“复用旧在途请求的新调用”当成保存后的新读。已通过请求复用键隔离和回归测试覆盖。
- React StrictMode 会重放 effect 清理；共享队列的所有者释放需允许同一轮重新挂载，不能第一次 cleanup 就永久失效。已有回归覆盖，不另增重复学习规则。
- 本次验证中的环境问题只影响测试启动：localhost 监听需沙箱外执行，已安装 Chromium 与 Playwright 默认版本不同，入口子进程测试需沙箱外复跑；未据此修改产品逻辑或无关测试。

## 关联

- [原字段编辑任务](../platform-data/2026-09-11-lark-ticket-context-menu-actions.md)
- [原详情编辑任务](../platform-data/2026-09-11-lark-ticket-detail-field-editing.md)
- [Linear 官方资料调研附录](2026-10-21-linear-github-sync-research.md)
