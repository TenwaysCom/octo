---
title: "Lark Ticket AI 输出与 Eval 数据集视图"
module: "ai-ticket"
status: completed
created_on: 2026-09-01
owner: TBD
related:
  - "../../ai-dev/2026-09-01-lark-ticket-ai-output-and-eval-dataset-prd.md"
---

# Lark Ticket AI 输出与 Eval 数据集视图

## 目标

将当前 Ticket 处理与 AI 输出复核、Eval/Badcase 数据集构建拆为独立工作面；AI 输出按意图识别、问题总结、Ticket 答案总结、文档生成四阶段呈现。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-09-01 | completed | 新增 AI 输出 / Eval 数据集工作面、PostgreSQL `lark_ticket_eval_samples`、Web Session API 和标注编辑器；样本冻结 Ticket AI 输出及完整线程快照版本。 | 未做真实 Lark/ACP 或实际 CSV 导出；本机服务端全量测试另有超时与 logger 文件测试失败，未在本任务内排查。 |
| 2026-09-01 | completed | AI 输出扩展为四阶段流水线；回答和文档未持久化时显式显示未生成，继续处理复用详情页 AI Session。 | 实际的回答/文档 Session 结果仍需由后续 Skill 写入新增的本地 AI 字段。 |
| 2026-09-01 | completed | AI 输出与 Eval 数据集改为 Lark Ticket 视图配置中的独立选项，和普通列表/看板共用服务端筛选、标签筛选、排序和分组；修复 Eval 列表被通用 Header 鉴权拦截的问题，改为使用既有 Web Session。 | 尚未执行 PostgreSQL `db:migrate`，因此运行中环境未必已有样本表。 |
| 2026-09-01 | completed | AI 输出与 Eval 数据集接入既有 Lark 主分组及二级分组折叠状态；主组、子组均可独立收起，并在这两个视图间保留状态。 | 仅支持已有视图配置定义的两级分组。 |
| 2026-09-01 | completed | 视图配置会随 AI 输出 / Eval 数据集模式切换对应显示字段，并实时控制字段显隐；排序仍在分组前按稳定的 Ticket 基础字段执行。 | 当前未按 AI 阶段内容或人工 Eval 标注排序，避免对未定义的文本和标签语义作隐式排序。 |
| 2026-09-01 | completed | 两个工作面均展示当前同步的 Ticket 描述；完整线程快照的 Ticket 即可加入 Eval，AI 输出可为空以支持先建设数据集、后运行评测。 | 无线程快照或快照不完整时仍拒绝创建，页面会显示具体原因。 |
| 2026-09-01 | completed | Ticket 行显示 AI 已输出 / AI 未输出标记；Lark Ticket 快速筛选支持这两个条件，并在服务端过滤以保证分页和总数正确。 | 标记仅代表本地 allow-listed `ticket_ai` 是否有字段，不代表四阶段都已完成。 |
| 2026-09-01 | completed | 修复 Eval 编辑保存路径遗漏 Web Session 鉴权豁免，`PUT /api/web/lark-ticket-eval-samples/:id` 不再要求浏览器提供 `master-user-id`。 | 运行中的 Server 需加载最新代码后验证真实保存。 |
| 2026-09-01 | completed | AI 输出和 Eval 行增加 Lark Thread 跳转与只读 prepared messages 聊天框；AI 输出视图在服务端只加载有本地 `ticket_ai` 的 Ticket。 | prepared messages 仅显示已准备的脱敏快照；无快照时明确提示。AI Actions 仍从详情页启动既有 Session。 |
| 2026-09-01 | completed | Prepared messages 聊天框显示稳定匿名参与者标签（用户 1、用户 2、客服机器人、系统）和消息时间；不暴露原始发送者 ID。 | 缺少发送者 ID 的历史消息只能显示通用角色；旧 prepared 缓存会按新的脱敏版本从已存线程记录重建。 |
| 2026-09-02 | in progress | 问题总结 prompt 已改为“受控 fetch → 单次分析 JSON → analysis-update”，并修复旧默认 prompt 的数据库迁移、ACP 本地化审批文本解析及 Kimi 延迟 rawInput 关联；聚焦测试 22/22、Server build 通过。 | 真实 ACP 在 Bash 审批时仍不提供命令参数，只在拒绝之后才补发；严格白名单无法安全批准，因此 3 条 Ticket 的真实取证/写回与 FE 读回尚未完成。 |
| 2026-09-02 | in progress | ACP 客户端新增标准 `terminal/*` 与 `fs/*` 能力，命令、参数和路径统一进入服务端能力策略；19 个相关聚焦测试及 TypeScript 检查通过。 | 本机 Kimi 0.39.1 仍绕过 terminal 并发出无命令载荷的 Bash 审批；官方 1.49.0 隔离运行需要重新登录，登录完成后才能继续 3 条 Ticket 的真实写回与 FE 读回。 |
| 2026-09-02 | completed | 保留 Quick Action 原有自然语言交互，新增一个通用结构化 `execute` MCP：仅执行 manifest 声明的 root/script/subcommand；ACP read 可读 Support workspace 与 Octo Server，write 仅可写 Support workspace，通用 Bash/terminal 默认拒绝。 | 当前 manifest 只声明 Support-QA 脚本的 `fetch`、`update`、`analysis-update`；新增脚本必须显式登记并补参数策略。 |
| 2026-09-02 | completed | 真实 Ticket 2070、2007、2111 均完成签名 `analysis-update`，规范化分析表和 FE `ticket_ai` 投影均已写入；登录态 AI 输出视图显示三条为“AI 已输出”并展示意图/问题总结，2070 的“加入 Eval”创建成功，Eval 视图显示冻结快照、AI 意图与人工标注字段，无 `UNAUTHORIZED`。 | 未向 Lark Thread 发送消息；验证仅覆盖本地 Server、PostgreSQL 和登录态本地 FE。 |
| 2026-09-02 | completed | 按当前产品决策临时对三个 Support-QA Ticket action 放行无命令载荷的 Bash 审批，并标记 `v4-temporary-support-qa-bash`；同时将证据/写回门禁失败的 Session、actionRunId、错误码与模型正文保存为未验证草稿。FE 显示未验证状态、禁止直接发送并可重新执行，正式分析三表与 `ticket_ai` 不受污染。 | Bash 临时放行只能做到 action 级约束，不是真实目录沙箱；应在 Kimi 能稳定使用结构化 execute 后移除。未执行新的真实 Kimi/Lark 调用。 |
| 2026-09-02 | completed | 修复 ACP prompt 在 `session.created` 后中断时的 Ticket 关联竞态：收到创建事件即开始写入 Ticket 与 thread 归属，不再等待 prompt 完成。已将实际孤立 Session `session_f38d…` 精确恢复到 Ticket 2106，并标记为 `AI_SESSION_INTERRUPTED`。 | 历史恢复仅处理已确认的一条记录；没有批量推断或修改其他无关联 Session。 |

## 验证

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
