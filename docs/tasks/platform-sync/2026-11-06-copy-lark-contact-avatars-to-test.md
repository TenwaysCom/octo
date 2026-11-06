---
title: "将 production 联系人头像补充到 tenways_octo_test_1021"
module: platform-sync
status: done
requirement_version: 1
created_on: 2026-11-06
updated_on: 2026-11-06
closed_on: 2026-11-06
owner: Codex
related:
  - "2026-11-06-lark-ticket-avatar-extraction.md"
---

# 将 production 联系人头像补充到 tenways_octo_test_1021

## 目标

按用户要求，从 production 的 `public.lark_contacts.avatar_url` 读取头像，按 `open_id` 补充至测试库 `tenways_octo_test_1021`。生产只读，测试库仅处理头像及其来源观察时间，保留已有联系人身份信息，不同步凭据或其他业务数据。

## 验收标准

- [x] 验证实际源库为 production `tenways_octo`、目标为 `tenways_octo_test_1021`，检查表结构及头像覆盖率。
- [x] 按 `open_id` 匹配，复制非空有效头像和已有来源观察时间，幂等补充目标头像列，不覆盖较新的头像观察。
- [x] 在目标库事务内写入，保留已有邮箱、姓名、Meegle 关联及创建时间；生产连接强制只读。
- [x] 提交前验证目标数据与源快照的预期差异及身份字段不变，提交后读回覆盖率；重复运行计划为零变更。
- [x] 仅记录数量、数据库名和验证边界，不输出头像 URL、人员资料或凭据。

## 方案与决策

- 复用 production `server/.env` 的连接配置，仅替换目标数据库名；连接后核对 `current_database()`，不修改环境文件。
- 先只读检查两库结构及缺口，再在测试库的单一事务中幂等补列及写入。事务失败回滚，不执行整库迁移。
- 来源头像和新旧判断以本次只读固定快照为准；不触发 Ticket 提取、外部平台调用、服务重启或部署。
- 只读预检：源库 198 位联系人、113 个有效且有观察时间的头像；目标 182 位联系人且缺少头像两列。113 人中，98 人已在目标库，15 人尚不存在。目标新增的 15 人仅写 open ID、头像、来源观察时间和建档时间，不拷贝生产邮箱、姓名或 Meegle 身份。
- 目标事务先锁定联系人表，再补列、增量 upsert、核验原有身份字段及预计行数，全部一致才提交；任一断言失败整批回滚。提交后再次只读核验，重复执行应无待写记录。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-11-06 | v1 | in_progress | 已确认本仓库 server/.env 的非敏感摘要为 NODE_ENV=production、数据库 tenways_octo；已保留既有工作区改动 | 继续数据库只读预检及目标事务同步 |
| 2026-11-06 | v1 | in_progress | 两库 READ ONLY 预检通过：源 tenways_octo 的 113 个有效头像均有观察时间；目标 tenways_octo_test_1021 缺头像两列，98 人匹配、15 人需仅按 open ID 新建 | 目标单事务写入及读回待完成 |
| 2026-11-06 | v1 | done | 目标单事务已提交：新增 avatar_url/avatar_source_synced_at 两列，更新 98 位联系人头像，新增 15 位仅含 open ID 与头像的联系人。目标总数 182 → 197，头像 0 → 113。提交前及提交后只读断言：113 个头像和观察时间全部与源快照一致，原有身份资料及未涉及联系人的更新时间未变，重复执行待写数 0。生产连接始终 READ ONLY | 未部署或重启，不代表 Ticket UI 已展示头像 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 源/目标数据库只读预检 | 通过 | 配置 NODE_ENV=production；两连接 current_database() 分别断言 tenways_octo / tenways_octo_test_1021；源 198 人、113 个有效头像；目标 182 人、头像列缺失 | 未输出连接串、原始人员记录或 URL |
| 目标真实写入与读回 | 通过 | source 默认事务只读且 SHOW transaction_read_only=on；目标单事务表锁、两列 ADD COLUMN IF NOT EXISTS、按 open_id 条件 upsert，written=113（updated=98 / inserted=15）；提交前及提交后断言全部通过 | 生产无写入；仅向明确目标库复制头像及观察时间，新增联系人身份资料为空 |
| 幂等与资料完整性 | 通过 | 目标 197 人，其中 113 人有头像；113 个头像及观察时间与源固定快照一致；原有 email/name/meegle_user_key/created_at 全部不变，其他联系人 updated_at 未变；repeatPendingUpdates=0 | 以只读重复计划验证，无需再次写入；未来源变化不在本次快照内 |
| 静态检查 | 文档 diff check 通过 | `git diff --check` | 本次未改应用代码，无需重新跑应用单测或构建 |
| 部署 / FE E2E | 未执行 | - | 数据操作不包含部署、重启或头像 UI 接入 |
