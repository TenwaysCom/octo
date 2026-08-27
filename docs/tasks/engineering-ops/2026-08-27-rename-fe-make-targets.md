---
title: "Rename FE Make targets"
module: "engineering-ops"
status: done
created_on: 2026-08-27
updated_on: 2026-08-27
closed_on: 2026-08-27
owner: TBD
related: []
---

# Rename FE Make targets

## 目标

将 FE 的 Make 目标 `make-fe-dev` 和 `make-fe-build` 分别改为 `fe-dev` 与 `fe-build`。

## 验收标准

- [x] `make fe-dev` 和 `make fe-build` 可被 Makefile 解析。
- [x] 项目指引不再引用旧目标名。

## 背景与范围

仅调整 Makefile 目标名及其项目内引用；不修改 FE 的 Vite 或后端 API 配置。

## 方案与决策

移除 `make-` 前缀，与现有 `server-dev`、`ext-dev` 命名保持一致。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-08-27 | done | Makefile 与 AGENTS.md 已改为 `fe-dev`、`fe-build`；Make dry-run 已通过。 | 未启动 Vite，也未执行实际构建。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Make dry-run | 通过 | `make -n fe-dev` → `pnpm --dir fe dev`；`make -n fe-build` → `pnpm --dir fe build` | 不启动开发服务器或构建。 |

## 关联

- [Tasks 台账](../README.md)
