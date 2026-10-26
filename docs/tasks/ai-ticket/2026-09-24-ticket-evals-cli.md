---
title: "Ticket AI Evals CLI 与单表人工标注"
module: ai-ticket
status: done
requirement_version: 1
created_on: 2026-09-24
updated_on: 2026-09-24
closed_on: 2026-09-24
owner: Codex
related: []
---

# 目标

实现单 Sheet Excel + 冻结消息输入的导出、人工标注导入、场景执行、DeepEval 评分、报告和同口径比较。直接在 feat/add-evals 开发。保留原 FE 集成评测，不修改其 CSV 契约。

## 验收标准

- [x] 只读导出前五分钟文本，Shadow 仅作参考；无效历史不纳入。
- [x] 一行 Ticket 可独立审核并拆为两个 Case；导入全量校验、原子发布、自包含。
- [x] Shadow 共用分析逻辑，Wiki QA 使用冻结消息和知识；评测不写业务数据。
- [x] Run/Score 分离，断点恢复、版本记录、报告及同口径对比。
- [x] 单元测试、mock 集成、Server 构建完成，记录真实模型与部署未验证边界。

## 方案与决策

Python 编排 + 本地 Node JSON 协议；固定执行器注册。真实数据在忽略的 evals/artifacts。两个场景分别人工审核。当前快照按根消息时间截取 [t0,t0+5m)，不承诺严格历史现场。配置及裁判显式选择；知识快照为当前知识，排除已识别同 Ticket 来源不保证消除全部间接泄漏。

## 进展记录

| 日期 | 版本 | 状态 | 结果 | 边界 |
| --- | --- | --- | --- | --- |
| 2026-09-24 | v1 | done | 完成 CLI、只读导出、共享服务、评分及报告；本地验证见下表 | 真实数据库/模型与部署未执行 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| Python 单元/mock 集成 | 16 tests 通过 | `evals/.venv/bin/python -m unittest discover -s evals/tests -v`；包括真实 DeepEval 4.1.0 + 本地假裁判、第三场景、恢复运行及版本对比 | 无模型 API 调用 |
| Server 全量 | 185 files / 1151 tests 通过，1 skipped | 在 server 下 `TMPDIR=/private/tmp NODE_OPTIONS=--experimental-sqlite node node_modules/vitest/vitest.mjs run` | Hermes live 协议测试按原有条件跳过；本地环回端口需沙箱外运行 |
| Server 目标回归 | 86 tests 通过；连接关闭调整后 adapter 2 tests 再次通过 | Shadow、Wiki QA、Eval service、只读 export adapter | mock 模型和数据库 |
| 编译 | 通过 | `node server/node_modules/typescript/bin/tsc -p server/tsconfig.json` | pnpm 自检会尝试重装依赖，使用已安装的相同 tsc/vitest |
| CLI 协议 | 通过 | 编译后的 `defaults` 子进程返回 JSON Prompt；`--help` 正常 | 未执行真实导出 |
| Excel | 回读、长消息/emoji 分列、公式文本化、标注往返通过 | Python 测试 | 未在 Excel GUI 验收 |
| 真实数据库/模型、评分校准、部署 | 未执行 | 本次实现不等于真实评测结果 | 需指定导出范围并人工标注，再跑小批真实模型与裁判校准 |

全量首跑的两个失败分别来自本地监听 EPERM 与 macOS `/var`/`/private/var` 临时目录比较。允许回环监听并使用规范化 TMPDIR 后全量通过，未修改无关业务代码。pnpm 的依赖清理拒绝沿用已有 ERR-20260827-010 处理。

## 交付内容

- [使用说明](../../../evals/README.md)：完整命令、配置、数据契约、Git 与知识泄漏边界。
- [CLI](../../../evals/cli.py)：export/import/run/score/report/compare。
- 场景注册包含参考字段、Excel 列、Prompt keys、知识需求、输出映射、规则。
- 导出时冻结数据库业务 Prompt，运行可显式覆盖；Run 保存最终模板、实际请求和代码/构建指纹。
- 原 FE/SSE 评测与现有 Eval 审核数据保持独立。

## 后续验收

选择小批 Ticket 导出、完成两种场景的人工标注，执行真实模型与裁判，人工校准阈值及评分偏差。0.7 仍是试验阈值，不接入发布门禁。
