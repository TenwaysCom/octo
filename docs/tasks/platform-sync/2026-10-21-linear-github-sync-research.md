# Linear GitHub 同步调研附录

调研日期：2026-10-21。供 Octo ticket → Lark 多维表同步优化任务引用；只采纳官方资料，未访问 Linear 内部代码或进行真实 GitHub 写入。

## 已证实的产品行为

| 事项 | 官方证据 |
| --- | --- |
| PR 集成与 Issues Sync 是两项能力 | PR/commit 关联用于驱动 Linear 工作流；Issues Sync 在 GitHub issue 与 Linear issue 之间同步数据。[Linear GitHub 文档](https://linear.app/docs/github#overview) |
| Issues Sync 的创建方向 | 配置 repo ↔ team；单向创建为 GitHub → Linear，双向创建支持两边。历史 issue 另需导入。[配置](https://linear.app/docs/github#configure-github-issues-sync) |
| 同步字段 | title、description、status、assignee、labels、sub-issues、comments、priority。GitHub Project 自定义状态不映射；assignee 依赖账号连接；评论仅同步指定 thread，允许内部讨论。[字段及限制](https://linear.app/docs/github#configure-github-issues-sync) |
| 用户能看到同步状态 | issue 顶部 banner 显示连接/同步状态及错误。[同步 banner](https://linear.app/docs/github#issue-sync-banners) |

## 快速体验的公开架构依据

Linear 官方说明客户端保存本地数据库，创建 issue、修改状态无需等待网络往返；离线恢复通过 checkpoint 获取变化。其有序 sync action log 用于客户端增量同步。[2026-08-18 官方工程文章](https://linear.app/now/rebuilding-delta-sync-read-path)

**可得出的结论**：客户端交互速度与外部 GitHub 写入完成是不同指标。**不能得出的结论**：GitHub API 也能在毫秒内写完，或 GitHub Issues Sync 使用相同的客户端同步管线。工程文章中的索引复制延迟也不是 GitHub 同步延迟。

## 事件、可靠性与证据边界

- GitHub 集成文档明确 commit linking 配置 Push webhook；它不能证明 Issues Sync 的全部内部事件及执行顺序。[commit linking](https://linear.app/docs/github#enable-commit-linking)
- Linear 公共 webhook 在数据变化时发 POST；响应超过 5 秒或非 200 会重试，间隔为 1 分钟、1 小时、6 小时，提供 delivery ID 和签名。这是开发者接口契约，**不是内置 GitHub 同步重试策略的公开说明**。[Linear Developers](https://linear.app/developers/webhooks)
- GitHub 建议 webhook 在 10 秒内确认接收，后台异步处理，使用 `X-GitHub-Delivery` 标识事件；同一事件重投沿用 delivery ID。[GitHub 最佳实践](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- GitHub 不自动重投失败 webhook，接收方需要自行补偿；不能假定 GitHub 会无限保证送达。[GitHub 失败投递处理](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries)

此次公开资料未找到：内置 Issues Sync 的延迟 SLA、持久队列/outbox、合并窗口、重试退避、字段冲突优先级、去重与防回环算法。不能声称 Linear 已公开上述实现。

## 对 Octo 的启发（设计推论，非 Linear 内部实现事实）

可借鉴的是“先让用户继续编辑，同时明确外部同步状态”。若采用异步持久任务，需分别显示 Octo 已保存、Lark 待同步/已同步/失败；失败可恢复且不能提示成外部已保存。短时间连续修改可合并字段，按 ticket 保序并防旧值覆盖新值。具体是否引入 outbox、修改 API 返回时机和冲突规则，应结合 Octo 当前数据主权及实现评审，不能只靠前端提前显示成功。
