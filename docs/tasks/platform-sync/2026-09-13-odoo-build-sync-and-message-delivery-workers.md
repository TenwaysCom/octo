---
title: "Odoo.sh 构建同步与通用消息发送 Worker"
module: platform-sync
status: done
requirement_version: 3
created_on: 2026-09-13
updated_on: 2026-09-14
closed_on: 2026-09-14
owner: Codex
related:
  - "../engineering-ops/2026-09-10-odoo-build-failure-lark-notification.md"
  - "./2026-08-26-scheduled-platform-sync.md"
---

# Odoo.sh 构建同步与通用消息发送 Worker

## 目标

将 Odoo.sh 构建同步和消息发送的配置统一纳入 `server/config/platform-sync.local.json`，明确拆分业务生产与通用发送两个 Worker。按已梳理的职责边界完成业务消息生产与通用发送接入。

当前 v3：EU / UK / US 继续同步；`scheduler.tasks.odooSh.notificationEnvironments` 默认及本地配置为 `["eu"]`，仅 EU 生成通知。启动发送器前取消禁用环境已有的 pending_send 消息；sent / sending / failed / outcome_unknown 投递记录不改写、不重试。此要求替代 v2 的全环境通知范围。

## 已明确的需求

| Worker | 职责 | 不承担的职责 |
| --- | --- | --- |
| 业务同步 Worker（本次为 Odoo.sh） | 刷新构建数据、保存快照、判断新增失败或失败转换、生成待发送消息 | 不直接调用平台发送消息 |
| 通用消息发送 Worker | 领取待发送消息、调用发送适配器、记录结果、处理重试 | 不查询 build，不判断失败，不解析作者，不根据业务类型选择模板 |

业务流程：`刷新构建 → 比较并保存数据 → 生成待发送消息 → 通用发送 Worker 异步发送`。

两个 Worker 独立调度；“刷新后生成通知”属于同一个业务任务，“发送消息”属于另一个通用任务。不能将发送重新绑定到构建刷新周期，也不能仅给 Odoo 专用发送器改一个通用名称。

## 背景与范围

- 当前已提交版本中，构建刷新与通知消费均运行在 Server 内，有各自定时器。构建刷新间隔固定为 30 分钟；通知消费间隔来自环境变量。
- 原通知消费者仍读取 Odoo build、核对失败状态、解析作者和组装正文；这些属于消息生成端的业务职责。
- 本次首先接入 Odoo.sh 消息。其他已有直接发送流程的迁移不是已确认范围。
- 不引入其他消息渠道、消息管理 UI、手工重发 API 或跨实例调度框架，除非后续明确提出。

## 方案与决策

当前实现采用以下方案：

1. **配置归一。** 在 `scheduler.tasks` 下分别配置业务同步任务和通用消息发送任务，键名为 `odooSh`、`messageDelivery`，分别配置开关与周期，并共同受 `scheduler.enabled` 总开关控制。
2. **业务生成完整消息。** Odoo.sh 侧完成失败判定、作者身份解析、目标群选择及正文组装，再保存发送所需的完整内容。未知作者沿用原有“发送正文但不 @”规则；身份查询失败不能误当成未知作者。
3. **通用发送契约。** 待发送消息至少包含消息 ID、目标、发送内容、幂等键及发送状态。业务来源可作为追踪信息，发送 Worker 不据此分支执行业务逻辑。
4. **可靠入队。** 构建状态更新后，不能因中途崩溃永久丢失应生成的消息。采用同事务入队或可恢复的业务事件过渡方式，保留 `odoo_sh_build_notifications` 作为业务事件；完整消息写入 `message_outbox` 与业务事件标记 `queued` 共用事务，生产端锁定并重验 build 版本后转入通用队列。
5. **发送状态。** 建议保留待发送、发送中、已发送、失败及结果待核实；消息领取应避免并发重复发送。明确可重试错误按上限和退避重试；超时等不确定结果不得盲目重发。
6. **首次初始化。** 沿用现有环境／项目基线机制：首次保存历史但不生成历史失败消息；重启不重复初始化。
7. **配置归属。** Odoo 目标群、作者映射属于业务生产端；发送轮询、批量大小、重试和发送超时属于通用发送端；平台凭据继续保留在环境配置。

## 已采用的边界与兼容规则

- **运行归属：** 继续由 Server 托管两个独立定时循环；不新增 PM2 进程，也不在 platform-sync-worker 重复启动。同步默认 30 分钟，发送默认 30 秒。
- **消息范围：** 通用契约目前承载 Lark 文本消息，发送器不区分业务来源。本次只接入 Odoo.sh，其他发送流程不迁移。
- **开关语义：** 控制后台调度；页面触发的既有 Odoo 缓存刷新仍同步数据并生成业务消息。关闭消息发送任务时队列保留，恢复后按状态继续发送。
- **build 恢复：** 生产端取消尚未领取的消息；发送中或已发送消息不回滚，发送器不重新查询 build。
- **旧表过渡：** 旧表保留业务去重与审计，新增 `queued` 状态表示已转入通用队列。`pending_send` / `pending_identity` 转移时保留 attempts、nextAttemptAt 和原幂等键；`sent` / `failed` / `outcome_unknown` 不迁移、不重发；旧 `sending` 过期后保持待核实。新发送状态和平台 message_id 以 `message_outbox` 为准。
- **配置兼容：** JSON 为唯一调度配置，旧 `ODOO_SH_BUILD_NOTIFY_*` 环境变量不再生效，应将自定义值迁入 JSON。旧配置未填写两个新任务时沿用默认参数，但仍服从 scheduler 总开关。未提供默认配置文件时 Server 的这两个后台任务关闭；显式指定不存在的配置文件或无效 JSON/Zod 值会启动失败，不静默回退。
- **凭据与身份：** `ODOO_DEVOPS_SESSION`、Lark 应用凭据保留环境变量；作者别名解析继续使用 `ODOO_SH_BUILD_AUTHOR_GITHUB_MAPPING`，由生产端消费。目标群改为 `scheduler.tasks.odooSh.chatId`。
- **退出：** Server 关闭时停止定时器并等待在途刷新和发送，仍受既有整体关闭超时约束。不提供跨实例刷新调度锁；通用消息领取使用数据库条件更新和 claim token。

## 配置示例

合并到现有配置，不替换其他平台的 targets/tasks：

```json
{
  "scheduler": {
    "enabled": true,
    "tasks": {
      "odooSh": {
        "notificationEnvironments": ["eu"],
        "enabled": true,
        "intervalMinutes": 30,
        "chatId": "目标 Lark 群 ID"
      },
      "messageDelivery": {
        "enabled": true,
        "pollIntervalSeconds": 30,
        "maxAttempts": 3,
        "retryDelaySeconds": 60,
        "sendTimeoutSeconds": 10,
        "batchSize": 10
      }
    }
  }
}
```

配置位置：`server/config/platform-sync.local.json`，可由 `PLATFORM_SYNC_CONFIG_PATH` 指定路径。修改后重启 Server，配置不热加载。新增通用消息表纳入现有 schema migration/startup ensure 链路；本轮未执行目标数据库迁移或服务重启。

## 验收标准

- [x] v3：仅 EU 通知，UK / US 保持同步；启动发送器前取消禁用环境待发送消息，保留投递终态与不确定结果。

- [x] 上述边界已在实施请求下明确采用，配置字段及默认值已落地。
- [x] 两个任务在同一配置文件中可独立启停和设置频率，凭据不进入任务配置。
- [x] 业务同步 Worker 刷新构建、识别失败并生成消息，不执行真实发送。
- [x] 通用发送 Worker 可发送至少两种不同业务来源的测试消息，不依赖 Odoo 字段或服务。
- [x] 首次基线静默、重复快照不重复入队，消息生成中断后可恢复。
- [x] 并发领取、可重试错误、重试耗尽、发送结果未知和确认写回失败均有回归验证。
- [x] 旧通知处理不会重复发送已发送或结果不确定的消息。
- [x] 启动、停止、重启和配置加载行为符合已确认的进程归属。
- [x] Server 测试与构建通过，架构／生命周期及配置示例同步。
- [x] 真实 Lark 送达单独记录，自动化测试不得代替实际送达验收。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-13 | v1 | planned | 用户要求先梳理职责、创建台账，暂停未接通草稿；“刷新后直接发送”的合并方案不采用。 | 待实施。 |
| 2026-09-13 | v2 | done | 用户要求实现。完成独立配置、Odoo 消息生产端、通用队列和发送 Worker、旧表过渡、配置解析独立模块及 Server 启停装配；移除旧 Odoo 专用发送消费者。 | 未提交、部署、执行目标库迁移或发送真实消息。 |

| 2026-09-14 | v3 | done | 用户要求暂时仅 EU 发送；增加通知环境配置和启动前队列清理，生产端应用同一策略。 | 未重启运行中服务、未操作实际数据库、未重试原 4 条失败消息。 |

## 验证

v3 验证：相关测试 39 通过；Server 全量测试 927 passed / 1 skipped（`/tmp/octo-eu-notification-full-tests.log`），`pnpm --dir server build` 通过。下表保留 v2 历史证据。

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Server 全量测试 | 918 passed / 1 skipped | `pnpm --dir server test`，167 文件通过 / 1 跳过 | 在沙箱外运行以支持既有 startup 子进程输出检查；外部平台为 mock，数据库为 pg-mem |
| Server 构建 | 通过 | `pnpm --dir server build` | TypeScript 编译；非部署 |
| 独立 PostgreSQL 并发／事务验证 | 通过 | `/tmp/octo-outbox-check.mjs`：12 路领取仅成功一次、旧 token 写回无效、入队后更新业务事件故障导致整事务回滚、8 路事件转移仅入队一次 | 隔离临时 PostgreSQL 17；无真实发送、无业务数据库访问；临时实例已停止 |
| 生命周期与配置测试 | 通过 | 独立开关／周期／无效配置、初始化静默、准备中断恢复、旧状态迁移、取消待发送、两种业务来源消息、重试／耗尽／结果不确定、ACK 写回失败、关闭等待、轮询失败恢复 | mock integration，不代表真实群权限或消息送达 |
| 配置与文档 | 完成 | 示例 JSON、本地 JSON、`.env.example`、生命周期和平台架构已更新 | 本地 JSON 被 Git 忽略；未读取或修改 `server/.env.swp` |
| 真实 Lark 消息 | 未执行 | 无 | 本任务实现不自动触发外部发送；机器人入群及真实送达仍需单独验收 |

## 复盘与验证边界

- 初始实现早于职责确认，导致中途方案反复；最终以 v2 的独立生产／发送边界为准，早期检查不作为最终完成证据。
- 测试 fixture 首次构建缺少 nullable `url/head_commit_url`，已补齐。
- 启动检查的空 stdout 用最小 child Node 命令复现为沙箱限制；沙箱外同一测试通过，没有弱化断言。配置解析已独立为 `src/config/platform-sync-config.ts`，Server 不导入 CLI 入口。
- 通用队列内正文和目标由生产端固定；发送器只处理投递。事件幂等键沿用原 `odoo-sh-build-notify:<event id>`，旧终态和不确定结果不自动重放。

## 关联

- [原 Odoo.sh 构建通知任务](../engineering-ops/2026-09-10-odoo-build-failure-lark-notification.md)
- [平台同步调度](./2026-08-26-scheduled-platform-sync.md)
- [任务台账规则](../README.md)
