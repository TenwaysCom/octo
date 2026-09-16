---
title: "健康检查迁移到 /api/health"
module: "engineering-ops"
status: done
requirement_version: 1
created_on: 2026-09-14
updated_on: 2026-09-14
closed_on: 2026-09-14
owner: Codex
related: []
---

# 健康检查迁移到 /api/health

## 目标

将健康检查纳入 `/api/` 命名空间，避免占用 FE 根路径。

## 验收标准

- [x] 注册 `GET /api/health`，移除 `GET /health`。
- [x] 健康检查仍无需身份头，响应内容保持不变。
- [x] 同步 API 目录、启动日志、当前 README 和部署示例。

## 背景与范围

现有 Nginx `/api/` 代理可覆盖新路径。历史设计和历史实施计划保留原始记录。

## 方案与决策

更新 Server 路由及鉴权精确豁免；删除部署文档中的旧 `/health` 独立代理。外部探针需要使用新路径。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-14 | v1 | done | 路由、鉴权、目录、日志及文档已更新；新增路由和匿名访问回归断言 | 未部署、未修改实际 Nginx 或外部探针 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 构建 | 通过 | `pnpm --dir server build` | 当前工作区 |
| 定向测试 | 26 通过，1 排除 | `pnpm --dir server test src/index.test.ts src/http/api-auth.test.ts src/modules/public-config/public-config.controller.test.ts -t 'index routes\|api auth\|public-config'` | 排除入口日志初始化测试 |
| 全量测试 | 928 通过，1 失败，1 跳过 | `pnpm --dir server test`；入口 `.env` 日志测试期望 `ENTRY_LOG_LEVEL=debug`，子进程 stdout 为空 | 未处理该日志测试失败；包含工作区原有其他改动 |

## 关联

- [部署说明](../../../fe/docs/deployment.md)
