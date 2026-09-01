---
title: "从 Meegle role_members 清洗相关人"
module: "platform-sync"
status: completed
requirement_version: 3
created_on: 2026-09-01
updated_on: 2026-09-01
closed_on: 2026-09-01
owner: TBD
related:
  - "2026-08-28-meegle-current-owner-assignee.md"
  - "../../tenways-octo/it-platform-sync.md"
  - "../platform-data/2026-08-18-meegle-workitem-detail-prd.md"
---

# 从 Meegle role_members 清洗相关人

## 目标

从已同步 Meegle 工作项 payload 的 `role_members` 清洗出带角色语义的“相关人”，保存为可按工作项、人员和角色快速查询的 PostgreSQL 关系投影，并在 Octo FE 的 Meegle 列表、看板和 Sprint 工作项视图中紧凑展示。

“负责人”仍严格取 `current_status_operator`，不与角色成员合并，也不使用角色成员作为 fallback。本任务不修改 Meegle 工作项，不建设跨平台人员主数据，不把 payload 中的 email 复制到新表，也不追溯角色成员的历史变化。

## 验收标准

- [x] Cleaner 能从 `role_members[].{key,name,members[]}` 产出稳定、去重、保序的角色成员关系；角色名和成员名去除首尾空白。
- [x] 同一人员出现在不同角色时分别保留；同一角色内重复人员只保留第一次出现的位置。
- [x] `role_members` 缺失、明确存在但没有成员、以及成员字段非法三种情况有不同且经过测试的处理语义。
- [x] PostgreSQL 使用独立关系表保存相关人；列表读取和人员筛选不解析 `payload_json`，也不增加 `related_people_json` 双写列。
- [x] 对单个工作项、当前列表页的一批工作项、指定人员关联的工作项均有索引支持，并以聚焦集成测试验证没有 N+1 和全表 JSON 扫描。
- [x] 清洗写入与同一工作项的标量清洗在一个事务边界完成；失败时不留下半套关系投影，也不推进同步 checkpoint。
- [x] 现有 payload 可通过本地 clean/backfill 重建关系表；缺少 `role_members` 证据的快照不推断人员。
- [x] Web API 返回按角色分组的类型化 `relatedPeople`，人员筛选使用稳定 `memberKey`，不以可变姓名作为查询键。
- [x] FE 明确区分“负责人”和“相关人”；紧凑视图有完整 popover/辅助文本，空值不回退到负责人。
- [x] Server/FE 聚焦测试、Server build 和 FE build 通过；全量测试的既有失败单独记录。
- [x] Meegle 列表提供 `Subscribed` 快速过滤，并由 Server 使用当前登录用户的稳定 `meegleUserKey` 查询相关工作项，不向 FE 暴露该 key。
- [x] `Subscribed` 与右侧自定义过滤、Sprint/项目/优先级标签过滤按 AND 组合；手动多选“相关人”保持组内 OR，并作为独立条件与 `Subscribed` 按 AND 组合。

## 背景与范围

2026-09-01 对 PostgreSQL 快照做了只读、聚合级审计，没有输出人员姓名、email 或 user key：

- `meegle_workitem_syncs` 共有 1,236 条快照，1,029 条 payload 含 `role_members`。
- 这些 payload 含 5,500 个角色定义，其中 2,330 个角色带 `members`，合计 2,515 条成员关系。
- 已观察路径统一为 `fields.work_item_attribute.role_members`；角色项实际结构为 `{ key, name, members? }`，成员项实际结构为 `{ key, name, email }`。
- `role_members` 覆盖率按工作项类型不同，旧 payload 缺失时不能把“没有证据”解释成“人员已清空”。
- 部分角色名存在首尾空白；很多角色定义没有成员，因此不能把角色定义数量当作相关人数。

当前 `meegle_workitem_syncs.assignee` 只是 `current_status_operator` 的展示投影。若在 API 查询时临时解析 `payload_json`，既无法稳定按人员反查，也会让列表协议重新依赖平台原始 shape，因此相关人应成为 Server owned 的规范化技术对象。

## 方案与决策

### 1. 清洗对象与规则

新增领域投影 `MeegleWorkitemRoleMember`：

```ts
type MeegleWorkitemRoleMember = {
  roleKey: string;
  roleName: string;
  memberKey: string;
  memberName: string;
  roleOrder: number;
  memberOrder: number;
};
```

由独立纯函数从 `MeegleWorkitem.fields.work_item_attribute.role_members` 读取该投影，不做无边界递归 key 搜索，也不要让 Store 或 FE 识别平台原始 JSON。规则如下：

1. `roleKey`、`memberKey` 必须是非空稳定 key；不以姓名或 email 合成 key。
2. `roleName`、`memberName` 做 `trim`；名称缺失时使用对应稳定 key 作为保守显示值。
3. 只输出有合法成员的关系；没有 `members` 或 `members=[]` 的角色不落空关系行。
4. 以 `(roleKey, memberKey)` 去重并保留首次出现的 `roleOrder/memberOrder`；人员跨角色出现时不合并角色语义。
5. email 不进入清洗对象、API 或 FE。本期没有邮件查询和跨平台身份匹配需求。
6. Cleaner 返回 `{ present, members }`：`present=false` 表示当前 payload 证据不完整，增量清洗不得删除已有投影；`present=true, members=[]` 表示源 payload 已明确观察到当前没有角色成员，应清空旧投影。

### 2. PostgreSQL 表结构

首版只增加一张当前关系表，不增加人员主表和角色定义表：

```sql
CREATE TABLE meegle_workitem_role_members (
  project_key text NOT NULL,
  work_item_type_key text NOT NULL,
  work_item_id text NOT NULL,
  role_key text NOT NULL,
  role_name text NOT NULL,
  member_key text NOT NULL,
  member_name text NOT NULL,
  role_order integer NOT NULL CHECK (role_order >= 0),
  member_order integer NOT NULL CHECK (member_order >= 0),
  synced_at text NOT NULL,
  PRIMARY KEY (
    project_key, work_item_type_key, work_item_id, role_key, member_key
  ),
  FOREIGN KEY (project_key, work_item_type_key, work_item_id)
    REFERENCES meegle_workitem_syncs (
      project_key, work_item_type_key, work_item_id
    ) ON DELETE CASCADE
);

CREATE INDEX meegle_workitem_role_members_member_idx
  ON meegle_workitem_role_members (
    member_key, project_key, work_item_type_key, work_item_id
  );
```

主键前缀直接支持“按一个或一批工作项取相关人”；反向索引支持“某人员关联哪些工作项”。角色筛选若进入首版 API，再增加 `(project_key, work_item_type_key, role_key, member_key, work_item_id)` 索引；没有对应查询前不预建额外索引。

暂不拆 `meegle_members`：当前关系只有约 2,500 行，姓名随同步覆盖即可。只有出现跨项目人员目录、人员资料页或统一身份匹配需求时，再把人员资料升级为独立主数据对象。

### 3. 写入、清洗与回填

- 扩展 `MeegleWorkitemCleaningInput`，携带 `roleMembers: { present, members }`。
- `applyMeegleWorkitemCleaning` 改为事务执行：先更新标量清洗投影；仅在 `present=true` 时删除该工作项旧关系并批量插入当前关系。
- 删除和插入按一个工作项原子替换；不逐成员做 read-modify-write。
- 清洗变化判断同时比较规范化后的关系集合，避免内容未变时反复重写。
- 现有 `platform:clean-meegle` 作为 PostgreSQL-only backfill 入口：只读取已存 payload 并写新关系表，不访问或修改 Meegle。
- backfill 首次运行时，新表为空；1,029 条含路径快照会参与语义判断，其中只有实际含成员关系的工作项写入关系行；缺失 `role_members` 的旧快照保持无投影。后续正常同步取得完整 payload 后再补齐。
- 清洗计数应区分“工作项发生变化”和“写入多少关系”，避免把 2,515 条关系误报为 2,515 个工作项。

### 4. 快速查询与 API

列表读取不解析 `payload_json`：

1. 先按现有筛选和分页取工作项页。
2. 用这一页的完整复合 ref 批量查询关系表，按 `roleOrder/memberOrder` 聚合；不能只按可能冲突的 `workItemId`，也不能逐工作项查询。
3. Service 将平铺关系组装成稳定 DTO：

```ts
relatedPeople: Array<{
  roleKey: string;
  roleName: string;
  members: Array<{ memberKey: string; name: string }>;
}>;
```

按人员查询先用 member-leading 索引从关系表选出匹配的完整工作项复合键，再由列表 `items` 与 `count` 复用同一半连接筛选语义。实现不得只按可能冲突的 `workItemId` 匹配：

```sql
SELECT DISTINCT project_key, work_item_type_key, work_item_id
FROM meegle_workitem_role_members
WHERE member_key = ANY($member_keys)
```

Web query/DTO 使用可重复的 `relatedPerson` 稳定 key；多选首版按“任一人员匹配”。API 同时返回去重后的人员筛选选项 `{ memberKey, name, roleNames }`，名称和角色摘要只用于展示。重名时 FE 用角色摘要辅助区分，不把姓名作为请求值。

### 5. FE 展示

- 普通 Meegle 列表新增“相关人”列，放在“负责人”之后。单行先显示最多两个 `角色 · 姓名` 紧凑项，其余使用现有 `+N` popover；popover 按角色分组显示全部人员。
- 表格模式的单元格和紧凑行复用同一个 formatter，完整 `title/aria-label` 使用“角色：姓名、姓名；…”格式。
- 看板右上角继续只显示 Current owner，不把相关人混入负责人头像。若“相关人”列可见，则在卡片 floating meta 中显示角色摘要和完整 popover。
- Sprint 工作项视图复用相同 DTO，但相关人来自工作项当前快照，不是 Sprint 当时的历史角色；列名显示为“当前相关人”以免误解。本期不构造角色成员历史。
- 增加按相关人筛选，选项 value 使用 `memberKey`、label 使用姓名；筛选交给 Server，避免只过滤当前分页数据。
- `relatedPeople=[]` 时显示 `-`，不回退到 `assignee`。首版不支持按多值相关人排序或分组，避免定义不稳定的首值语义。

### 6. 不采用的方案

- **查询时解析 `payload_json`**：会产生 JSON 扫描、难以按稳定人员 key 建索引，并让 API 依赖平台原始结构。
- **在工作项表增加 `related_people_json`**：显示方便，但反向人员查询和角色筛选差，还会与关系表形成双写事实。
- **只保存逗号拼接姓名**：丢失角色、稳定人员 key 和重名区分能力。
- **立即建设人员主表**：当前没有人员目录、跨项目资料或身份合并需求，超出本任务范围。

## 实施顺序

1. 增加纯 cleaner、领域类型和覆盖缺失/空数组/去重/保序的单测。
2. 增加 PostgreSQL schema、Kysely 类型、事务替换写入和 Store 测试。
3. 执行本地 payload backfill，核对工作项数、关系数、重复键和缺失证据边界。
4. 扩展列表筛选、批量读取、DTO/controller 测试，验证索引查询路径。
5. 扩展 FE parser、相关人 formatter、普通列表/看板/Sprint 展示和人员筛选测试。
6. 更新技术对象 lifecycle 与平台同步说明，再执行 Server/FE 聚焦测试、build 和全量验证。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-01 | v1 | planned | 已完成代码路径核对和 PostgreSQL 聚合审计；确定使用当前关系表、稳定人员 key、Server 筛选与按角色 FE 展示。 | 尚未实现 schema、cleaner、API、FE 或 backfill；角色历史明确不在本期。 |
| 2026-09-01 | v2 | completed | 完成纯 cleaner、事务化关系投影、批量查询、memberKey 筛选、API/FE 展示、schema 迁移和 PostgreSQL-only 回填；二次回填为 0 变更。 | 不保留相关人历史；缺少路径的 207 条旧快照保持未知，等待未来正常增量详情补齐。 |
| 2026-09-01 | v3 | completed | 完成 Meegle `Subscribed` 快速过滤、Web 会话内部身份解析和独立 AND 查询条件；FE 将快速过滤、自定义过滤及标签过滤放入同一服务端请求，并保留/重置会话内筛选状态。 | 未绑定 Meegle 身份时返回 `MEEGLE_BINDING_REQUIRED`；未执行浏览器人工视觉回归。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| PostgreSQL 只读 shape 审计 | 通过 | 1,236 条快照；1,029 条含 `role_members`；5,500 个角色定义、2,515 条成员关系。 | 只输出 key、类型和聚合计数；未输出人员值，未写数据库或 Meegle。 |
| Server 聚焦测试 | 通过 | 7 files / 73 tests：cleaner、PostgreSQL Store、同步/读取/coordinator service、controller DTO、历史 clean CLI。 | pg-mem 验证事务边界、非法 payload 不写该工作项和失败不推进 checkpoint；外部 Meegle 未调用。 |
| Server build | 通过 | `pnpm --dir server build`。 | TypeScript 编译验证。 |
| FE test/build | 通过 | `pnpm --dir fe test`：28/28；`pnpm --dir fe build` 成功。 | 未执行浏览器人工视觉回归。 |
| PostgreSQL migration/backfill | 通过 | 迁移成功；1,236 candidates，首次 765 个工作项清洗变化，2,515 relations；二次运行 0 变化。 | 只读取已存 payload，不访问或修改 Meegle。 |
| PostgreSQL 完整性核对 | 通过 | 2,515 relations / 764 relation-bearing workitems；空字段 0、重复组 0、孤儿 0、member index 1。 | 只输出聚合计数，不输出人员资料。 |
| PostgreSQL 查询链路 | 通过 | 匿名 memberKey 抽样命中 27 条；列表返回前 10 条均经批量关系查询确认匹配。 | 不输出 memberKey、人员名或工作项值。 |
| Subscribed Server 聚焦测试 | 通过 | Store、Platform Data controller、Lark Web session 共 3 files / 44 tests；覆盖当前用户身份、未绑定错误、手选相关人组与 Subscribed 独立 AND、list/count 一致。 | 不访问 Meegle；身份 key 只在 Server 内部使用。 |
| Subscribed FE test/build | 通过 | `pnpm test` 通过 28 个 test files；`pnpm build` 成功。 | 覆盖请求序列化和与状态、Sprint、项目、优先级、相关人的组合；未执行浏览器人工视觉回归。 |
| Server 全量测试 | 有既有环境失败 | 127 files / 626 tests 通过；6 个 SQLite suites 因当前 Node 缺少 `node:sqlite` 未加载，`logger.test.ts` 日志文件轮转竞态失败。 | 本次相关人聚焦测试均通过；未扩大范围修复既有测试环境。 |

## 关联

- `server/src/adapters/meegle/meegle-client.ts`
- `server/src/application/services/meegle-cleaning.config.ts`
- `server/src/application/services/platform-sync.service.ts`
- `server/src/adapters/postgres/platform-sync-store.ts`
- `server/src/adapters/postgres/database.ts`
- `server/src/modules/platform-data/platform-data.dto.ts`
- `fe/src/services/platform-data/platform-data-api.js`
- `fe/src/lib/meegle-view-config.js`
- `fe/src/lib/platform-list-rows.js`
- `fe/src/pages/PlatformListPage.jsx`
