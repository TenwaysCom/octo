---
status: draft
owner: TBD
last_reviewed: 2026-06-09
scope: Reusable structure and rollout logic for applying this AI dev governance model to other projects
update_required_when:
  - docs/ai-dev 目录结构发生变化
  - AGENTS.md 渐进式读取规则发生变化
  - 新项目复用本治理体系后发现新的目录或落地步骤
---

# AI Dev Governance Porting Guide

本文档把当前项目的 `docs/ai-dev` 整理方式抽象成一套可迁移方法。它的目标不是复制 Odoo 术语，而是复用背后的治理逻辑：让 AI 和工程师在改动前能找到上下文、判断风险、选择正确位置，并在改动后留下可审查资产。

## 1. Core Idea

`docs/ai-dev` 不是普通知识库，而是 AI Coding 的工程上下文层。

它解决四个问题：

1. 改动前不知道真实系统怎么运行。
2. 多处代码、配置、脚本、后台规则一起影响同一业务对象。
3. AI 容易只看局部文件，忽略生命周期、权限、配置、第三方和运行时副作用。
4. PR、迁移和复盘缺少统一输入输出格式。

因此本项目采用两层结构：

```text
AGENTS.md
  只放最低硬规则和渐进式读取入口。

docs/ai-dev/
  放 AI 做事前必须知道的上下文、规则、清单、模板和推进状态。
```

迁移到其他项目时，先保持这个分工。不要把所有细节塞进 `AGENTS.md`，否则入口会变成不可维护的长文档。

## 2. Directory Logic

当前结构可以抽象为八类资产：

| 目录 | 抽象职责 | 在其他项目中的等价物 |
| --- | --- | --- |
| `governance/` | 总纲、技术债分类、推进计划、冻结清单、复盘状态 | 治理路线图、风险分级、迁移批次、owner review |
| `lifecycle/` | 核心对象或核心流程的生命周期地图 | 订单、用户、支付、库存、合同、审批、任务等关键实体或流程 |
| `runtime/` | 仓库之外的真实运行时行为 | 后台配置、数据库规则、低代码自动化、定时任务、模板、权限、主数据 |
| `rules/` | 新增或修改逻辑时必须遵守的工程规则 | hook 放置、事务、权限、配置、模块边界、集成可靠性 |
| `templates/` | AI 任务、PR、生命周期地图、技术说明的固定格式 | 需求转技术说明、bug 技术说明、review checklist、AI task prompt |
| `tests/` | 高风险路径的黄金测试矩阵 | 回归测试清单、手工验证矩阵、迁移前保护线 |
| `vendor/` | 第三方、购买模块、fork、patch 的治理 | SaaS 插件、第三方 SDK、外包模块、供应商改动 |
| `migration/` | 渐进式重构、灰度和回滚方法 | Document / Wrap / Shadow / Switch / Retire 迁移计划 |

这不是按“文档类型”划分，而是按“改动风险控制链路”划分：

```text
governance 决定优先级
  -> runtime 还原真实行为
  -> lifecycle 还原对象/流程生命周期
  -> rules 约束新增改动
  -> templates 统一输入输出
  -> tests 建立保护线
  -> vendor/migration 管住外部依赖和历史迁移
```

## 3. Rollout Order

不要一开始就追求完整。推荐按以下顺序迁移到其他项目：

### Phase 0: 建入口

目标：让 AI 和工程师知道从哪里开始读。

最小交付：

- 根目录 `AGENTS.md`
- `docs/ai-dev/README.md`
- `docs/ai-dev/governance/execution-plan.md`
- `docs/ai-dev/templates/ai-task-template.md`
- `docs/ai-dev/templates/pr-review-checklist.md`

验收标准：

- `AGENTS.md` 能把任务类型路由到对应文档。
- `README.md` 能解释每个目录解决什么风险。
- 新任务知道改动前要查哪些上下文，改动后要更新哪些文档。

### Phase 1: 盘真实运行时

目标：先看见仓库之外的真实行为。

适合盘点：

- 后台配置。
- 定时任务。
- server action / automation / workflow。
- 低代码平台逻辑。
- 邮件、PDF、报表、Webhook、消息模板。
- 权限、角色、菜单、record rule。
- 固定 ID、固定名称、关键主数据。

最小交付：

- `runtime/runtime-behavior-inventory.md`
- `runtime/config-parameter-inventory.md`
- `runtime/template-inventory.md`
- `runtime/permission-inventory.md`
- `runtime/master-data-manifest.md`

验收标准：

- 高风险运行时行为有 owner、影响对象、触发入口、风险等级和迁移建议。
- AI 修改核心对象时，不会只看代码而漏掉后台自动化、模板或权限。

### Phase 2: 建核心生命周期地图

目标：把最关键的对象或流程画成可 review 的生命周期。

选择对象时优先看：

- 钱、库存、订单、客户数据、权限、外部集成。
- 被多个模块或服务共同修改的对象。
- 历史事故多、回归难、业务 owner 多的流程。

最小交付：

- `lifecycle/{core-object}.md`
- `templates/lifecycle-map-template.md`

每个生命周期文档至少要记录：

- 生命周期节点。
- 触发入口。
- 参与模块或服务。
- hook / handler / job / API。
- 调用顺序和 `super()` 或等价扩展顺序。
- 读写字段。
- 运行时行为。
- 外部副作用。
- 权限影响。
- 测试缺口。

验收标准：

- 修改核心对象前，可以判断影响哪个生命周期节点。
- 多处覆盖同一逻辑时，能列出冲突位置和执行顺序。

### Phase 3: 立新增规则

目标：先阻止技术债继续变大。

规则文档应覆盖：

- 业务逻辑应该放在哪里。
- 什么场景不能放在低代码/inline code/粗粒度 hook 中。
- 事务、锁、批处理、并发和回滚边界。
- 权限、`sudo`、Portal/API 访问控制。
- 配置和主数据的 owner、默认值、回滚方式。
- 第三方模块、SDK 或 vendor patch 的边界。
- 外部集成的幂等、重试、补偿和失败状态。

验收标准：

- 新增复杂逻辑必须能引用一条规则说明“为什么放这里”。
- PR review 不只看代码能不能跑，还看是否违反规则边界。

### Phase 4: 建测试和迁移保护线

目标：让历史逻辑迁移有保护，不靠一次性重写。

最小交付：

- `tests/golden-test-matrix.md`
- `migration/migration-guidelines.md`
- `governance/runtime-freeze-register.md`

验收标准：

- 高风险 runtime 行为能进入 freeze / wrap / shadow / switch / retire 状态。
- 每次迁移都有测试、灰度、回滚和 owner review。

## 4. Minimal Scaffold for a New Project

新项目可以先创建以下最小结构：

```text
docs/ai-dev/
  README.md
  governance/
    execution-plan.md
    technical-debt-review.md
    rollout-status.md
    runtime-freeze-register.md
  lifecycle/
    {core-object}.md
  runtime/
    runtime-behavior-inventory.md
    config-parameter-inventory.md
    template-inventory.md
    permission-inventory.md
    master-data-manifest.md
  rules/
    hook-placement-rules.md
    transaction-and-cr-rules.md
    permission-rules.md
    config-and-master-data-rules.md
    integration-reliability-rules.md
    module-organization-rules.md
  templates/
    ai-task-template.md
    pr-review-checklist.md
    lifecycle-map-template.md
    story-tech-spec-template.md
    bug-tech-spec-template.md
  tests/
    golden-test-matrix.md
  vendor/
    vendor-module-rules.md
    vendor-module-manifest.md
    vendor-patch-inventory.md
  migration/
    migration-guidelines.md
```

其中必须先落地的是：

1. `README.md`
2. `templates/ai-task-template.md`
3. `templates/pr-review-checklist.md`
4. `templates/lifecycle-map-template.md`
5. `governance/execution-plan.md`
6. 一个核心对象或流程的 `lifecycle/*.md`
7. 一个运行时入口清单 `runtime/runtime-behavior-inventory.md`

## 5. How to Write AGENTS.md

`AGENTS.md` 应保持短，只放三类内容：

1. 最低硬规则。
2. 高风险对象或流程清单。
3. 按任务类型读取 `docs/ai-dev/*` 的路由表。

推荐形态：

```text
修改核心对象/流程 -> 读 lifecycle/{object}.md
修改 hook/action/job -> 读 rules/hook-placement-rules.md
涉及事务/批处理/直接 SQL -> 读 rules/transaction-and-cr-rules.md
涉及权限/API/Portal -> 读 rules/permission-rules.md
涉及配置/主数据 -> 读 rules/config-and-master-data-rules.md
涉及第三方/vendor -> 读 vendor/vendor-module-rules.md
需要写 PR -> 读 templates/pr-review-checklist.md
```

`AGENTS.md` 不应承载：

- 具体生命周期细节。
- 大段业务背景。
- 完整配置清单。
- 所有测试用例。
- 长篇迁移计划。

这些内容应放回 `docs/ai-dev`。

## 6. Review Questions

把这套体系应用到其他项目时，先问这些问题：

1. 哪些对象或流程一旦改错会影响钱、库存、客户数据、权限或外部系统？
2. 哪些行为不在代码仓库里，但会改变生产行为？
3. 哪些模块、插件、自动化或脚本重复修改同一对象？
4. 哪些配置、主数据、模板或权限是业务运行契约？
5. 哪些逻辑目前没有测试，迁移前必须先变成黄金测试？
6. 哪些历史逻辑应该 freeze，不允许继续扩展？
7. 哪些规则必须从今天开始约束新增需求？

这些问题的答案决定 `lifecycle/`、`runtime/`、`rules/` 和 `tests/` 的第一批内容。

## 7. Success Criteria

一套可用的 AI 开发规范不是文档齐全，而是满足以下条件：

- AI 接到任务后能按 `AGENTS.md` 找到最小必要上下文。
- 核心改动前能定位生命周期节点和运行时副作用。
- PR review 能检查权限、配置、事务、第三方、模板和外部集成风险。
- 历史运行时行为有 freeze / owner / migration 状态。
- 新增业务逻辑不再进入不可版本化、不可测试、不可审查的位置。
- 文档随着代码、配置和运行时变化被更新，而不是一次性归档。

