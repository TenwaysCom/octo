---
title: "LLM wiki 更新机制与生产接入核查"
module: ai-ticket
status: done
requirement_version: 2
created_on: 2026-10-12
updated_on: 2026-10-12
closed_on: 2026-10-12
owner: TBD
related:
  - "./2026-09-22-wiki-ingestion-audit.md"
  - "./2026-09-17-wiki-entity-maintenance.md"
---

# LLM wiki 更新机制与生产接入核查

## 目标与范围

核对 llm-wiki 如何更新、是否存在周期摄入、main 生产环境已接入到哪一步；整理现有说明。v1 只读检查代码、配置、部署目录、进程、健康状态及安全日志摘要；v2 按用户要求，将 workspace 的 Ticket 取证脚本改为优先读取生产 `octo/server/.env`，保留原有回退顺序并同步说明。不执行摄入、同步、模型请求、部署或数据库写入。

## 验收标准

- [x] 区分平台同步、Shadow 分析、wiki 内容摄入及查询使用。
- [x] 用 main 目录、构建产物、在线进程和健康接口核对生产接入边界。
- [x] 核对摄入数据源及当前 Skill/Schema，保留历史记录的适用日期。
- [x] 更新相关文档并检查路径、差异与未验证边界。
- [x] v2：生产环境文件优先；生产文件缺失时保持原有回退顺序；通过隔离的文件存在性模拟验证，不查询真实 Ticket。

## 方案与决策

机制说明维护在 [IT Platform Sync](../../tenways-octo/it-platform-sync.md#llm-wiki-更新与生产接入)，本任务保存 2026-10-12 环境快照。历史摄入统计不改写成当前源端覆盖率。guide/wiki 存在用户未提交改动。v1 只读核对的约束已由 v2 的明确授权替代：仅修改 guide 取证脚本与 Skill 的对应说明，保留其他已有改动。环境选择由 `find_env` 实现持有；不新增参数或配置。

## 核查结果（2026-10-12，UTC+8）

### 更新链路

| 环节 | 当前入口与频率 | 产物与边界 |
| --- | --- | --- |
| Lark / Meegle / GitHub 同步 | 生产 Worker 配置每 10 分钟调度，调度器每 30 秒轮询 | 更新 Octo 数据快照，不生成 wiki 文章；调度间隔不保证每条源数据实时可用 |
| Shadow 分析 | 生产配置每 20 分钟轮询，静默期 20 分钟，每批最多 20 张 | 可检索 wiki，写入 `shadow_ai`；不写 wiki 内容 |
| Ticket 摄入 wiki | 手动 Document 快捷动作，或有相应取证权限的 workspace 执行 `write-support-qa` | 逐票取证 → 不可变 raw → 按簇提炼 concepts → 更新 index/log/逐票账本；未接入周期任务 |
| Wiki 问答 | 用户触发 `wiki 问答` | 读取本地知识生成草稿，不更新知识页；ACP Answer 的查询沉淀是另一个入口 |

证据：生产 `server/src/scripts/platform-sync-worker.ts`、`server/src/application/services/platform-sync-worker.ts`、`server/config/platform-sync.local.json`、Shadow service、Wiki service，以及 guide 的 `write-support-qa` v2.3.2、wiki README/SCHEMA。

本机 deploy 用户 cron 共 3 条，wiki 相关 0 条；systemd 系统 timer 共 22 条，wiki 相关 0 条；用户 timer 未发现 wiki 相关项。PM2 未发现 wiki 摄入进程。结论限定于已检查的本机代码、进程及调度入口，未枚举其他主机或未连接的自动化服务。

### main 生产接入

| 检查 | 结果 |
| --- | --- |
| 生产目录 | `/home/deploy/projects/octo`，分支 `main`，检出提交 `742e5d2` |
| 在线进程 | `octo-server-production`、`octo-platform-sync-worker-production` 均为 PM2 `online`，cwd 指向生产 `server/`，执行 `dist/` 产物 |
| 健康状态 | `http://127.0.0.1:3000/api/health` HTTP 200；staging 3030 也为 200 |
| Wiki 配置 | production 与 staging 的 `SUPPORT_QA_EU_WORKSPACE_DIR` 均为 `/home/deploy/projects/odoo-eu-guide`，共用 `docs/llm-wiki` |
| 部署产物 | 生产 `dist/` 已包含 Wiki QA service/catalog、Document wiki 路径权限与 entity-maintenance 固定脚本策略 |
| 运行记录 | 当日生产日志有 `server.sync.scheduled_completed` / `schedule_finished: succeeded`；Shadow 有 `server.shadow.poll`，最后检查到 13:54:04 |

**生产已接入 wiki 读取及手动维护入口，周期摄入未接入。** 在线、健康与存在构建产物不替代 Wiki 问答、Document 写入或真实模型的端到端验收。Shadow 轮询记录不证明本轮有候选、分析成功或 wiki 已更新。未断言在线进程加载的全部代码与当前检出提交逐字节一致。

### 摄入数据源与知识状态（v1 核查时点，环境选择已由 v2 调整）

- v1 核查时取证脚本 `odoo-eu-guide/.agents/skills/write-support-qa/scripts/octo-ticket-evidence.sh` 的 `find_env` 优先读取 `/home/deploy/projects/octo_test/server/.env`，其次为旧 guide 路径与当前目录 `server/.env`。本机首选文件存在，对应数据库 `tenways_octo_test`；生产目录配置对应 `tenways_octo`。生产 Server 使用 wiki 不会自动改变该取证脚本的数据源。
- Wiki 逐票权威账本为 `_meta/state.jsonl`。本轮只读计数 1936 行、1936 个唯一 record_id；knowledge_status：draft 1434、on_hold 250、needs_evidence 172、no_distill 73、historical_case 7。账本记录不等于人工签核、源端最新或生产数据全覆盖。
- `log.md` 最后登记的新增 Ticket 摄入批次为 2026-09-23；最后登记的规则/组织维护为 2026-10-10。账本中 2026-10-10 的 processed_at 仅 1 条，不能把文件修改日期当成全库重摄入时间。
- 当前 guide Skill v2.3.2 与 2026-10-10 Schema 采用 **concepts 优先、entities 按需**；普通摄入不运行实体 plan/check，也不把实体复核作为文章完成门槛。文章证据、范围、状态、链接及逐票账本要求继续执行。09-17 的批末全实体联动属于历史交付契约。

## v2：生产取证优先级调整

按用户要求，`odoo-eu-guide/.agents/skills/write-support-qa/scripts/octo-ticket-evidence.sh` 的 `find_env` 首选 `/home/deploy/projects/octo/server/.env`。文件不存在时，依次回退到原有 `octo_test/server/.env`、旧 guide 路径及当前目录 `server/.env`。只调整文件查找顺序与对应 Skill 说明，并删除脚本注释中未实现的环境变量覆盖描述；SQL 与快照逻辑不变。

本机独立执行提取出的 `find_env` 已选中生产路径，仅检查文件存在性，未读取环境文件内容、连接数据库或摄入 Ticket。脚本每次执行时选择环境文件，本次不需要重启 Octo 进程。

## 后续事项

周期摄入仍需独立实施。启动前明确使用生产还是测试数据、处理范围与频率，并沿用 raw 多版本幂等、逐票断点恢复、缺证保留与草稿审核边界。v1 没有创建新任务调度或切换取证数据源；v2 仅调整取证脚本的环境文件优先级，不创建调度；历史重评待办仍由[原任务](2026-09-22-historical-skip-reprocess.md)管理。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-10-12 | v1 | in_progress | 完成工作树、相关文档、外部 Skill/Schema、main 目录/构建产物、PM2、cron/timer、健康状态及安全日志摘要核对。 | 整理现有文档并检查差异；不运行真实业务流程。 |
| 2026-10-12 | v1 | done | 更新 IT Platform Sync 的更新链路与过期路径权限表；为 09-17 实体任务补适用日期提示，更新任务索引。文档本地链接、围栏、空白及差异检查通过。 | 核查与文档交付完成；周期摄入未实施，生产问答/写入未做端到端验收。 |

| 2026-10-12 | v2 | done | guide 脚本已增加生产首选路径，Skill 与 IT Platform Sync 说明同步；脚本语法、5 种隔离环境选择场景、本机路径选择及差异检查通过。 | 未连接生产数据库或运行真实 Ticket 摄入；未提交或发布。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 只读部署核查 | 通过 | PM2 live 摘要、main 分支及 HEAD、生产 dist 与环境白名单、cron/timer 计数 | 不输出完整环境、凭证、业务消息或响应正文；不执行部署 |
| 已部署运行时检查 | 健康及轮询确认 | 3000/3030 health 200，2026-10-12 生产同步成功及 Shadow 轮询日志 | 不证明 Wiki 问答或 Document 业务成功 |
| 文档静态检查 | 通过 | 本轮新增/修改说明的本地链接与标题锚点存在；围栏及空白检查、`git diff --check` 和差异复核通过 | 仅文档变更，不运行应用测试；外部 URL 未做可达性检查 |
| v1 单测 / mock integration / live E2E | 未执行 | v1 无行为修改 | 未触发真实模型、Lark/Octo 写入或 wiki 摄入 |
| v2 静态 / 隔离模拟 | 通过 | `bash -n`；提取真实 `find_env`，将路径映射至临时文件，验证生产优先、3 级回退及无文件共 5 场景；两个仓库差异检查 | 无数据库连接，不新增应用测试 |
| v2 本机路径选择 | 通过 | 独立执行实际 `find_env` 返回生产 `octo/server/.env` | 只验证文件选择，不证明生产数据库连接成功或数据完整 |

文档链接检查限定本任务全文与 IT Platform Sync 本次新增/修改行，结果通过。额外全文件扫描发现 IT Platform Sync 既有 `../../tasks/engineering-ops/2026-09-16-disable-staging-platform-worker.md` 相对路径无效，位于本次差异外，未扩展修复。
