---
title: "Lark Ticket AI 输出与 Eval 数据集视图"
module: "ai-ticket"
status: done
requirement_version: 5
created_on: 2026-09-01
updated_on: 2026-09-21
closed_on: 2026-09-21
owner: TBD
related:
  - "../../ai-dev/2026-09-01-lark-ticket-ai-output-and-eval-dataset-prd.md"
---

# Lark Ticket AI 输出与 Eval 数据集视图

## 目标（v5，2026-09-21）

按用户确认的简洁 UI 实现 Eval 状态、人工保存归属和 My evals。右侧统一为两行：首行 Thread、messages、加入 Eval、编辑 Eval 四个图标；第二行只读状态、最近标注人及简短时间，长姓名省略并可查看完整信息。

## 验收标准（v5）

- [x] 两页右侧首行统一四个图标，第二行显示状态、人、时间；标题前不重复状态，不增加独立列。
- [x] 四个图标均提供 tooltip 和无障碍名称；已有样本禁用加入、无样本禁用编辑，创建中禁用重复加入；编辑复用现有弹窗。
- [x] Draft 和 Eval 标注选填；Bad case 至少选择一个失败标签，人工意图和期望结果选填；前后端一致。
- [x] 人工成功保存任意状态均记录 Web Session 操作人及服务端时间；失败保存、取消编辑不产生审核记录。
- [x] 最近 Eval 人/时间常驻第二行，时间显示月日时分，完整时间与姓名可悬浮查看；历史缺失显示未记录，不猜测补齐。
- [x] My evals 在既有快捷过滤区，按本人曾成功保存过的样本匹配；他人后续编辑不移除本人参与归属。
- [x] 过滤在服务端分页前执行，重复审核不重复计 Ticket；每个 Ticket 默认展示最高快照版本，My evals 展示本人参与过的最高快照版本。
- [x] 样本更新与审核记录原子保存；同一样本、操作人、actionRunId 重试不重复记录或覆盖后来保存；客户端不能伪造审核身份。
- [x] 兼容历史样本，必要单测及两端构建通过，明确迁移/部署/真实验证边界。

## 方案与决策

- v5 替代 v4 的标题前标签、文字/菜单操作和人/时间按需查看方案；仅调整 FE 展示，数据与审核语义沿用 v4。
- “未标记”表示尚无样本，数据库状态仍为 draft / badcase / eval。直接加入后可通过编辑器保存为 Draft；加入与编辑图标固定位置，按样本是否存在启用。
- 保存归属保留审核记录供 My evals 使用，列表只显示最近一次人/时间；不增加历史查看 UI、统计看板或导出。
- 当前快照样本已存在时，重复加入返回原样本，避免改变他人的状态；明确编辑保存才新增审核。
- Bad case 按讨论中的失败标签必填方案执行，不把所有问题都强制归为人工意图或期望结果。
- 旧样本不虚构审核人/时间；首次新保存开始记录。历史参与按样本绑定，同 Ticket 多快照在列表中取最高匹配版本，分页与总数按 Ticket 去重。
- AI 输出页保留既有 AI 输出范围，My evals 与页面现有筛选取交集。
- 主要 owner 为 Server：身份、校验、持久化和过滤；FE 仅负责交互和展示。沿用已有 Web Session API，不新增外部平台写入。

## 实施及验证计划

1. 增量建审核记录表，样本保存与审核记录事务提交，服务端绑定身份和时间。
2. 扩展现有 Ticket 快捷过滤与 Eval 列表查询；选择样本不再受 Map 覆盖顺序影响。
3. 复用标签、编辑器；右侧首行四个操作图标，第二行展示 Eval 人/时间。
4. 验证 Draft/Eval 空标注、Bad case 失败标签、用户归属、防伪造、幂等、多快照、分页前过滤；运行相关单测和构建。
5. 同步技术对象说明和任务结果。未执行目标环境迁移或部署时明确报告。

## 验证（v4）

| 类型 | 结果 | 边界 |
| --- | --- | --- |
| 现状及需求 review | 已完成 | 最新实现以 v4 验收为准；v1 历史结果不能证明本版完成 |
| Server 定向单测 / 模拟数据库集成 | 通过：5 文件、46 tests | Eval service/controller、Platform Data controller、样本 store 和平台 store；pg-mem 验证多人归属、Draft、重试、历史空值及分页去重，不证明真实 PostgreSQL 并发/回滚 |
| FE 自动化 | `pnpm --dir fe check` 通过：43 个测试入口，生产构建通过 | 覆盖状态标签映射、最高匹配快照、前端校验和 My evals 请求；未进行浏览器人工验收 |
| Server 静态构建 | `pnpm --dir server build` 通过 | TypeScript 编译，不代表已部署 |
| 路由与入口回归 | 路由断言 3 项通过；入口日志断言 1 项失败 | `src/index.test.ts` 的 `ENTRY_LOG_LEVEL=debug` 输出为空；在隔离目录以未修改 HEAD 重跑同一测试同样失败，未改本任务外入口行为 |
| 文档检查 | `git diff --check`、本任务相对链接检查通过 | 已同步行为契约、技术对象与任务索引 |
| 数据库迁移 / Live E2E / 部署 | 未执行 | 不以本地自动化代替运行时证据 |

## 交付与验收说明

开发已完成，尚未执行目标数据库迁移、服务重启或部署。新增 `lark_ticket_eval_reviews` 表，发布前需先构建 Server，再对确认的目标数据库执行 `pnpm --dir server db:migrate`，随后部署/重启 Server 并发布 FE；不执行 db:reset。旧数据不补造审核记录；回退应用不需要删除新增审核表。

建议登录态验收（未执行）：

| 前置 / 操作 | 预期 |
| --- | --- |
| 完整线程快照且未建样本，AI 输出行点击“加入 Eval” | 右侧第二行“未标记”变为“纳入 Eval”，加入图标禁用、编辑图标启用；无需填写标注 |
| 编辑样本，不填人工意图和期望结果，保存 Draft | 保存成功，悬浮信息/编辑器显示本人和保存时间，My evals 能找到 |
| 标记 Bad case，未选择失败标签再保存 | 提示至少一个失败标签；选择后保存成功 |
| A 保存后 B 编辑同一样本 | 最近 Eval 人为 B；A、B 的 My evals 均可找到 |
| 同 Ticket 多快照、多次审核并翻页 | 每页按 Ticket 去重，My evals 显示本人参与过的最高版本；总数不因审核次数膨胀 |
| 打开编辑器后取消；查看旧的无审核记录样本 | 不新增审核记录；旧人/时间显示未记录 |

实现检查中遇到 pg-mem 不支持相关子查询，已改用等价的非相关 IN / 去重 JOIN 并通过集成测试。已有 LEARNINGS 无需新增重复规则；可复用错误签名记录到 ERRORS。原有 Excel 导出任务文件未修改。

## 关联

- [原需求文档](../../ai-dev/2026-09-01-lark-ticket-ai-output-and-eval-dataset-prd.md)
- [后续 AI 输出与 Eval 展示调整](2026-09-06-shadow-ai-fe-details.md)
- [FE 工作面](../../../fe/src/components/lark-ticket/LarkTicketAiWorkspace.jsx)
- [样本服务](../../../server/src/application/services/lark-ticket-eval-dataset.service.ts)
- [存储](../../../server/src/adapters/postgres/lark-ticket-eval-sample-store.ts)

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-21 | v2 | planned | 按本次讨论重新打开任务，完成现状核对与需求 review；应用代码未改动。 | 待用户 review 归属、Bad case 必填及入口/多快照口径后实施。 |
| 2026-09-21 | v3 | planned | 按用户要求收敛 UI：单个紧凑标签显示四种文案，复用布局、编辑和筛选入口；人/时间按需查看，保留持久化要求。v2 常驻展示方案已替代，相关验收保持未完成。 | 本轮仅更新任务文档；数据语义待确认项保留，尚未实施。 |

| 2026-09-21 | v4 | in_progress | 用户确认标题前只读标签与既有操作区入口，并授权实施；已收敛任务。 | 待实现与验证。 |

| 2026-09-21 | v4 | done | 标题前紧凑只读标签、直接加入/既有编辑、审核记录与 My evals 已实现；定向 46 tests、FE check、Server build 通过，行为文档同步。 | 入口日志断言基线同样失败；真实数据库迁移、浏览器验收与部署未执行。 |

### v1 历史进展（不作为 v2 完成依据）

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-09-01 | done | 新增 AI 输出 / Eval 数据集工作面、PostgreSQL `lark_ticket_eval_samples`、Web Session API 和标注编辑器；样本冻结 Ticket AI 输出及完整线程快照版本。 | 未做真实 Lark/ACP 或实际 CSV 导出；本机服务端全量测试另有超时与 logger 文件测试失败，未在本任务内排查。 |
| 2026-09-01 | done | AI 输出扩展为四阶段流水线；回答和文档未持久化时显式显示未生成，继续处理复用详情页 AI Session。 | 实际的回答/文档 Session 结果仍需由后续 Skill 写入新增的本地 AI 字段。 |
| 2026-09-01 | done | AI 输出与 Eval 数据集改为 Lark Ticket 视图配置中的独立选项，和普通列表/看板共用服务端筛选、标签筛选、排序和分组；修复 Eval 列表被通用 Header 鉴权拦截的问题，改为使用既有 Web Session。 | 尚未执行 PostgreSQL `db:migrate`，因此运行中环境未必已有样本表。 |
| 2026-09-01 | done | AI 输出与 Eval 数据集接入既有 Lark 主分组及二级分组折叠状态；主组、子组均可独立收起，并在这两个视图间保留状态。 | 仅支持已有视图配置定义的两级分组。 |
| 2026-09-01 | done | 视图配置会随 AI 输出 / Eval 数据集模式切换对应显示字段，并实时控制字段显隐；排序仍在分组前按稳定的 Ticket 基础字段执行。 | 当前未按 AI 阶段内容或人工 Eval 标注排序，避免对未定义的文本和标签语义作隐式排序。 |
| 2026-09-01 | done | 两个工作面均展示当前同步的 Ticket 描述；完整线程快照的 Ticket 即可加入 Eval，AI 输出可为空以支持先建设数据集、后运行评测。 | 无线程快照或快照不完整时仍拒绝创建，页面会显示具体原因。 |
| 2026-09-01 | done | Ticket 行显示 AI 已输出 / AI 未输出标记；Lark Ticket 快速筛选支持这两个条件，并在服务端过滤以保证分页和总数正确。 | 标记仅代表本地 allow-listed `ticket_ai` 是否有字段，不代表四阶段都已完成。 |
| 2026-09-01 | done | 修复 Eval 编辑保存路径遗漏 Web Session 鉴权豁免，`PUT /api/web/lark-ticket-eval-samples/:id` 不再要求浏览器提供 `master-user-id`。 | 运行中的 Server 需加载最新代码后验证真实保存。 |
| 2026-09-01 | done | AI 输出和 Eval 行增加 Lark Thread 跳转与只读 prepared messages 聊天框；AI 输出视图在服务端只加载有本地 `ticket_ai` 的 Ticket。 | prepared messages 仅显示已准备的脱敏快照；无快照时明确提示。AI Actions 仍从详情页启动既有 Session。 |
| 2026-09-01 | done | Prepared messages 聊天框显示稳定匿名参与者标签（用户 1、用户 2、客服机器人、系统）和消息时间；不暴露原始发送者 ID。 | 缺少发送者 ID 的历史消息只能显示通用角色；旧 prepared 缓存会按新的脱敏版本从已存线程记录重建。 |
| 2026-09-02 | in progress | 问题总结 prompt 已改为“受控 fetch → 单次分析 JSON → analysis-update”，并修复旧默认 prompt 的数据库迁移、ACP 本地化审批文本解析及 Kimi 延迟 rawInput 关联；聚焦测试 22/22、Server build 通过。 | 真实 ACP 在 Bash 审批时仍不提供命令参数，只在拒绝之后才补发；严格白名单无法安全批准，因此 3 条 Ticket 的真实取证/写回与 FE 读回尚未完成。 |
| 2026-09-02 | in progress | ACP 客户端新增标准 `terminal/*` 与 `fs/*` 能力，命令、参数和路径统一进入服务端能力策略；19 个相关聚焦测试及 TypeScript 检查通过。 | 本机 Kimi 0.39.1 仍绕过 terminal 并发出无命令载荷的 Bash 审批；官方 1.49.0 隔离运行需要重新登录，登录完成后才能继续 3 条 Ticket 的真实写回与 FE 读回。 |
| 2026-09-02 | done | 保留 Quick Action 原有自然语言交互，新增一个通用结构化 `execute` MCP：仅执行 manifest 声明的 root/script/subcommand；ACP read 可读 Support workspace 与 Octo Server，write 仅可写 Support workspace，通用 Bash/terminal 默认拒绝。 | 当前 manifest 只声明 Support-QA 脚本的 `fetch`、`update`、`analysis-update`；新增脚本必须显式登记并补参数策略。 |
| 2026-09-02 | done | 真实 Ticket 2070、2007、2111 均完成签名 `analysis-update`，规范化分析表和 FE `ticket_ai` 投影均已写入；登录态 AI 输出视图显示三条为“AI 已输出”并展示意图/问题总结，2070 的“加入 Eval”创建成功，Eval 视图显示冻结快照、AI 意图与人工标注字段，无 `UNAUTHORIZED`。 | 未向 Lark Thread 发送消息；验证仅覆盖本地 Server、PostgreSQL 和登录态本地 FE。 |
| 2026-09-02 | done | 按当前产品决策临时对三个 Support-QA Ticket action 放行无命令载荷的 Bash 审批，并标记 `v4-temporary-support-qa-bash`；同时将证据/写回门禁失败的 Session、actionRunId、错误码与模型正文保存为未验证草稿。FE 显示未验证状态、禁止直接发送并可重新执行，正式分析三表与 `ticket_ai` 不受污染。 | Bash 临时放行只能做到 action 级约束，不是真实目录沙箱；应在 Kimi 能稳定使用结构化 execute 后移除。未执行新的真实 Kimi/Lark 调用。 |
| 2026-09-02 | done | 修复 ACP prompt 在 `session.created` 后中断时的 Ticket 关联竞态：收到创建事件即开始写入 Ticket 与 thread 归属，不再等待 prompt 完成。已将实际孤立 Session `session_f38d…` 精确恢复到 Ticket 2106，并标记为 `AI_SESSION_INTERRUPTED`。 | 历史恢复仅处理已确认的一条记录；没有批量推断或修改其他无关联 Session。 |
| 2026-09-04 | in progress | 确认 Eval 编辑器在标记 Badcase 时只展示 `INVALID_REQUEST`；接口实际拒绝原因是缺失人工标准意图或期望结果。开始补充前端字段级中文提示，保留服务端 DTO 校验。 | 待运行 FE 自动化测试和生产构建。 |
| 2026-09-04 | done | Eval 编辑器会在提交前提示缺失的人工标准意图、期望结果或 Badcase 失败标签；服务端仍拒绝时也显示中文校验说明，不再暴露原始 `INVALID_REQUEST`。 | 未执行浏览器登录态人工验证；改动不影响服务端接口或数据库。 |

## v1 历史验证（不作为 v2 完成依据）

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 聚焦测试 | 通过 | Eval service、Ticket controller、route catalog：3 files / 7 tests | 覆盖完整快照、拒绝不完整快照和路由注册。 |
| FE 全量测试 | 通过 | `pnpm --dir fe test`：132 tests | 覆盖新 Eval API client 与既有 FE 行为。 |
| 构建 | 通过 | `pnpm --dir server build`、`pnpm --dir fe build` | 静态编译和生产构建，不代表登录态 UI 或真实平台调用。 |
| Server 全量测试 | 非本功能失败 | `pnpm --dir server test` 发现既有 pg-mem/ACP 测试超时及 logger 文件断言失败 | 新增 Eval service 聚焦测试通过；未调用外部服务。 |
| AI 流水线定向测试 | 通过 | pipeline、Ticket AI section、AI field allow-list：5 tests；两端 build 通过 | 覆盖旧字段兼容映射和未生成空态，不代表真实 AI Session 已回写新字段。 |
| Eval Web Session 鉴权回归 | 通过 | `api-auth`、Ticket controller、route catalog：13 tests；两端 build 通过 | 验证新列表接口不再需要浏览器提供 `master-user-id`，实际登录态页面仍待本地服务重启后人工刷新确认。 |
| 问题总结真实 ACP 验证 | 未通过（安全拒绝） | 有完整会话快照的 Ticket 2070 多次进入 Kimi ACP；服务端正确拒绝没有命令参数的 Bash 审批并返回 `SUPPORT_QA_EVIDENCE_NOT_FETCHED`。 | 不接受无精确命令证据的 Bash 调用；需要 Kimi ACP 修复权限请求载荷，或重新确认由服务端受控执行器替代模型 Shell。 |
| 受控 execute 与真实写回 | 通过 | Ticket 2070、2007、2111 的 signed internal API 均返回 200；三条均持久化 snapshot v2、intent、result、quality 和 `ticket_ai` 投影。 | Kimi 偶尔尝试读取不存在的层级 `AGENTS.md`，会得到只读失败但不影响受控主链路。 |
| 登录态 FE 回读 | 通过 | AI 输出视图三条均显示“AI 已输出”、意图与问题总结；2070 加入 Eval 后显示“继续标注”，Eval 数据集显示草稿、AI 意图、人工意图、期望结果和失败标签。 | Chrome 本地页面观察；未做生产部署验证。 |
| 最终全量回归 | 通过 | `pnpm --dir server test`：142 files / 657 tests；`pnpm --dir fe test`：135 tests；Server 与 FE production build 均通过。 | 本地静态、自动化与登录态验证；未部署生产。 |
| Bash 临时权限与失败草稿 | 通过 | Server 全量 142 files / 658 tests；FE 135 tests；Server/FE build；`server db:migrate`。 | 本地权限决策、持久化和静态 UI 回归；真实 Quick Action 需用户从登录态 FE 重试确认。 |
| Session 中断关联回归 | 通过 | Ticket AI Session service 8 tests；Server TypeScript build；PostgreSQL 精确更新 `UPDATE 1` 并回读 Ticket 2106、thread、actionRun 与失败状态。 | 自动化覆盖 prompt 抛错；进程被强制终止时无法执行结束状态回写，但 Ticket 关联在创建事件阶段即开始持久化。 |
| Eval 编辑校验提示 | 通过 | `pnpm --dir fe test`、`pnpm --dir fe build` | 覆盖前端字段校验和服务端 `INVALID_REQUEST` 中文兜底；未执行登录态人工操作。 |

### v5 布局进展

- 2026-09-21：两页共用四图标操作区；第二行显示状态、最近标注人、月日时分，长姓名省略、悬浮显示完整信息；移除旧菜单和标题前重复状态。数据保存语义未改变。
- 静态验证：`pnpm --dir fe check` 通过（43 个测试入口及 Vite 生产构建）；`git diff --check` 通过。
- 验证边界：未执行登录态浏览器视觉/交互验收、Live E2E、数据库迁移或部署；v4 服务端验证记录保留，本次未重跑 Server。
