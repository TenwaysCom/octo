---
title: "Wiki 问答模型 HTTP 429 排障与修复"
module: "ai-ticket"
status: in_progress
requirement_version: 1
created_on: 2026-10-15
updated_on: 2026-10-21
closed_on: null
owner: Codex
related:
  - "2026-09-11-wiki-qa-quick-action.md"
---

# Wiki 问答模型 HTTP 429 排障与修复

## 目标

定位用户遇到的 Wiki 问答模型调用失败，修复已确认原因及必要诊断；不扩展检索能力或更换模型服务商。

## 验收标准

- [x] 从日志及最小调用确定失败阶段和服务商拒绝原因。
- [x] 修正1113对应的错误提示及安全日志，并覆盖回归。
- [x] 验证当前真实模型完整调用链，明确真实 Wiki/浏览器验收边界。
- [x] 明确本地验证、真实调用与部署边界。

## 背景与范围

10 月 13–15 日 app 日志的 2186 次 Wiki 模型失败均为 extract 阶段 ZCODE_REQUEST_FAILED；关联 ZCode 日志均为 HTTP 429。现有 adapter 不读取服务商错误码，无法区分额度和频率限制。已有 platform-auth/platform-sync 用户改动保持原样。

## 方案与决策

真实 Wiki retrieve/共享 completion adapter 最小合成问题请求确认 HTTP 429 / 服务商1113，错误文本符合余额/资源包不足分类；不是仅凭429推断限流。当前端点为智谱通用 API，不能据此断言 Coding Plan 套餐状态或擅自切换端点。

Adapter 只保留1–8位数字错误码至 `providerErrorCode`，不记录服务商消息/正文。Wiki 对1113使用固定余额/资源包不足提示；保留既有 `WIKI_QA_MODEL_FAILED` error envelope、actionRunId和阶段，其他失败仍用原提示。不自动重试、切换服务商或修改凭证。

11:12:36 再次最小调用已返回HTTP200（提取约1547ms），本轮未更改余额/资源包或env，不能推断恢复原因或宣称稳定恢复。真实 Wiki 完整验证被自动审批拒绝（内部知识内容发送至外部模型服务），已请求本次验证授权；授权前改用完全合成内存候选，不读取本地 Wiki/数据库。代码未部署。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-10-15 | v1 | in_progress | 日志定位至 server.wiki_qa.extract；429 在约百毫秒返回，未进入召回。sandbox 最小调用重现相同用户错误，但网络受限，不能用该次调用认定服务商原因。 | 需读取服务商安全错误码。 |
| 2026-10-15 | v1 | in_progress | 获准的真实网络最小调用确认429/1113；回归先红（原代码5项失败），修复后4文件92项通过。11:12:36 同配置真实提取复核已200。 | 上游恢复原因未知；真实 Wiki 完整验证自动审批拒绝，等待授权并以合成资料继续，未部署。 |
| 2026-10-15 | v1 | in_progress | 完全合成问题+内存候选，真实智谱提取/回答和SiliconFlow专用重排全部成功；5阶段完成、证据1篇、答案262字符。 | 未访问真实Wiki/数据库，不能替代实际Ticket与浏览器验收；真实Wiki授权仍待答复。 |
| 2026-10-21 | v1 | in_progress | 提交前复核：相关4文件92项测试、`pnpm --dir server exec tsc --noEmit` 和 `git diff --check` 均通过；按用户要求提交并推送此修复及配套文档。 | 本轮未进行真实模型、真实Wiki、浏览器或部署验证；保留其他任务的工作区改动。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 运行时日志 | extract 的上游 HTTP 429 | server/logs/app.2026-10-{13,14,15}.1.log | 原日志未保存服务商错误码 |
| 真实模型最小调用 | 修复前429/1113；修复后11:12:36提取200、约1547ms | 合成问题经真实 Wiki retrieve + ZCode adapter；actionRunId=wiki-qa-429-diagnostic-20261015 | reader注入空候选，只到extract；未改余额/配置，不能推断上游恢复原因 |
| 真实模型完整链路（合成资料） | extract/retrieve/rerank/evidence/answer均完成；证据1篇、答案262字符 | actionRunId=wiki-qa-synthetic-full-20261015；promptStore注入内置提示词，reader注入完全合成候选 | 真实模型/专用重排，合成知识；无本地Wiki/数据库内容，非实际Ticket或浏览器E2E |
| 单测 / mock adapter链路 | 4文件92项通过 | `pnpm --dir server exec vitest run src/adapters/zcode/zcode-chat-client.test.ts src/application/services/wiki-qa.service.test.ts src/adapters/ai/ticket-summary-client.test.ts src/application/services/lark-ticket-wiki-qa.test.ts` | 含429/1113及不泄漏原始错误文本；没有真实数据库/平台写入 |
| 静态检查 | 通过 | `pnpm --dir server exec tsc --noEmit`；`git diff --check` | 未写dist，未部署/重启 |
| 真实Wiki完整问答 / 浏览器E2E / 部署验证 | 未执行 | - | 真实Wiki验证被自动审批拒绝，待授权；本轮不执行浏览器或部署 |

## 关联

- [Wiki 问答实现记录](2026-09-11-wiki-qa-quick-action.md)
