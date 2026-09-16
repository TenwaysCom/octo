---
title: "Prepared messages 富文本清洗与匿名发送者保留"
module: "ai-ticket"
status: in_progress
requirement_version: 2
created_on: 2026-09-14
updated_on: 2026-09-16
closed_on: null
owner: TBD
related:
  - "2026-09-01-internal-it-support-copilot.md"
---

# Prepared messages 富文本清洗与匿名发送者保留

## 目标

将消息中的序列化 JSON 和富文本节点转换成忠实、可读的 prepared messages，供 FE 查看及 AI 分析使用。发送者继续显示“用户 1 / 用户 2”，原始消息及 senderId 保留用于追溯。代码已实施，dev 库目标表历史回填及读回已完成；FE 可视验收仍待执行。

## 背景与范围

用户提供的完整样本包含两条消息：第一条是 post，content 为 JSON 字符串，内部 content 与 content_v2 重复，包含段落、text、at 和样式；第二条是 text，但 content 仍为包含 text 字段的 JSON 字符串。另一个粘贴片段是截断的 prepared text，只用于观察现象，不作为有效 JSON fixture。

当前 prepareTicketThread 直接对 message.content 做正则脱敏，没有按消息类型解析；因此 JSON 结构、转义及重复正文进入 text。当前 hasArtifact 将所有 post 当成无附件，无法识别富文本内图片。AI Session 的 formatThreadContext 未传递已有 senderLabel。

涉及 Server 的消息准备、快照存储及读取、既有回填脚本、AI 上下文；FE 消费同一结果。清洗逻辑归属 Server，不在 FE 或 Extension 重复实现。

不包含：个人画像、通讯录姓名查询、跨平台身份合并、全文人名匿名化、AI 总结、角色推断、OCR、附件下载、完整卡片渲染、新增对外接口或部署。真实历史 prepared 数据回填纳入交付；执行前落实目标环境及 baseId/tableId 范围。本轮仅更新需求，不执行数据库写入。

## 方案与决策

### 1. 发送者与证据

- 原始 messages_json 不因清洗改写，senderId 保留在原始层；prepared 不新增原始发送者 ID 或真实发送者姓名。
- 沿用现有线程内排序及编号规则：相同 senderId 对应相同“用户 N”，不同 senderId 分开；相同快照重复准备结果一致。编号不作为跨 Ticket 的身份主键；历史补入更早消息可能重排编号，不承诺跨快照固定。
- 缺少 senderId 沿用通用“用户”标签，不分配可关联编号，也不据此认定这些消息来自同一人。bot/system/unknown 保持既有角色标签。
- 保留 messageId、replyTo、createdAt、senderRole、senderLabel；沿用按 messageId 去重、过滤 deleted、排序逻辑。
- AI 上下文与 FE 都保留 senderLabel。正文中的说话人、被 @ 人与外层发送者分别处理，不推断负责人或把转述归入发送者观点。

### 2. 正文解析合同

清洗顺序：按消息类型识别结构 → 提取内容 → 保留段落与非文本占位 → 执行现有脱敏 → 输出。使用确定性解析，不调用 LLM。每条消息打平成一个 text 字符串，不保留富文本嵌套节点；不同消息仍独立，保留身份、时间和回复关系。

| 输入 | 预期行为 |
| --- | --- |
| text 的合法消息包装 JSON，仅含 text 字段且值为字符串 | 提取 text，不输出外层包装；只解包一层。其他历史 JSON 正文（例如 error/code 对象）保留原文并执行既有脱敏 |
| 历史直接纯文本 | 保留文字、换行；不能仅因包含花括号就丢弃正文 |
| post 的标题和二维节点数组 | 非空标题置首；同行节点顺序拼接，行间换行，保留段落边界；连续空行最多保留一行 |
| content 与 content_v2 | 优先采用结构有效且有内容的 content；否则回退到有效 content_v2。两者绝不串接；两者不同也按该规则选取，不猜测合并。这是本需求的确定性选择规则，不代表平台版本语义 |
| text 节点 | 保留原文、数字、标点及节点间原有空格；丢弃 style 等展示字段，不能把单词粘连或额外插入空格破坏词句 |
| at 节点 | 有 user_name 时输出 @名称；缺少名称及可靠映射时输出 [未知提及]。@_user_N 不能当成 senderLabel，也不能跨消息自行关联 |
| 普通文本中的 mention 占位符 | 有该消息可靠元数据时解析；当前样本无映射，输出 [未知提及]，不能从另一条消息借用同名占位符 |
| 链接节点 | 保留显示文字与链接目标；无文字时保留目标。输出仍经过现有脱敏，不新增链接抓取 |
| 图片、文件、音视频 | 在原位置保留 [图片]、[附件：名称]、[音频]、[视频] 等占位；无名称时用通用占位。附件存在即 hasArtifact=true，包括 post 内嵌资源；用原 messageId 回溯，不向 AI 新增下载凭据或资源原始 key |
| 未支持节点/消息类型 | 保留已识别的相邻文字，未知部分用 [不支持的内容] 占位，不输出整段节点 JSON |
| 已识别为结构化消息但 JSON 损坏或结构无效 | 输出 [消息内容解析失败]，保留消息身份及证据，不中断整条线程、不输出原始 JSON；诊断只记录安全的消息标识、类型和原因 |
| 空消息 | 普通空正文输出 [空消息]；已知图片、文件、音视频即使元数据缺失或损坏，仍按类型输出附件占位并保留 hasArtifact=true |

支持范围以本样本的直接 post 结构及上述常见节点为准。语言包装结构、其他平台节点变体在实施时用现有代码或脱敏 fixture 核实；未证实的格式走明确降级，不承诺全量覆盖。

正文已有姓名和 mention 显示名保留；本次延续现有邮箱、订单/工单引用脱敏，不扩展新的个人信息识别规则，也不将结果称为“全文匿名”。清洗不摘要、不翻译、不修正原文、不把一条转述消息拆成多个真实发送者消息。

### 3. 缓存及消费一致性

- 提升现有 prepared 清洗版本（当前 redactionVersion=v2），使旧 prepared 缓存失效；沿用从已存原始消息重建的读取回退机制，不触发外部同步。
- 仅清洗规则变化不改变原始 snapshotVersion；清洗版本与源快照版本分别表达不同含义。
- 同步生成、读取回退、既有回填脚本使用同一清洗入口；读取回退不自动写库。
- FE prepared-messages API 和 AI 上下文消费同一版本结果；AI 原有长度限制不在本次调整，小样本必须完整传递。
- 既有离线回填维持默认 dry-run、范围限定及并发快照保护。实施阶段需要完成目标范围真实 apply 与读回，不重跑既有 AI 结果。v1 中排除真实历史回填的决策由本版替代。

### 4. 历史数据回填

- 处理目标范围内 prepared 缺失、清洗版本过旧或与源快照不匹配的记录；从当前 messages_json 重建，不重新拉取 Lark 消息。
- 顺序：dry-run 统计 → 抽样比对 → 分批 apply → 数据库读回 → 再次 dry-run。已为当前清洗版本且匹配源快照的记录跳过。
- 只更新 prepared_messages_json；原始消息、senderId、源 snapshotVersion 及既有 AI 结果不变。
- 并发变化的快照跳过，基于最新快照重试；原始消息缺失或损坏单独记录异常，不以空数组覆盖旧结果。
- 记录扫描、待处理、更新、已是新版、并发跳过、失败数量与剩余清单，不记录完整敏感正文。中断后可重跑，已完成记录不重复写入。
- 完成要求：范围内可处理记录全部对应当前清洗版本和源快照；剩余异常逐项说明原因与处理安排，不能把未解释的遗漏报为全部完成。

## 验收标准

以下按实际验证层级记录；单测通过不代表真实回填或界面验收完成。

| 编号 | 输入/场景 | 通过条件 |
| --- | --- | --- |
| A1 | 用户提供的两条完整消息，经替换真实 ID/姓名后制成 fixture | 输出仍为两条消息；post 正文只出现一次；text 消息只输出内部文字；无结构性 tag/style/content_v2 等 JSON 噪声 |
| A2 | 样本的业务内容 | 原有三项入库前置条件、2–3 days、5 or 7 days、最后的问答逐字保留且顺序正确；只允许格式规范化及约定脱敏，不以总结代替原文 |
| A3 | 同人多条、不同人、缺少 ID、bot/system | 同人同编号、不同人不同编号；缺失 ID 不编造身份；prepared 不含原始 senderId；保留角色标签 |
| A4 | 两个正文副本相同/不同、content 无效或为空 | 有效 content 优先；无效或空时回退 content_v2；任一场景均不重复拼接；全部无效时明确降级 |
| A5 | 非空标题、分段、空行、同行拆分文字与样式 | 标题和段落可读；不丢数字、标点和空格；去除样式不改变句义 |
| A6 | 已命名 at、无名 at、不同消息同名占位符、正文转述 | 已知名称保留；未知标明未知；不跨消息错配，不与“用户 N”混淆；转述不改变外层发送者 |
| A7 | 链接、post 内图片、独立附件、混合及未知节点 | 链接文字与目标保留；非文本占位在原位置；post 内附件 hasArtifact=true；纯文本 post=false；未知节点不吞相邻正文 |
| A8 | 纯文本、空内容、损坏 JSON、错误字段类型 | 纯文本兼容；空/失败有明确占位；单条异常不丢弃其他消息；不把原始结构 JSON 当正文输出 |
| A9 | 邮箱及订单引用出现在提取后的文字/链接显示文本中 | 现有 [EMAIL]/[REFERENCE] 规则仍生效；原始 messages_json 内容保持不变 |
| A10 | 重复/删除消息、回复、相同时间排序 | 既有去重、过滤、证据关联及确定性顺序不回归；相同输入重复执行结果一致 |
| A11 | 旧版缓存、新版缓存、同步及回填 | 旧版从原始记录重建；新版复用；源 snapshotVersion 不因清洗改变；dry-run 不写库，过期快照 apply 不覆盖新快照 |
| A12 | 同一 Ticket 的 API、FE 弹窗、AI 上下文 | 展示清洗正文、用户 N、时间；AI 收到 senderLabel；两侧不再自行解析或使用旧 JSON 正文 |
| A13 | 目标范围真实历史回填 | dry-run 不写库；apply 后读回正文已打平且用户编号保留；原始消息及源版本不变；重复执行无重复更新；并发与异常可追踪，剩余数量可核对 |

- [x] A1–A10：清洗与兼容性用例通过。
- [x] A11：缓存、持久化及回填保护用例通过（mock 数据库）。
- [ ] A12：API/AI 集成断言及 FE 可视检查通过。
- [x] A13：dev 库目标表真实历史回填及数据库读回验收完成。
- [x] Server 测试与构建通过；未修改 FE。

## 验证方式

1. 单元测试：在 support-ticket-analysis.test.ts 使用替换身份的样本及合成边界 fixture，断言完整 expected text 和字段；不只断言 contains，避免漏检重复和丢段。
2. 集成测试：覆盖 thread store、回填脚本、prepared-messages controller、AI Session；验证原文未变、旧缓存重建、版本边界、label 传递与安全降级。数据库模拟结果明确标记为 mock，不当作真实落库证明。
3. 包级验证：执行 pnpm --dir server test 与 pnpm --dir server build；FE 有改动时执行 pnpm --dir fe test、pnpm --dir fe build。
4. 可视验收：在本地或测试环境用同一合成 Ticket 打开 Prepared messages，逐条核对用户标签、段落、mention 和附件占位；比对 API 与测试捕获的 AI 上下文。无环境时明确记为未验证，不用单测替代。
5. 历史回填：落实环境及 baseId/tableId 范围，保存 dry-run 统计；抽样覆盖纯文本、富文本、mention、附件和异常记录后，分批 apply。读回检查清洗版本、正文及用户标签，用原文摘要与源版本比对确认原始记录未被改写。再次 dry-run 核对幂等性和剩余项，记录异常及并发重试结果。真实数据库证据不能以单测或读取时临时重建代替。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-14 | v1 | planned | 根据用户样本及现有 prepare/store/session 代码建立需求；确认匿名标签保留、结构解析及验收矩阵 | 尚未实现、运行测试、写数据库或部署 |
| 2026-09-14 | v2 | planned | 纳入真实历史回填，新增 A13；明确每条正文打平为一个字符串 | 环境及范围待落实；A1–A13 均待实施验收，本轮未写数据库 |
| 2026-09-14 | v2 | in_progress | 在 codex/fix/prepared-cleaning worktree 实现确定性正文解析、v3 清洗版本、AI senderLabel 传递、回填原始结构校验与异常清单；加入匿名样本和固定预期正文 | 未部署；真实 apply 与 FE 可视验收未执行 |
| 2026-09-14 | v2 | in_progress | 当前配置库 tenways_octo_ly_0913，只读统计/dry-run：baseId=XO0cbnxMIaralRsbBEolboEFgZc、tableId=tblUfu71xwdul3NH，共 1849 条，候选 1849、外层无效记录 0、写入 0 | 已询问是否使用此库，尚未收到目标确认；不能推断为 two15 测试库 |

| 2026-09-16 | v2 | in_progress | 用户授权执行 dev backfill：扫描 1849、更新 1848、跳过已为 v3 的 1 条；失败/无效/并发跳过均为 0。提交后全量读回与当前清洗代码一致，其他列摘要全部不变，再次 dry-run 候选为 0 | A13 完成；FE 可视和部署未验证 |

## 验证

2026-09-16 dev 单条写回：用户明确要求更新上述样本记录。对 tenways_octo_ly_0913 中 baseId=XO0cbnxMIaralRsbBEolboEFgZc、tableId=tblUfu71xwdul3NH、recordId=recvenQiyGTgMU 使用事务行锁，仅更新 prepared_messages_json，实际更新 1 条。提交后重新查询确认清洗版本 v3、源 snapshotVersion=1、保留 2 条消息及匿名标签；原始 messages_json 与其余列全部未变。已验证正文去重与时间说明保留。此步骤授权及证据仅限单条记录；后续全表回填结果见验证表，FE 可视验收仍未完成。

2026-09-16 dev 只读样本验证：用户指定使用 dev 库测试预览；实际连接当前配置 tenways_octo_ly_0913，以 BEGIN READ ONLY 读取此前讨论的 EMTC 入库 Ticket（recvenQiyGTgMU，源快照 v1）。库中 prepared 仍为 v2，当前源码在内存生成 v3，未执行 UPDATE 或回填。原始 post 有 15 行且 content/content_v2 相同；输出保留两条独立消息及“用户 1 / 用户 2”。断言验证正文仅出现一次、2–3 days 与 5 or 7 days 等细节和最后问答保留、replyTo 不变、text 为字符串且无节点结构和 senderId。普通文本的未知 mention 明确显示 [未知提及]。完整内容仅生成于本地临时预览文件，不写入任务台账。此项不等于 FE 可视验收或批量回填。

评审修复：保留历史 JSON 故障正文，仅对单字段 text 包装解包；附件类型优先于正文/元数据判断。已补充原文/包装两种 JSON、邮箱脱敏、空/损坏附件元数据及线程投影回归用例。初次构建发现 unknown 类型在布尔别名后未收窄，改用直接类型守卫；最终构建通过。评审修复阶段未执行数据库写入。

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 需求核对 | 已完成 | 样本结构与现有清洗/快照代码检查；A1–A13 对应验收场景 | 仅为需求定义 |
| Server 全量测试 | 168 files 通过、1 skipped；936 tests 通过、1 skipped | NODE_OPTIONS=--experimental-sqlite ./node_modules/.bin/vitest run | 之后增加单个失败写入测试及未知消息类型修正，另做定向回归 |
| 定向集成 | 5 files / 28 tests 通过 | 清洗、Store、回填、AI Session、Controller | 使用 mock PostgreSQL；不等于真实数据写入 |
| 最后定向回归 | 2 files / 10 tests 通过 | 清洗及回填测试 | 包含失败写入继续处理、合并转发降级 |
| TypeScript build | 通过 | ./node_modules/.bin/tsc | 与 server build script 相同；pnpm 自动依赖安装检查在链接依赖的 worktree 中拒绝非 TTY，故直接调用已有工具 |
| 评审修复回归 | 6 files / 33 tests 通过；类型守卫调整后清洗 7 tests 再次通过；tsc 通过 | 清洗、Store、回填、AI Session、Controller | 本轮修复验证；未新增线上或回填证据 |
| 合并回当前工作目录 | 13 个任务文件内容一致；6 files / 33 tests 通过；tsc 与 diff --check 通过 | /Users/linyu/proj/octo，feat/add_octo_fe | 保留其他未提交文件；以未提交改动合入，没有数据库回填或部署操作 |
| 历史数据只读预览 | 1849 条记录，18713 条有效消息 | dry-run 和按消息类型的本地清洗统计 | 原始 post 中无效 JSON 均为已删除空消息；已过滤。其他未知类型/节点显式降级，无外部消息拉取 |
| dev 真实回填 | 完成，1849 条均为 v3 | 当前库 tenways_octo_ly_0913；baseId=XO0cbnxMIaralRsbBEolboEFgZc、tableId=tblUfu71xwdul3NH；实际更新 1848，已是当前版本 1；二次 dry-run 候选 0 | 全量 preparedMismatch=0，排除 prepared 列后其余所有列哈希一致；未调用 Lark API或重跑 AI |
| FE 可视 / 部署 | 未执行 | - | 数据库回填不等于 FE 可视或线上服务验证 |

## 关联

- [既有消息准备任务](2026-09-01-internal-it-support-copilot.md)
- [消息清洗](../../../server/src/domain/support-ticket-analysis.ts)
- [快照存储](../../../server/src/adapters/postgres/lark-ticket-thread-sync-store.ts)
- [AI Session](../../../server/src/application/services/lark-ticket-ai-session.service.ts)
- [回填脚本](../../../server/src/scripts/backfill-lark-ticket-prepared-messages.ts)

## 风险与后续

已有原始存储类型不包含完整 mentions 元数据，无法可靠还原所有普通文本 @占位符，本次显式降级。用户画像与外部匿名数据集另立需求。本次根因是将消息类型特定的结构化载荷当成普通字符串，已加入结构解析测试。批量清洗预览不能只看外层记录有效率，相关跨任务规则见 LEARNINGS 的 inspect-content-degradation-before-backfill。

当前实现已按用户要求从 /Users/linyu/proj/octo-prepared-cleaning 合入 /Users/linyu/proj/octo 的 feat/add_octo_fe 工作目录；原 worktree 保留。运行旧版本的服务若再次同步仍可能生成 v2 prepared；实际回填应明确与服务版本切换的顺序，不能把一次回填当成线上持续生效证明。
