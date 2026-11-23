---
title: "统一 Octo 源码与部署运行产物"
module: engineering-ops
status: in_progress
requirement_version: 1
created_on: 2026-11-23
updated_on: 2026-11-23
closed_on: null
owner: Codex
related:
  - "../platform-sync/2026-11-03-lark-thread-ticket-intake.md"
  - "https://github.com/TenwaysCom/octo/pull/189"
  - "https://github.com/TenwaysCom/octo/pull/190"
  - "https://github.com/TenwaysCom/octo/pull/191"
---

# 统一 Octo 源码与部署运行产物

## 目标

合并正式目录的两个独有提交与 GitHub main，整理现有 14 个修改文件和两个未跟踪文件，保留自动建单与 KCS 图片、审核能力。验证后提交推送，再以同一提交构建并部署正式服务和 KCS 独立 CLI。

## 验收标准

- [ ] 整合结果保留本地 2794306、29ece33，以及 GitHub #189、#190、#191 的行为。
- [ ] 原 16 个工作区改动均有保留或采用更新实现的对应记录，原始补丁可恢复。
- [x] 新构建的 LarkClient 同时提供 resolveClientThreadId、downloadMessageImage，自动建单和 KCS 图片、审核回归通过。
- [ ] 统一源码提交已推送；正式服务及 KCS 独立 CLI 的产物来源可追溯到该提交。
- [ ] 正式进程 online，健康与既有工单安全读回通过，原工作目录整理完成。

## 范围与决策

使用独立 worktree 整合和构建。正式工作区在验证完成前保留原始改动。备份位于 `/tmp/octo-unify-20261123/`，含原 HEAD、文件哈希、完整工作区补丁和两个未跟踪文件。

本地起点为 29ece33314aa97a230cc977f8250909cda2fa6e2，GitHub 起点为 24dfaa15945bbf68369eb2235b4a2925fdb3e32c，共同祖先为 0a7c5db476fd015b79ca83dfd2363484282418fe。用户已明确授权提交、推送和部署。

| 原工作区内容 | 处理方式 | 依据 |
| --- | --- | --- |
| Shadow service、其测试、wiki-qa service、domain/wiki-qa、server-code-rules | 采用 GitHub 已提交内容 | 五个文件与 GitHub main 字节相同 |
| wiki-knowledge-reader、wiki-evidence、未跟踪 ticket-kcs.ts | 采用 GitHub 更新实现 | 保留较新来源筛选、取证、图片和审核协议实现 |
| Shadow 任务文档 | 采用 GitHub v21 | 旧本地 v17 已被后续版本覆盖 |
| package 0.12.2、PM2 watch 配置 | 保留本地改动 | 将既有运行约定与版本调整纳入提交 |
| platform-sync 任务和索引、engineering-ops 索引和 SSH 排障任务 | 保留本地改动 | 保存未提交历史及本次恢复、来源追溯证据 |
| ERRORS | 三方合并 | 同时保留数字话题链接、KCS 和本次编译产物覆盖故障记录 |

KCS Guide 继续使用当前 4bc5e24。部署复用现有进程名和配置，以完整一致构建替代跨源码基线的编译模块覆盖。本任务不新增通用安装器或 CI。

## 执行计划

- [x] 读取规则、保存原工作区备份、更新远端并建立独立 worktree。
- [x] 合并双方提交，审计原工作区每项变化，保留两项 Lark client 方法。
- [x] 执行 server 回归、构建及实际编译 CLI 的图片与审核验证。
- [ ] 独立评审、提交推送并核对 GitHub。
- [ ] 从已推送提交部署正式服务及 KCS CLI，完成运行时读回与原工作区整理。

## 进展记录

| 日期 | 状态 | 结果与证据 | 下一步 |
| --- | --- | --- | --- |
| 2026-11-23 | in_progress | 完整 server 回归、构建与实际 CLI 回放均通过。两项 Lark 方法同时存在，图片响应及 daily/backfill/review 正常。 | 独立评审、提交及统一部署。 |
| 2026-11-23 | in_progress | 完整快照保存 16 个文件；从 origin/main 建立独立 worktree，双方提交自动合并成功。按逐文件审计保留本地配置与文档，采用 GitHub 更新的 KCS 实现。 | 测试、构建和 CLI 验证。 |

## 验证

| 类型 | 结果 | 证据与边界 |
| --- | --- | --- |
| 静态差异 | 通过初查 | 合并无文本冲突；最终 diff 与链接检查待执行。 |
| 单测和模拟集成 | 通过 | 完整 server 回归 205 文件通过、2 文件跳过；1570 用例通过、7 用例按原配置跳过。 |
| 构建与实际 CLI | 通过 | server build 通过。实际编译版两项 Lark 方法为 function。图片 CLI 的 5 类响应、Guide daily/backfill 的跳过审核协议，以及隔离审核保存/发布/重试/图片预算回放均通过。模型和业务状态使用临时替身。 |
| 注释审查 | 通过 | 独立只读审查 0 项问题，无新增 lint/TypeScript 抑制。 |
| 真实运行时 | 待执行 | 验证同一提交的实际产物、进程和既有工单，使用安全摘要。 |

## 决策记录

[本次决策与验证记录](2026-11-23-unify-octo-source-and-runtime.decisions.tsv)

验证命令与安全摘要保存在 `/tmp/octo-unify-20261123/`。`server-tests.log`、`server-build.log`、`vision-cli.json`、`contract-proof.json`、`pipeline-proof.json` 分别记录各层结果。环境未安装 cursor-team-kit 的 deslop/control-cli，本次以独立注释审查、仓库完整回归和实际编译 CLI 回放完成对应检查。
