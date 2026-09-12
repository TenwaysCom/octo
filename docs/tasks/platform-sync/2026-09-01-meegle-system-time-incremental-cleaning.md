---
title: "Meegle System 与时间字段增量清洗"
module: "platform-sync"
status: done
requirement_version: 1
created_on: 2026-09-01
updated_on: 2026-09-01
closed_on: 2026-09-01
owner: Codex
related:
  - "meegle_workitem_syncs"
  - "docs/tenways-octo/it-platform-sync.md"
---

# Meegle System 与时间字段增量清洗

## 目标

统一 Story、Tech Task、Production Bug 后续同步记录的 System、`item_start_time`、`item_finish_time` 与 `source_updated_at` 清洗。System 只保存 `eu`、`us`、`uk`；起止时间保存日粒度 `YYYY-MM-DD`；Meegle 更新时间保存秒粒度 `YYYY-MM-DD HH:mm:ss`。

不新增 `source` 字段，不执行历史 full、clean 或回填任务。标准 Bugs（`issue`）不在本次代码范围内。

## 验收标准

- [x] Story、Tech Task、Production Bug 的 System 使用类型专属字段并归一化区域。
- [x] `item_start_time`、`item_finish_time` 只使用源 `start_time`、`finish_time`，来源清空或非法时同步清空。
- [x] 增量 `updated_at` 保留 Meegle 秒级格式；非法游标记录写快照但不推进 checkpoint。
- [x] 未进入同步范围的历史记录保持不变，旧记录后续更新时使用新规则。
- [x] 完成项只有日粒度 finish 时不展示精确当前工作时长。
- [x] Server、FE 定向测试与 build/check 通过。

## 背景与范围

当前 lifecycle cleaner 会从 workflow node、状态和旧值推导 `item_start_time` / `item_finish_time`，并将时间统一为 ISO datetime。System 仍保存关系路径文本。增量 `updated_at` 会被转为 ISO，Production Bug 还使用 detail `update_time` 而不是 MQL `updated_at`。

## 方案与决策

- 使用共享 canonical cleaner，避免 full/single/incremental 保留两套时间语义；发布时只运行现有增量调度。
- Story System 优先 `field_0dba3a`，无法识别区域时 fallback `field_00f541`；Tech Task 使用 `field_6da66b`；Production Bug 继续使用 `field_4976fc`。
- 复用现有 `item_start_time` / `item_finish_time` 列，删除 workflow node、phase、旧值保留和创建时间 fallback。
- 空来源正常清空；非空非法时间或无法识别的区域清空并记录结构化告警。
- `updated_at` 异常时先写入本批快照与其他清洗结果，再令 scope 失败，保持旧 checkpoint 供幂等重试。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-01 | v1 | in_progress | 已完成代码与 Meegle 元数据现状核对；相关定向基线测试 53 个 Server tests 与 3 个 FE test files 通过。 | 实现 canonical cleaner、兼容查询和测试。 |
| 2026-09-01 | v1 | completed | canonical cleaner、MQL 秒级时间、混合格式查询/checkpoint、FE UTC 解析与日粒度完成时长边界已实现；标准 Bugs 保持未配置。 | 未运行真实 Meegle 增量、full、clean 或历史回填；部署后由既有 scheduler 捕获后续更新。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 定向测试基线 | 通过 | Server 4 files / 53 tests；FE 3 test files。 | 修改前基线，不代表新规则已验证。 |
| Server 定向回归 | 通过 | 13 files / 123 tests；`pnpm --dir server build` 通过。 | 使用 adapter/mock 与 pg-mem，未访问真实 Meegle/PostgreSQL。 |
| Server 广泛回归 | 通过（可运行范围） | 排除已知环境项后 129 files / 635 tests 通过。 | 当前 Node 无 `node:sqlite`；既有 logger 文件轮转测试存在 flush race，均与本任务无关。 |
| FE 全量检查 | 通过 | `pnpm --dir fe check`：29 test files + Vite production build。 | 未做登录态浏览器视觉检查。 |
| 运行边界 | 未执行（按范围） | 未调用真实同步、full、clean、backfill。 | 上线后只由现有增量 checkpoint 处理新建或更新记录。 |

## 关联

- `docs/tasks/platform-sync/2026-09-01-meegle-standard-bugs-cleaning-todo.md`
