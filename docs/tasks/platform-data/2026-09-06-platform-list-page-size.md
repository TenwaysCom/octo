---
title: "Platform 列表单页上限调整为 1000"
module: "platform-data"
status: done
created_on: 2026-09-06
updated_on: 2026-09-06
owner: TBD
---

# Platform 列表单页上限调整为 1000

## 目标

将 Web 的 Lark Ticket、Meegle 工作项和 GitHub PR 列表统一改为每页最多 1000 条；前端请求值与服务端 DTO 上限必须一致。

## 验收标准

- [x] 三类平台列表的 FE 请求均携带 `limit=1000`。
- [x] Server 接受 `limit=1000`，拒绝 `limit=1001`。
- [x] 分页 offset、筛选和旧响应兼容行为保持不变。
- [x] FE/Server 定向测试和构建通过。

## 范围与决策

- 仅修改 Web `/api/web/platform-data/*` 列表的页面大小，不改同步批次、知识检索、外部 API 或其他查询的独立 `500` 上限。
- 1000 条由现有 PostgreSQL 本地快照列表读取；不触发 Lark、Meegle、GitHub 或 Odoo.sh 请求。

## 进展记录

| 日期 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- |
| 2026-09-06 | done | 已将 FE `PLATFORM_DATA_LIST_LIMIT` 与 Server DTO `max/default` 同步为 `1000`，并覆盖请求值、offset、筛选、旧响应兼容和 `1001` 拒绝场景。 | 未执行真实平台或生产数据库请求。 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| FE 全量测试 | 通过 | `pnpm --dir fe test`：184/184。 | 不调用真实平台。 |
| Server 定向测试 | 通过 | `pnpm --dir server exec vitest run src/modules/platform-data/platform-data.controller.test.ts`：15/15。 | 不读真实数据库。 |
| Server 全量测试 | 通过 | `pnpm --dir server test`：155 个文件通过、1 个跳过；772 个测试通过、1 个跳过。 | 不读真实平台。 |
| FE 构建 | 通过 | `pnpm --dir fe build`。 | 未进行浏览器运行时验证。 |
| Server 构建 | 通过 | `pnpm --dir server build`。 | TypeScript 编译验证。 |
