---
status: active
owner: TBD
last_reviewed: 2026-08-24
scope: Octo 开发、排障和文档治理任务的共同工作规范
update_required_when:
  - 任务记录、验证或交付要求变化
  - 开发流程的阶段或责任边界变化
---

# 开发工作规范

本文档规定所有开发任务的共同流程；它不替代 extension、server 或跨层边界的具体规则。

## 1. 开始前

1. 在 `docs/tasks/` 查找或新建任务记录，写清目标、验收标准、范围和不在本次范围内的内容。
2. 判断改动的主要 owner：`extension`、`server`、`adapter`、平台配置，或 `engineering-ops`。
3. 阅读对应规则；跨层 action 同时阅读 `system-boundaries-and-code-rules.md` 和相关 lifecycle。
4. 不清楚需求、数据影响或兼容策略时，先记录假设和待确认项，不把猜测直接写入实现。

## 2. 设计与实现

- 保持改动最小，避免顺带重构无关代码。
- 业务 workflow 放在 server；extension 只负责上下文、UI、授权触发和动作派发；平台调用放 adapter。
- 新增或重构跨层 action 时，保留 `actionRunId`、`layer`、`module`、`stage` 和 `errorCode`。
- API 输入使用 Zod DTO；服务通过显式依赖保持可测试；不在 workflow/popup 散落动态 `field_*`。
- 真实平台写入、授权、迁移或配置变更必须明确幂等性、失败处理、回滚或人工确认边界。
- 日志只写安全摘要，绝不写 token、cookie、完整 auth code 或敏感平台 payload。

具体约束见 [跨层边界规则](system-boundaries-and-code-rules.md)、[Extension 规则](extension-code-rules.md) 与 [Server 规则](server-code-rules.md)。

## 3. 验证

1. 运行与改动相称的最小检查：格式/类型检查、相关单测、构建或 E2E。
2. 将验证结果分为静态检查、单测、mock integration、live E2E、已部署运行时验证；不得混称。
3. 涉及平台写入时，记录安全的响应摘要、结果 ID 或 read-back；HTTP 2xx 本身不等于业务成功。
4. 未执行的验证必须说明原因、风险和下一步，不以本地检查宣称已部署或生产生效。

## 4. 交付

- 在任务记录中更新状态、实际结果、证据、验证边界和后续动作。
- 修改了跨层契约、生命周期、运行时配置或测试入口时，同步更新对应 `docs/ai-dev/` 文档。
- 提交前检查差异范围和格式；提交说明只描述实际变更与已完成验证。
- 复杂任务结束时，将可复用经验写入 `.learnings/`，失败信息不含敏感数据。

## 完成检查

- [ ] 目标和验收标准已满足，或未满足部分已明确标记。
- [ ] 代码归属、错误与日志契约符合对应规则。
- [ ] 验证证据及其边界已记录。
- [ ] 相关任务与治理文档已更新。
