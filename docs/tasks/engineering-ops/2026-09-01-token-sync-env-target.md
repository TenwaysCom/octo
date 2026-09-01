---
title: "Token sync target follows server environment"
module: "engineering-ops"
status: done
requirement_version: 1
created_on: 2026-09-01
updated_on: 2026-09-01
closed_on: 2026-09-01
owner: TBD
related: []
---

# Token sync target follows server environment

## 目标

让 `make db-sync-test-user-tokens` 将测试库 token 同步到 `server/.env` 中 `POSTGRES_URI` 或 `DATABASE_URL` 指向的数据库，而非写死的开发库名。

## 验收标准

- [x] Make 目标不再传入固定目标数据库。
- [x] 未传 `--target-db` 时，脚本从连接串解析目标数据库名。
- [x] 显式 `--target-db` 仍可覆盖默认目标。

## 背景与范围

仅调整本地 token 同步脚本的目标库选择；不执行同步，不修改数据库内容。

## 方案与决策

保留 `TEST_DATABASE` 作为源库可覆盖项；目标库默认使用已加载环境连接串的 pathname。`--target-db` 保留给显式临时覆盖。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-01 | v1 | done | Makefile 移除固定目标库参数；`parseArgs` 单测覆盖环境连接串目标与显式覆盖。 | 未执行会写入真实数据库的同步命令。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 聚焦单测与 Make dry-run | 通过 | `pnpm --dir server exec vitest run src/scripts/sync-user-tokens.test.ts`（6/6）；`make -n db-sync-test-user-tokens` 未传固定目标库。 | 不连接或写入真实数据库。 |

## 关联

- [Tasks 台账](README.md)
