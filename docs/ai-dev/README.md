---
status: draft
owner: TBD
last_reviewed: 2026-06-09
scope: Octo AI development context entrypoint and system rule map
update_required_when:
  - extension/server/platform boundary changes
  - page/action config contract changes
  - Meegle or Lark integration rules change
  - testing entrypoints or E2E strategy changes
---

# Octo AI Dev Context

本文档是 Octo 的 AI Coding 入口。它不替代 `AGENTS.md`，而是把系统边界、当前问题、代码规则和测试策略放到一个可渐进读取的位置。

Octo 当前的治理目标是：让工程师和 AI 在改动前能判断逻辑应该放在哪一层，改动后能通过测试和日志快速定位问题属于 extension、server、adapter 还是真实平台。

## 1. System Model

Octo 由三层组成：

| Layer | Responsibility | Should not own |
| --- | --- | --- |
| Extension | 页面识别、上下文采集、授权触发、popup/sidebar UI、把用户动作交给 server | 业务 workflow、Meegle/Lark 字段规则、跨平台 mapping、复杂状态机 |
| Server | 业务动作目录、identity/auth、workflow 编排、平台 API 调用、数据持久化、错误归一化 | 浏览器 DOM 细节、页面注入实现、平台字段硬编码散落在业务服务 |
| Platform adapters | Lark/Meegle/GitHub API 封装、平台错误转换、请求/响应日志 | PM 业务语义、UI 行为、跨模块 orchestration |

平台本身也要被当成一个独立边界：

- Lark/Meegle 授权可能缺失或过期。
- Meegle 字段 ID 是动态 `field_key`，不同 workitem type 可能不同。
- 平台字段可能只允许 create、只允许 update，或受状态/权限限制。
- 平台返回错误必须保留原始摘要，再转换成稳定的 Octo error code。

## 2. Read This First

按任务类型读取文档：

| Task | Required context |
| --- | --- |
| 提需求或创建 AI/dev 任务 | `templates/ai-task-template.md` |
| 做 PR review | `templates/pr-review-checklist.md` |
| 判断下一步修复顺序 | `governance/execution-plan.md` |
| 修改 extension popup/sidebar/content script | `rules/extension-code-rules.md`，跨层 action 再读 `rules/system-boundaries-and-code-rules.md` |
| 修改 server action/page config/API workflow | `rules/server-code-rules.md`，跨层 action 再读 `rules/system-boundaries-and-code-rules.md` |
| 理解当前技术对象生命周期 | `lifecycle/current-system-technical-objects.md` |
| 修改 Meegle create/update/field mapping | `rules/system-boundaries-and-code-rules.md` 的 Meegle metadata rules，以及 `governance/current-issue-map-2026-06-09.md` 的 P1-1 |
| 修改 Lark/Meegle/GitHub 平台 adapter | `rules/system-boundaries-and-code-rules.md` 的 adapter boundary、logging/error rules |
| 修改 E2E 或授权验证 | `rules/system-boundaries-and-code-rules.md` 的 testing rules，以及 issue map 的 P0-1 |
| 修改 legacy route 或公开 API 命名 | issue map 的 P2-1，并同步 `AGENTS.md`、代码和测试说法 |
| 新增 AI/dev 治理文档结构 | `governance/ai-dev-governance-porting-guide.md` |

## 3. Current Priorities

当前问题按修复优先级分为三组：

| Priority | Theme | Target |
| --- | --- | --- |
| P0 | 分层边界、诊断契约、E2E 入口、server-driven action execution | 让失败可以定位到具体层级和阶段 |
| P1 | Meegle metadata resolver、page/action mapping 收敛 | 减少硬编码和平台运行时失败 |
| P2 | legacy route 策略、测试风格清理 | 降低维护歧义 |

详细问题清单见 `governance/current-issue-map-2026-06-09.md`。

## 4. Code Change Checklist

动代码前先回答这些问题：

1. 这次改动属于 extension、server、adapter 还是 platform metadata？
2. 是否新增或修改了用户可触发 action？如果是，server action config 是否是唯一行为来源？
3. 是否新增或重构跨层 action？如果是，是否传递 `actionRunId`，失败时能否看到 `layer/module/stage/errorCode`？
4. 是否写入 Meegle 字段？如果是，是否通过 metadata resolver 或集中映射，而不是在 workflow 中散落 `field_*`？
5. 是否依赖真实 Lark/Meegle 授权？如果是，测试名称是否明确区分 mock integration 和 live e2e？
6. 是否修改公开 route 或术语？如果是，兼容策略是否同步到 docs/tests/AGENTS？

## 5. Governance Assets

当前已有资产：

| Path | Purpose |
| --- | --- |
| `governance/ai-dev-governance-porting-guide.md` | 说明如何把 `docs/ai-dev` 治理结构迁移到其他项目 |
| `governance/current-issue-map-2026-06-09.md` | 当前 Octo 系统问题图和优先级 |
| `governance/execution-plan.md` | 当前治理和代码修复执行计划 |
| `lifecycle/current-system-technical-objects.md` | 当前系统技术对象 lifecycle |
| `rules/system-boundaries-and-code-rules.md` | 当前系统边界和后续代码规范 |
| `rules/extension-code-rules.md` | Extension 端代码规范 |
| `rules/server-code-rules.md` | Server 端代码规范 |
| `templates/ai-task-template.md` | 提需求或创建 AI/dev 任务的输入模板 |
| `templates/pr-review-checklist.md` | PR review 检查模板 |

后续如果继续完善，优先补齐：

- `tests/golden-test-matrix.md`: 记录 unit、mock integration、live e2e 的保护线。
- `runtime/platform-auth-and-seed-data.md`: 记录 Lark/Meegle 授权、测试账号、seed data 和限制。
- `runtime/meegle-field-metadata-manifest.md`: 记录 Meegle workitem type、semantic field、实际 `field_key` 和写入能力。
