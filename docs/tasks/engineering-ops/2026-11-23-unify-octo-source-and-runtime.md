---
title: "统一 Octo 源码与部署运行产物"
module: engineering-ops
status: done
requirement_version: 1
created_on: 2026-11-23
updated_on: 2026-11-23
closed_on: 2026-11-23
owner: Codex
related:
  - "../platform-sync/2026-11-03-lark-thread-ticket-intake.md"
  - "https://github.com/TenwaysCom/octo/pull/189"
  - "https://github.com/TenwaysCom/octo/pull/190"
  - "https://github.com/TenwaysCom/octo/pull/191"
  - "https://github.com/TenwaysCom/octo/pull/192"
---

# 统一 Octo 源码与部署运行产物

## 目标

合并正式目录的两个独有提交与 GitHub main，整理现有 14 个修改文件和两个未跟踪文件，保留自动建单与 KCS 图片、审核能力。验证后提交推送，再以同一提交构建并部署正式服务和 KCS 独立 CLI。

## 验收标准

- [x] 整合结果保留本地 2794306、29ece33，以及 GitHub #189、#190、#191 的行为。
- [x] 原 16 个工作区改动均有保留或采用更新实现的对应记录，原始补丁可恢复。
- [x] 新构建的 LarkClient 同时提供 resolveClientThreadId、downloadMessageImage，自动建单和 KCS 图片、审核回归通过。
- [x] 统一源码提交已推送；正式服务及 KCS 独立 CLI 的产物来源可追溯到该提交。
- [x] 正式进程 online，健康与既有工单安全读回通过，原工作目录整理完成。

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
- [x] 独立评审、提交推送并核对 GitHub。
- [x] 从已推送提交部署正式服务及 KCS CLI，完成运行时读回与原工作区整理。

## 进展记录

| 日期 | 状态 | 结果与证据 | 下一步 |
| --- | --- | --- | --- |
| 2026-11-23 | done | PR #192 已合并，首轮部署提交 9c665ef。原工作区全部改动已整合或采用更新实现，源码工作区干净，原变更保存在 stash 18e0aceb2659697dd1251f3a7ac56a257f018b9c。实际生产产物、KCS 包和全部读回通过。 | 精确最终交付 SHA 与回滚路径以当前 runtime manifest/deployment.json 为准。 |
| 2026-11-23 | in_progress | 完整 server 回归、构建与实际 CLI 回放均通过。两项 Lark 方法同时存在，图片响应及 daily/backfill/review 正常。 | 独立评审、提交及统一部署。 |
| 2026-11-23 | in_progress | 完整快照保存 16 个文件；从 origin/main 建立独立 worktree，双方提交自动合并成功。按逐文件审计保留本地配置与文档，采用 GitHub 更新的 KCS 实现。 | 测试、构建和 CLI 验证。 |

## 验证

| 类型 | 结果 | 证据与边界 |
| --- | --- | --- |
| 静态差异 | 通过初查 | 合并无文本冲突；最终 diff 与链接检查待执行。 |
| 单测和模拟集成 | 通过 | 完整 server 回归 205 文件通过、2 文件跳过；1570 用例通过、7 用例按原配置跳过。 |
| 构建与实际 CLI | 通过 | server build 通过。实际编译版两项 Lark 方法为 function。图片 CLI 的 5 类响应、Guide daily/backfill 的跳过审核协议，以及隔离审核保存/发布/重试/图片预算回放均通过。模型和业务状态使用临时替身。 |
| 注释审查 | 通过 | comment_review 独立核对 client 的候选验证注释、intake 别名约束与新增抑制，0 项问题。 |
| 独立执行验证 | PASS+NOTES | 对比准确基线 24dfaa1 与提交 842b790，163 项聚焦测试通过。两边实际 dist 对照显示新版本同时保留两项 client 行为，图片响应与 daily/backfill/review 回放通过。证据在 `/tmp/octo-unify-independent-842b790/`。备注为两处证据路径，已追加勘误。 |
| 真实运行时 | 通过 | 12:06 正式 server、worker 与 KCS CLI 同源部署。完整 484 个 dist 文件哈希一致，两进程 online、watch=false，健康接口正常。实际安装产物通过 ID 解析和图片下载探针；DSH bridge 只读 list 成功；2560 的 Base、shadow=ok、标题、单条 Bot 确认与自有 +1 均读回通过。 |

## 决策记录

[本次决策与验证记录](2026-11-23-unify-octo-source-and-runtime.decisions.tsv)

验证命令与安全摘要保存在 `/tmp/octo-unify-20261123/`。`server-tests.log`、`server-build.log`、`vision-cli.json`、`contract-proof.json`、`pipeline-proof.json` 分别记录各层结果。环境未安装 cursor-team-kit 的 deslop/control-cli，本次以独立注释审查、仓库完整回归和实际编译 CLI 回放完成对应检查。

独立验证使用本环境可用的 OpenAI 模型，未取得跨供应商复核。原决策记录中的 `probe-app.log` 不存在，实际结果应读 `/tmp/octo-unify-independent-842b790/dist-probe.jsonl`。注释审查结果已归入上表，交付提交为 842b790，PR 为 #192。后续仅更新交付文档时按 server/src、package 和 ecosystem 的树差异确认验证仍覆盖实际代码。

## 生产交付证据

首轮统一部署于北京时间 2026-11-23 12:06 完成。GitHub PR #192 读回为 MERGED，合并提交 9c665ef365ea7fa1bc98bf623ab81875f34b257f，版本 0.12.2。正式 server PID 2613565、worker PID 2613559，入口和工作目录沿用原配置。KCS Guide 固定为 4bc5e2475d9dad96833c400c1db2aaecf01d5778。

新运行包的 manifest 只记录 484 个编译文件、package.json 和固定 Guide 的 24 个文件，共 509 个代码文件。日志、配置、缓存和外置业务状态不进入产物哈希。共享 .env/node_modules 仅记录链接目标。

`/tmp/octo-unify-20261123/deployment.json` 和实际 release 的 deployment.json 保存当前精确部署提交、进程与新旧目录。`installed-dist-proof.jsonl` 记录正式安装产物的两项 client 行为。DSH bridge 成功读取 17 条可审核项，只输出计数。工单 2560 读回确认 Bot 回复与 +1 各一个。此次生产验收使用既有工单和审核列表只读回查，模型及知识发布写入由隔离回放覆盖。

交付记录提交后按相同源码树重新构建，运行包 manifest 记录最终提交。旧 dist、旧 KCS 包、原始工作区补丁和 stash 均保留，业务状态继续使用外置原目录。
