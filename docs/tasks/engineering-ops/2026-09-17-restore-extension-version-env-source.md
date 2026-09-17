---
title: "插件版本来源回退为 EXTENSION_LATEST_VERSION 环境变量"
module: engineering-ops
status: done
requirement_version: 1
created_on: 2026-09-17
updated_on: 2026-09-17
closed_on: 2026-09-17
owner: LIN Yu
related:
  - "../../../docs/prd-auto-update.md"
  - "../../../server/src/modules/public-config/extension-version.controller.ts"
  - "../../../scripts/deploy-prod-full.sh"
---

# 插件版本来源回退为 EXTENSION_LATEST_VERSION 环境变量

## 目标

`/api/extension/version` 的版本号来源从 `SERVER_VERSION`（`server/package.json#version`）回退为环境变量 `EXTENSION_LATEST_VERSION`（`server/.env`），回退值为 `0.8.1`。撤销 443d8fe（2026-07-14）引入的 server 包版本耦合。

不在范围内：443d8fe 同提交的跨层 action 重构；扩展侧 update-checker（只消费接口返回值，无需改动）。

## 背景与范围

自动更新接口最初（4756686）读 `EXTENSION_LATEST_VERSION`，`scripts/deploy-prod-full.sh` 部署时把 `extension/manifest.json` 的版本 sed 写入 `server/.env`。443d8fe 改为读 `SERVER_VERSION` 后，发布需手工保持 server 包版本与插件 manifest 一致（见 2026-09-13-extension-version-0-10-0 的连带版本提升），用户要求回退。回退后部署脚本的 sed 步骤自动恢复生效，无需改动。

## 方案与决策

- `extension-version.controller.ts`：`const version = process.env.EXTENSION_LATEST_VERSION || "0.8.1";`，移除 `SERVER_VERSION` 导入（`server-version.ts` 保留，启动日志仍使用）。
- 回退值 `0.8.1` 为用户指定原文，仅 env 未配置时生效；此时已装 0.9.0+ 插件因 `compareVersions <= 0` 不会弹更新。
- 同步修正文档与示例配置：`docs/prd-auto-update.md` 版本来源说明、`server/.env.example` 补回 `EXTENSION_LATEST_VERSION=`。

## 验收标准

- [x] controller 从 `EXTENSION_LATEST_VERSION` 读取，未配置时回退 `0.8.1`
- [x] 测试覆盖 env 配置与回退两条路径
- [x] server 全量单测与构建通过

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-17 | v1 | done | controller/test/.env.example/PRD 四处改完；server 967 项单测通过、build 通过 | 未做线上验证 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 单测 | 通过 | `extension-version.controller.test.ts` 2 项通过；server 全量 967 passed / 1 skipped | 仅覆盖本地代码路径 |
| 构建 | 通过 | `pnpm --dir server build`（tsc）无错误 | 未部署 |
| 运行时验证 | 未执行 | - | 生产 `.env` 变量由部署脚本同步，部署后需实测接口返回值 |

## 关联

- 历史决策：443d8fe（改为 SERVER_VERSION）、4756686（功能引入）
- 相关任务：[2026-09-13-extension-version-0-10-0](./2026-09-13-extension-version-0-10-0.md)
