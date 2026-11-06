---
title: "Ticket 列表与详情使用联系人头像"
module: platform-data
status: done
requirement_version: 2
created_on: 2026-11-06
updated_on: 2026-11-06
closed_on: 2026-11-06
owner: Codex
related:
  - "../platform-sync/2026-11-06-lark-ticket-avatar-extraction.md"
  - "../platform-sync/2026-11-06-copy-lark-contact-avatars-to-test.md"
---

# Ticket 列表与详情使用联系人头像

## 目标

将用户截图中 Ticket 列表及详情的需求人、负责人首字头像接到已有 `lark_contacts.avatar_url`。v2 根据用户明确补充，覆盖点击人员后展开的选择列表：紧凑列表菜单、详情及 Lark App 人员选项复用同一头像缓存。不新增独立头像接口、外部拉取、数据库写入或部署。

## 验收标准

- [x] Server 从 Ticket 人员字段提取 open ID 和姓名，按 ID 批量读取联系人头像，仅返回最小人员投影；不按姓名匹配，不透出原始 fields_json、邮箱或其他联系人资料。
- [x] 列表及字段更新后的 Ticket 增加 requesterPeople/responsiblePeople 数组，旧姓名字符串及筛选行为保持兼容；缺少 ID/缓存或头像查询失败时保留首字显示。
- [x] 截图涉及的紧凑列表和详情属性显示真实头像，头像缺失/图片加载失败显示首字；现有尺寸、姓名和交互保持。
- [x] 人员编辑立即切换到新身份，成功接收新头像，失败恢复原身份及头像，连续编辑及旧响应不串人。
- [x] 人员选项接口在一批 ID 查询后返回可选 avatarUrl；同名人员按 ID 分别匹配，无 ID/缓存或查询失败保留首字，不使用源快照旧头像。
- [x] 列表菜单、详情及 App 的人员选择列表显示缓存头像，维持 16px、搜索、当前选中状态及点击保存；图片失败回退首字。
- [x] v2 相关 Server/FE 测试、构建及模拟浏览器验证通过，区分真实只读投影与 mock UI、部署边界。

## 方案与决策

- `lark_contacts` 是头像来源；源 Ticket 人员对象只提供 ID 与显示姓名，不直接暴露其旧 avatar_url。
- 每次列表请求最多一次批量查询头像，使用新增 optional deps 注入头像 store。列表使用既有登录和权限门禁，无逐人浏览器请求。
- 需求人/负责人编辑的伴随人员数组与字段值一起遵守既有队列、版本及回滚规则。
- v2 扩大到用户明确指出的人员选择菜单，沿用既有 field-options 接口，批量读取 lark_contacts，复用头像图片/首字组件并保留菜单尺寸。筛选栏圆点、看板聚合头像和登录用户头像继续维持既有行为。v1 排除人员菜单的决策 superseded。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-11-06 | v1 | in_progress | 已检查工作区并保留既有头像提取/数据复制及无关 FE 改动；确认列表和详情共用 LarkTicketResponsible，现有接口无人员 ID/头像投影 | 实现批量投影、展示和编辑一致性 |
| 2026-11-06 | v1 | done | 已完成联系人批量查询、最小人员投影、共享 User 图片/首字降级和编辑伴随数组；Server 79 项相关测试及 build、FE 51 个测试文件及 build、两组浏览器 mock 回归通过。目标测试库只读验证 1,000 条 Ticket 中 1,933 处人员展示、1,913 处有头像（105 位不同用户），批量查询 1 次；两个匿名头像请求均 200/image | 本次业务数据库写入 0，未部署；模拟浏览器不代表真实登录客户端验收 |
| 2026-11-06 | v2 | in_progress | 用户明确“点击人员后展开的选择列表”；更新范围、接口及菜单验收，重新打开受影响的验证 | 实现人员选项头像与菜单回归；v1 证据不替代 v2 验证 |
| 2026-11-06 | v2 | done | field-options 复用联系人 ID 批量查询并返回 avatarUrl；两个菜单组件复用 UserAvatar，保持 16px。新增同名不同 ID、缓存缺失/失败及最小输出用例；Server 62 项相关测试及 build、FE 51 个测试文件及 build 通过。更新后的浏览器回归验证列表负责人/需求人选择菜单的图片、搜索、选中、16px及缺图回退；详情及窄屏 App 菜单通过，既有展示与编辑回滚通过 | 未对业务库写入、未部署；全部菜单 API/图片为合成数据 |

## 失败与复核

- 无产品失败或新增可复用事故。复核了部分同步成功后的人员数组：后续读回只需人员 ID/姓名一致，就允许用新读取的头像替换临时首字，避免将图片 URL 变化当作身份不一致。
- 继续保留现有编辑队列的字段级回写边界；状态等非人员字段的旧响应不能覆盖正在编辑的人员数组。

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| v2 Server 单测 / 静态检查 | 4 个文件、62 项及 build 通过 | `pnpm --dir server test src/application/services/lark-ticket-people.service.test.ts src/application/services/lark-ticket-field-update.service.test.ts src/application/services/platform-data.service.test.ts src/modules/lark-ticket/lark-ticket-field-actions.controller.test.ts`；`pnpm --dir server build` | 新增选项头像按 ID 批量匹配、同名不同 ID、缺缓存/失败及源旧头像不透出；未跑完整 Server 套件 |
| v2 FE 单测 / 构建 | 51 个文件全部通过及 build 通过 | `pnpm --dir fe check` | 增加菜单模型保留 ID/头像用例 |
| v2 菜单浏览器回归 | 通过 | 以原 Chromium 命令运行更新后的 `manual-tests/lark-ticket-avatars.browser.mjs` | 本地模拟：列表负责人/需求人菜单图片、16px、搜索、当前状态、缺失/404回退、Esc关闭；详情搜索与当前状态、App菜单及窄屏；沿用 v1 徽章及编辑回滚检查 |
| 以下为 v1 历史证据 | 保留 | 不单独作为 v2 验证 | - |
| Server 静态检查 / 单测 / mock integration | build 与 6 个相关测试文件、79 项通过 | `pnpm --dir server build`；`pnpm --dir server test src/application/services/lark-ticket-people.service.test.ts src/application/services/platform-data.service.test.ts src/application/services/lark-ticket-field-update.service.test.ts src/adapters/postgres/lark-contact-store.test.ts src/modules/platform-data/platform-data.controller.test.ts src/modules/lark-ticket/lark-ticket-field-actions.controller.test.ts` | 未跑完整 Server 套件；覆盖同名不同 ID、缓存失败、最小输出、批量读取及更新后投影 |
| FE 单测 / 构建 | `check` 通过，51 个测试文件全部通过，构建通过 | `pnpm --dir fe check`；编辑队列新增人员数组连续保存、失败回滚及部分同步后的新头像用例 | 不等于真实平台写入 |
| 头像模拟浏览器 | 通过 | `OCTO_FIELD_BROWSER_EXECUTABLE=/home/deploy/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome pnpm --dir fe exec node manual-tests/lark-ticket-avatars.browser.mjs` | 合成 API/图片；验证紧凑列表、详情 19px、缺图/404、编辑成功及失败、390px 窄屏及 App，无横向溢出或 JS 异常 |
| 既有编辑浏览器回归 | 通过 | 同 Chromium 运行 `manual-tests/lark-ticket-field-edits.browser.mjs`；连续编辑、FIFO、导航回滚、App 六属性、只读权限及 Meegle 创建流程通过 | 全部模拟，无真实身份或平台写入 |
| 测试库只读投影 | 通过 | `tenways_octo_test_1021` 事务 READ ONLY；1,000 条指定 Base/Table 的源快照、1,933 处人员、1,913 处有效头像、105 位有头像用户；联系人批量查询 1 次，输出只含 name/userId/avatarUrl | 未写库；不是全部历史 Ticket 或浏览器登录/API 部署验证 |
| 真实头像匿名可读性 | 2 个样本通过 | 匿名 GET：两者均 HTTP 200、Content-Type image/*，不输出地址或图片内容 | 只代表当时样本可访问，不证明所有头像或未来 URL 一直有效 |
| 文档 / diff | 通过 | `git diff --check`、新增文件空白检查，更新跨层契约与 FE 说明 | 保留会话此前改动 |
| 部署 / 真实浏览器 E2E | 未执行 | - | 未部署到测试或生产；无服务重启、真实用户登录或客户端验收 |
