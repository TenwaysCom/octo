---
title: "插件与 Server 版本更新至 0.10.0"
module: engineering-ops
status: done
requirement_version: 2
created_on: 2026-09-13
updated_on: 2026-09-13
closed_on: 2026-09-13
owner: Codex
related:
  - "../../../extension/manifest.json"
  - "../../../server/package.json"
---

# 插件与 Server 版本更新至 0.10.0

## 目标与范围

将对外插件版本由 `0.9.1` 更新为 `0.10.0`；按用户追加要求将 Server 包版本从 `0.8.2` 更新为 `0.10.0`，FE 包版本保持不变。

## 方案与验收

- [x] 更新 `extension/manifest.json`；WXT 从该文件读取版本和生成插件名称。
- [x] 构建产物版本为 `0.10.0`，名称为 `Tenways Octo 0.10.0`。
- [x] `server/package.json` 版本为 `0.10.0`；pnpm lockfile 不保存项目自身版本，无需修改。

## 进展与验证

2026-09-13：`pnpm --dir extension build` 通过，已读取 `.output/chrome-mv3/manifest.json` 验证版本与名称。本次仅修改版本声明，未新增测试，未打包 zip 或发布。

2026-09-13（v2）：追加 Server 版本更新；JSON 版本一致性与差异检查通过，仅修改包元数据，未重跑 Server 业务测试。

2026-09-13：用户要求补充 Git 标签；将版本声明与 Release Notes 一并提交，`0.9.1` 指向 `55aa4fa230b535097c773365f9cb466165420fe6`，`0.10.0` 指向包含本记录的版本提交。使用无 v 前缀的 annotated tags，执行结果以 Git refs 为准；不推送远端。
