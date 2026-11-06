---
title: "从 Lark Base Ticket 区间提取并增量保存人员头像"
module: platform-sync
status: done
requirement_version: 2
created_on: 2026-11-06
updated_on: 2026-11-06
closed_on: 2026-11-06
owner: Codex
related:
  - "../../../server/src/scripts/extract-lark-ticket-avatars.ts"
---

# 从 Lark Base Ticket 区间提取并增量保存人员头像

## 目标

提供离线脚本，从指定 Base/Table 和时间区间的 `lark_base_ticket_syncs.fields_json` 提取人员头像 URL，按 `open_id` 去重并增量更新现有 `lark_contacts`。不下载图片，不接入 FE、消息展示或定时任务。

## 验收标准

- [x] Base/Table 与开始、结束时间必填；时间带时区，区间为 `[start, end)`，默认按 `created_time`，可选 `source_updated_at`、`synced_at`。
- [x] 读取各字段的人员对象或人员数组，仅接受 `ou_` open ID 和 HTTP(S) `avatar_url` 的对象；异常来源有计数，不输出人员资料或 URL。
- [x] 按现有 `open_id` 去重，选最近同步的有效头像；不同人员即使 URL 相同仍保留各自映射。
- [x] `lark_contacts` 增加 `avatar_url`、`avatar_source_synced_at` 的代码及迁移完成；已有联系人只更新头像及观察时间，保留邮箱、姓名、Meegle 关联；新联系人按 open ID 建档，不推断邮箱/Meegle 身份。
- [x] 重复执行无重复记录，较旧来源不能覆盖较新来源；已有通讯录同步不清空头像。
- [x] 默认只读预览，只有 `--apply` 幂等补列并在事务内写入；不执行整库 bootstrap、不修改 Ticket 或认证资料。
- [x] 相关单测、数据库模拟集成和 server 构建通过；真实库验证明确区分只读预览与写入。

## 背景与范围

此前只读检查发现当前库 2,183 条 Ticket 的 `fields_json` 均有头像字段，常见于 `需求人[].avatar_url`、`Responsible[].avatar_url`；聊天快照没有发送者头像字段。现有 `lark_contacts` 无头像列。用户明确要求直接增量更新此表。

## 方案与决策

- 默认保存 URL，不持久化图片二进制。去重依据 open ID；不使用姓名、邮箱或 URL 合并联系人。
- 以源 Ticket 的 `synced_at` 表示头像的观察时间；同一批次时间相同按 record ID、字段名及 URL 确定稳定优先级。已有相同观察时间的头像不覆盖。它不是用户实际修改头像的时间。
- 增量为显式区间重复运行时的条件 upsert，不新增自动水位或调度。按 `synced_at` 选择后续区间可处理历史 Ticket 的新同步数据。
- 用户尚未指定真实写入区间与目标库；交付脚本及本地验证，真实查询只做预览。
- v1 独立头像表与 Base/Table 去重方案已 superseded，未实施。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-11-06 | v1 | in_progress | 已检查工作区，保留既有 FE 与任务文档改动；明确区间、去重及来源新旧规则 | 实现和验证待完成 |
| 2026-11-06 | v2 | in_progress | 用户指定改写 `lark_contacts`；修订验收、去重主键和迁移方案，全部验收重新打开 | 实现和验证待完成 |
| 2026-11-06 | v2 | done | 已完成脚本、联系人头像列、条件 upsert、读取投影及说明；35 个相关测试及构建通过。正式 pnpm 入口只读预览 43 条 Ticket → 126 个候选 → 33 位用户，跳过 0，写入 0。真实 PostgreSQL 临时表验证补列、幂等、身份字段保留、新旧观察门禁和整批失败回滚 | 未对 public 表补列或 apply，未部署；用户尚未指定实际写入区间 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 | server build、CLI help、diff check 通过 | `pnpm --dir server build`；`node server/dist/scripts/extract-lark-ticket-avatars.js --help`；`git diff --check` | 未部署 |
| 单测 / mock integration | 8 个相关文件、35 项通过 | avatar service/script、Postgres contact store/database、contact sync/resolver、Lark auth service、SQLite contact store 的定向 Vitest 命令 | 未运行完整 server 测试；pg-mem 的 conflict WHERE 不操作仍 RETURNING 差异见 [ERR-20261106-001](../../../.learnings/ERRORS.md#err-20261106-001-pg-mem-conflict-where-false-returning) |
| 当前配置库只读预览 | 43 条 Ticket，126 个候选，33 位用户，无无效来源或头像，写入 0 | `platform:extract-lark-ticket-avatars -- --base-id XO0cbnxMIaralRsbBEolboEFgZc --table-id tblUfu71xwdul3NH --start-time 2026-11-01T00:00:00+08:00 --end-time 2026-11-07T00:00:00+08:00` | 按 created_time；事务 READ ONLY，不补列、不写入；不是所有历史联系人数量 |
| PostgreSQL 合成集成 | 通过 | 会话临时表：旧表补列及重复迁移、两名联系人写入、重复/较旧/同时间写入返回 0、更新头像、通讯录刷新保留头像、约束失败整批回滚 | `search_path=pg_temp`，临时表断开即消失；public 业务写入 0，未测试多进程并发 |
| 真实业务库写入 / 部署 | 未执行 | - | 未提供执行区间；运行带 `--apply` 的脚本才补列及写入 |
