# ACP 与 PM Analysis / Skills 结合讨论草案

## 1. 文档目的

这份文档只用于暂存当前讨论结论，供后续继续展开。

它不是：

- 已批准设计
- 当前实施计划
- 立即进入开发的需求定义

它的作用是回答一个后续问题：

> 如果未来要把 `skills` 能力和 `PM Analysis ACP` 结合，边界应该怎么划，演进顺序应该怎么排。

## 2. 当前已确认边界

截至目前，有 3 条边界不应混淆：

### 2.1 PM Analysis ACP V1

当前 ACP `V1` 仍然只做：

- `PM Analysis ACP Facade`
- 单个 `POST` 流式 chat 接口
- 首问创建 session
- follow-up 复用同一个 session
- rules-based follow-up
- `Managed Redis` session 持久化

不做：

- 通用 ACP gateway
- 通用 agent orchestrator
- `Kimi CLI` 作为 ACP `V1` 首发场景
- 自由 LLM follow-up

### 2.2 Kimi ACP Track

`Kimi ACP` 当前是独立验证轨道，目标是验证：

- 插件 -> 后端 -> `kimi acp`
- 单轮对话
- 单 session 多轮对话
- popup 中的 ACP event 渲染

它不是 `PM Analysis ACP V1` 的一部分。

### 2.3 Skills

`skills` 不能先假设为稳定能力直接落地。

当前更合理的定位是：

- 先做 capability-gated support
- 先看 `Kimi ACP` 实际暴露什么能力
- 再决定 UI、调用方式和权限边界

## 3. 推荐的结合方式

后续如果要把 `skills` 和 `PM analysis` 结合，建议分 3 层理解。

### 3.1 第一层：PM analysis -> skill suggestions

这是最稳的第一步。

流程：

1. `PM analysis` 先产出结构化快照
2. UI 基于快照展示推荐动作
3. 用户显式点击某个 skill
4. skill 基于这个快照继续执行解释、整理、起草等操作

这一层的特点是：

- `PM analysis` 仍然负责“找事实”
- `skills` 负责“围绕事实继续工作”
- 不会破坏现有 PM analysis 的确定性边界

推荐第一批只做这类 skill：

- `explain`
- `prioritize`
- `draft`
- `next-step`

### 3.2 第二层：PM analysis snapshot-powered skills

这一层比第一层更进一步：

- skill 执行时，不重新抓全量上下文
- 后端直接把 `PM analysis session snapshot` 作为输入喂给 skill
- skill 消费分析结果，而不是重新替代分析链路

这一层的价值是：

- snapshot 可缓存、可审计、可复用
- skill 与原始数据抓取链路解耦
- 后续无论 skill 落在 `Kimi ACP`、commands 还是其他 runtime，都可复用同一份结构化输入

### 3.3 第三层：PM analysis 作为 ACP capability

这是更远期的方向，不建议早做。

形态可能是：

- `PM analysis` 本身成为 ACP world 里的一个 capability
- agent / skill 可以主动调用它，拿到分析结果再继续执行

这一层的问题也最明显：

- `PM analysis` 和 agent runtime 会强耦合
- 会打穿当前 ACP `V1` 的边界
- 会把原本清楚的“分析链路”和“对话链路”混成一个系统

所以这一层只适合在前两层稳定后再讨论。

## 4. 推荐演进顺序

如果后续真的要走到 “PM analysis + skills” 的组合能力，推荐顺序是：

1. 完成 `PM Analysis ACP V1`
2. 完成 `Kimi ACP` 插件到后端的最小链路
3. 完成 `Kimi ACP` 的单 session 多轮和基础渲染
4. 基于 `PM analysis snapshot` 做推荐 skill
5. 只上线 read-only / drafting 型 skill
6. 最后才讨论 command-backed 或 action 型 skill

不要反过来先做：

- 自动建单
- 自动改状态
- 自动批量执行外部系统写操作

## 5. 建议的能力边界

如果未来加入 skill，建议按风险分层：

### 5.1 Read-only skills

示例：

- 解释 blocker 根因
- 重新排序风险
- 总结 stale item pattern

特点：

- 不写外部系统
- 最适合第一批接入

### 5.2 Drafting skills

示例：

- 起草催办消息
- 起草项目同步
- 生成下周推进建议

特点：

- 生成可审阅内容
- 仍然不直接执行外部写操作

### 5.3 Action skills

示例：

- 自动创建任务
- 自动更新状态
- 自动触发跨系统写入

特点：

- 风险最高
- 不应进入第一批
- 必须有明确 permission / approval 设计

## 6. 后续值得讨论的问题

后续如果继续展开，建议重点讨论这些问题：

1. `PM analysis snapshot` 的标准结构是否足够稳定，能否作为 skill 通用输入
2. skill 的入口是：
   - popup 推荐按钮
   - ACP command
   - 还是后续统一 capability surface
3. command 和 skill 的区分是否需要在 UI 上显式体现
4. write-action skills 的 approval boundary 放在 popup、backend，还是 ACP runtime
5. `PM analysis` 的 rules-based follow-up 和 `Kimi ACP` 的 skill follow-up 是否需要共用 transcript / session

## 7. 当前建议结论

当前最稳妥的方向是：

- 不把 `skills` 直接塞进 `PM Analysis ACP V1`
- 先把 `PM analysis` 和 `Kimi ACP` 两条线各自跑稳
- 未来优先做 `PM analysis snapshot-powered skills`
- 第一批只做 read-only 和 drafting 型 skill

一句话总结：

> `PM analysis` 先负责产出可信事实，`skills` 再负责围绕这些事实继续解释、整理和起草，而不是一开始就替代分析主链路。
