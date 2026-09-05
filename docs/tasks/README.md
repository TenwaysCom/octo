---
status: active
owner: TBD
last_reviewed: 2026-09-04
scope: Octo 工作任务台账的记录、检索与归档规则
review_cadence: monthly
---

# Tasks 台账

`docs/tasks/` 是 Octo 每次需求、排障、调研、实施和验证工作的轻量台账。一个 Markdown 文件对应一个可独立跟踪的任务；同一任务的后续进展追加到原文件，不为同一事项重复建档。

这里记录工作事实和验证边界，不替代 Meegle 的项目管理状态，也不保存 cookie、token、客户资料或其他敏感内容。

## 目录

```text
docs/tasks/
├── _template.md
├── acp/                 # ACP runtime、server、skill、权限与调用链
├── platform-sync/       # Lark、Meegle、GitHub 等平台同步与回写
├── platform-auth/       # 身份解析、OAuth、auth-code bridge、授权问题
├── platform-data/       # Meegle Workitem、Lark Ticket、GitHub PR 的本地管理能力
├── ai-tasks/            # AI 工作流、prompt、评测、自动化任务
├── ai-ticket/           # Lark Ticket/工单 AI 分析、分流与反馈闭环
├── engineering-ops/     # 测试、CI/CD、运行稳定性、技术债与研发治理
└── archived/            # 已归档记录，按原模块保留分类
```

当任务不属于以上模块时，先使用最接近的模块；只有连续出现且需要独立检索的任务类型，才新增目录，并在本文件的目录说明中补充其边界。

## 新建与更新

1. 先在目标模块的 `README.md` 搜索相同对象、关键词或外部记录 ID；已有记录则更新原文件。
2. 新建文件名使用 `YYYY-MM-DD-简短-kebab-case.md`，日期是首次建档日期。例如：`acp/2027-05-12-kimi-acp-server.md`。
3. 从 [_template.md](_template.md) 复制内容，填写 front matter 和最小必要章节。
4. 每次实质进展追加一条“进展记录”，写明日期、结果、证据链接和未验证边界。

文件名日期不因后续更新而改变；`updated_on` 记录最近一次有意义的更新。日期统一使用 `YYYY-MM-DD`，状态只能取 `planned`、`in_progress`、`blocked`、`done`、`cancelled` 或 `superseded`。

## 需求变更闭环

讨论中出现实质需求变更时，在继续执行前完成一次闭环：

1. **记录**：递增 `requirement_version`，把目标、验收标准和方案改成当前有效版本；旧决策标记为 `superseded`，不能只在进展末尾追加说明。
2. **复核**：检查变更影响的代码、数据、测试和执行计划；受影响的已完成项重新打开，旧版本证据不再作为当前完成依据。
3. **执行**：执行前确认计划基于最新 `requirement_version`；执行后记录结果、证据和未验证边界。只有最新版本的验收项全部通过，任务才能设为 `done`。

变更含义明确时直接更新并继续；只有新旧要求冲突且无法判断替换关系时，才暂停向需求方确认。

## 记录标准

- 任务应有可判断的目标和验收标准；调研类任务也要说明产出物或决策。
- 运行时验证与静态检查分开写。代码改动、单测通过或 UI 截图不等于已部署或生产验证。
- 外部平台写操作应记录安全的 read-back 或结果 ID；不要记录敏感请求/响应内容。
- `blocked` 必须说明阻塞原因、需要谁提供什么，以及下一次复查条件。
- 与其他任务、Meegle、PR、日志或架构文档的关系使用相对链接或安全的外部链接。

## 月度归档

每月第一个工作日由文档维护人执行一次归档复核（可以在例行治理任务中完成）：

1. 查看各模块 `README.md` 中的 `done`、`cancelled`、`superseded` 任务。
2. `closed_on` 已超过 90 天的记录是归档候选；确认没有待办、未完成验证或活跃依赖后，移动到 `archived/<原模块>/`。
3. `updated_on` 超过 60 天且仍为 `planned`、`in_progress` 或 `blocked` 的记录只标为“需要复核”，**不得自动归档**。复核后选择继续、关闭、取消或替代。
4. 移动时保留原文件名、front matter、证据和链接；补充 `archived_on`、`archive_reason`。

归档是为了保持活跃台账可读，不代表需求从历史上消失。需要恢复时，将文件移回原模块、清除归档字段并更新状态。

## 复核清单

- [ ] 文件位于正确模块，文件名以首次建档日期开头。
- [ ] 状态、`updated_on` 和验证边界是最新的。
- [ ] 已关闭满 90 天的记录已确认是否归档。
- [ ] 长期无更新的开放任务已复核而非静默遗忘。
