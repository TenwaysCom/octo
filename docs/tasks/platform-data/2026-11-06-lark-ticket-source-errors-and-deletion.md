---
title: "Ticket 源记录错误识别与 Octo 删除标记"
module: "platform-data"
status: done
requirement_version: 1
created_on: 2026-11-06
updated_on: 2026-11-06
closed_on: 2026-11-06
owner: Codex
related:
  - "2026-11-06-lark-ticket-app-open-base.md"
---

# Ticket 源记录错误识别与 Octo 删除标记

## 目标

区分 Lark 源记录不存在、记录权限不足、授权失效与普通链接读取失败；在 Ticket AI 小窗和完整详情提供人工标记删除 Octo Ticket 的入口。

## 验收标准

- [x] `1254043` 和 batch_get 的 absent_record_ids 显示源记录不存在（可能已删除）；forbidden_record_ids 与授权错误不会误报删除。
- [x] 链接读取与字段写入使用对应业务错误，前端展示可操作提示；源记录不存在时暂停该 Ticket 后续属性修改，不影响其他 Ticket。
- [x] 有 platformSync 权限的用户可确认标记本地删除，重复请求幂等；保留源快照/AI/历史，不调用 Lark 删除 API。
- [x] 删除标记按完整 Base/Table/Record 标识隔离，普通列表、计数和小窗搜索排除；同步和链接/AI 更新不会清除标记。
- [x] 完成针对性测试、Server 构建、FE check 与文档更新，区分本地验证与部署。

## 背景与范围

用户提供的两条提示不能独自证明其指定 Ticket 已被删除；未提供 Ticket 标识，未访问真实平台记录或写入业务数据。当前源码对应链接入口只显示通用重试，未检出用户提供的完整提示文本，部署版本可能不同。本次基于当前工作树完善错误分类与本地删除能力，不扩展远端删除、自动删除、回收站或恢复界面。

## 方案与决策

- 仅明确 record-not-found 错误码或指定 record 的 absent 列表识别源记录不存在；一般 404、缺失共享 URL、空结果及权限失败不作为删除依据。
- 在 Lark adapter 提供错误分类，在 Server 转换为 Ticket 业务错误；保留 actionRunId 与结构化诊断。
- 本地删除标记保存于 Octo-owned 表，记录时间与操作人；普通列表/计数默认隐藏，不用可被同步清除的 stale 标记。人工确认可在没有有效 Lark 授权时完成。
- FE 两个入口复用相同删除控件，共享编辑队列阻止在途写入与删除竞争。
- 此编辑保护属于当前浏览器会话，不提供跨会话/跨进程互斥。保留缓存共享链接的原有行为，不增加主动存活检查。已删除标记不影响内部历史按引用读取；普通查询排除，字段写入拒绝。
- `lark_base_ticket_octo` 增加 nullable `deleted_at/deleted_by`，新库初始化与既有 schema migration 都覆盖；部署须同时更新 Server/FE 并应用 schema。本次未对真实库执行迁移，也未实际标记业务 Ticket。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-11-06 | v1 | in_progress | 定位 shared URL 服务忽略 absent/forbidden 与原始 API 错误；`pnpm --dir server test src/application/services/lark-ticket.service.test.ts` 新增三例全部复现失败（原有两例通过） | 用模拟响应复现错误分类缺口，不证明用户指定记录实际被删除 |
| 2026-11-06 | v1 | done | 完成 adapter 分类、共享链接及字段写入业务错误、两处确认入口、本地删除标记及列表/全局搜索过滤；原三例回归转绿，针对性 Server/FE 验证通过 | 未部署、未核对用户指定的真实 Ticket；旁边新出现的批量自动保存任务记录属于并行工作，保留未改动 |
| 2026-11-06 | v1 | done | 用户要求提交；将本次 34 个文件的改动从并行自动保存工作中分离，在 HEAD + 本次改动的临时副本重跑 Server 135 项、Server 构建及 FE 51 文件/构建，均通过 | 其他任务的 schema、辅助函数导出、路由与索引改动保留在工作区，不纳入本次提交；未推送或部署 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 回归复现 | 完成（3 例失败） | shared URL service 单测 | 使用合成 absent/forbidden/1254043 响应 |
| 静态检查 | 通过 | `git diff --check`、`pnpm --dir server build`、`pnpm --dir fe check` 中的 Vite build | 无部署或真实库迁移 |
| Server 单测 / service mock | 通过 | 8 文件 135 项：Lark client、auth factory、Ticket service/field service、controller/field controller、sync store、search store | Lark 全部 mock，PostgreSQL 使用 pg-mem |
| 入口及路由测试 | 通过（沙箱外复跑） | `pnpm --dir server test src/index.test.ts` 4 项 | 初次沙箱内 .env 子进程 stdout 为空，既有环境限制；沙箱外 4/4，不修改初始化逻辑 |
| FE 单测 | 通过 | `pnpm --dir fe check`，51 个测试文件 | 覆盖错误码透传、队列取消/隔离、删除等待/防重/失败重试/旧读取保护 |
| 浏览器模拟集成 | 通过 | `OCTO_FIELD_BROWSER_EXECUTABLE=/home/deploy/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome pnpm --dir fe exec node manual-tests/lark-ticket-field-edits.browser.mjs`，11 组 PASS | 沙箱禁止 localhost 监听，沙箱外执行；仅合成数据与模拟 API |
| 窄屏视觉检查 | 通过 | 浏览器 390px 无横向溢出断言及 `/tmp/octo-ticket-source-missing.png` 人工查看 | 合成源记录错误；不证明真实 Lark 环境 |
| live E2E / 已部署运行时验证 | 未执行 | - | 未部署、未进行真实平台写入 |

## 验收场景

- 链接读取返回 forbidden：显示联系管理员提示，允许授权/权限修复后手动重试；返回 absent 或 1254043：显示源记录不存在并暂停该 Ticket 后续属性写入。
- 同 Ticket 已排队多项修改，首项写入明确返回记录不存在：未发送项取消并还原，另一 Base/Table 的同 recordId 可继续保存。
- 删除确认取消：不请求 API；请求失败：Ticket 保持显示且可明确重试；成功：小窗/详情显示已删除，搜索立即隐藏，重新加载仍隐藏。
- 查看角色不显示按钮，伪造客户端操作人或无 platformSync 权限被 Server 拒绝；相同 Ticket 重复标记保留首次时间与操作人。
- 后续源同步、共享链接更新保留删除标记与已有 Shadow 数据；普通列表、计数、全局搜索及筛选项不返回已标记记录。

## 复盘

实际识别缺口是忽略 batch_get 的错误桶和吞掉原始平台错误码。可复用错误签名已记录为 [ERR-20261106-002](../../../.learnings/ERRORS.md#err-20261106-002-ticket-source-errors-collapse-to-shared-url-missing)。代码实现与模拟验证不能确认用户那一条 Ticket 的真实删除状态。

## 关联

- [任务台账](../README.md)
- [Lark 官方错误说明](https://open.feishu.cn/document/docs/bitable-v1/faq?lang=zh-CN)
