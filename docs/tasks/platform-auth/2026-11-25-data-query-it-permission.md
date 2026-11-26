---
title: "DSH 数据查询使用 Octo IT 角色授权"
module: "platform-auth"
status: in_progress
requirement_version: 2
created_on: 2026-11-25
updated_on: 2026-11-25
closed_on: null
owner: Codex
related:
  - "https://github.com/TenwaysCom/octo-dsh-plugins/issues/23"
  - "../../tenways-octo/18-user-identity-design.md"
---

# DSH 数据查询使用 Octo IT 角色授权

## 目标

在已认证的 `GET /api/web/profile` 返回独立的 `workspaceAccess.dataQuery` 布尔值，供 DSH 数据查询平台判断当前用户的 IT 角色权限。IT 统一授权 EU、UK、US；此处只实现 Octo 权限接口，不配置数据库、分配线上用户角色或部署服务。

## 验收标准

- [x] 服务端根据当前 active 用户的 `users.role` 派生权限，不接收调用方指定用户或角色。
- [x] 仅完整的 `it` token 授权，忽略大小写，支持逗号/空白分隔；相似子串、admin/dev/devops/pm 本身不获查询权限。
- [x] 保留既有 platformLists/platformSync 逻辑；单独 IT 角色可返回 dataQuery=true、其他两个权限为 false。
- [x] 匿名 profile 拒绝；同一已认证会话在 IT 角色撤销后读回 false。
- [x] 针对性测试、TypeScript 检查和差异检查通过。
- [x] 仅通过 OAuth/H5 核验身份的新会话可获得数据查询能力；插件和旧格式会话返回需核验提示，改动 token 标记不能提升资格。
- [x] 与 DSH 查询入口和执行前重新授权完成本地模拟协议联调；真实 Octo/内网联调仍待部署验收。
- [ ] 目标环境部署并验证真实角色分配及接口读回。

## 背景与范围

上游基线为 `feat/add-evals` / `70089d3`。开始前工作区已有其他任务文档、索引和本地配置改动，本任务保留这些内容，不将无关改动纳入提交；本轮用户已授权 review、修复、提交及创建独立 PR，不自动合并或部署。

`users.role` 为可空自由文本，现有源码/文档/测试未建立另一套规范 IT 键。本次按需求采用完整 `it` token；实际线上角色数据尚未核对。工作台成员、管理员和平台列表权限不能替代 IT 授权，独立查询入口也不能自动授予工单访问。

补充源码核对：`ResolvedUserStore.create/update` 接受并原样写入字符串角色；OAuth 和身份资料更新保留已有用户字段，因此不会把 `IT` 或 `dev, IT` 归一为其他角色。本 checkout 未定位到角色分配的用户管理 UI/API，不能把存储层支持自由文本等同于已验证可用的管理入口。真实分配入口和已部署用户的角色值属于上线前数据与权限准备，尚未验证，本任务不新增管理 UI/API。

## 方案与决策

在 `WebWorkspaceAccess` 增加 `dataQuery`，原有 profile 服务沿现有 opaque HttpOnly Web session 解析当前 active 用户并调用同一权限 helper。保持既有两个权限判断原样，只为 dataQuery 使用完整 token 匹配。无需新增路由、数据库迁移、凭证或任意身份查询入口。

插件缺少字段时应拒绝查询；会话执行端需在每次查询前读取当前权限。数据库范围和连接秘密继续由 DSH 部署配置维护。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-11-25 | v1 | in_progress | 经沙箱审批应用权限 helper、角色/认证测试及身份设计文档；42 项针对性测试、tsc --noEmit、git diff --check 通过 | 未接数据库或外部网络，未提交/部署；插件联调及目标环境验收由关联任务继续 |
| 2026-11-25 | v1 | in_progress | 关联插件 #23 报告原生 DSH + 模拟 Octo/模型 + 隔离 PostgreSQL 联调通过；桌面 1280px/窄屏 390px 验证 SQL/CSV 工具详情、深链接、IT 共享历史及创建者权限，无横向溢出；独立复查确认 IT 校验仅作用于 data-query，用途为 general 的旧 SQL 工具保持原授权 | 上述为本地模拟协议验证，不是真实 Octo 用户角色、内网三地库或目标部署验收；插件全套 213 项中 212 通过，1 项既有 KCS 环境问题未通过 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 单元与服务 fixture 测试 | 42/42 通过 | `pnpm --dir server test src/modules/lark-auth/web-workspace-access.test.ts src/modules/lark-auth/lark-auth.service.test.ts` | 26 项角色测试及 16 项认证/profile 测试；使用 pg-mem 与模拟依赖，无真实数据库或外部服务 |
| TypeScript | 通过 | `pnpm --dir server exec tsc --noEmit` | 本地静态检查 |
| 差异检查 | 通过 | `git diff --check` | 不代表发布或运行时联调 |
| 插件原生协议联调 | 通过，关联插件任务报告 | `tests/data-query.integration.test.ts`；[插件任务 #23](https://github.com/TenwaysCom/octo-dsh-plugins/issues/23) | 真实 DSH、模拟 Octo/模型和隔离 PostgreSQL；含 IT 撤权与非 IT 旧 general 会话 SQL 回归，不等于实际内网联调 |
| 插件浏览器交互 | 通过，关联插件任务报告 | 插件本地 `output/playwright/data-query-desktop.png`、`data-query-mobile.png` | 1280px/390px；SQL/CSV 详情、深链接、共享历史和创建者只读提示；未使用生产数据 |
| 插件全套测试 | 212 通过 / 1 未通过，关联插件任务报告 | [插件任务 #23](https://github.com/TenwaysCom/octo-dsh-plugins/issues/23) | 213 项；1 项既有 KCS 环境问题，未宣称整套通过 |
| 真实角色与线上验收 | 未执行 | [插件任务 #23](https://github.com/TenwaysCom/octo-dsh-plugins/issues/23) | 实际角色分配入口、已部署用户角色、目标部署及内网数据库连接仍需独立验证 |

## 关联

- [数据查询平台任务 #23](https://github.com/TenwaysCom/octo-dsh-plugins/issues/23)
- [用户身份系统设计：数据查询权限](../../tenways-octo/18-user-identity-design.md#19-数据查询权限)


## r2 Review 修复

用户于本轮要求完成 review、修复、提交和创建 PR。两轴审查确认角色匹配逻辑本身无新增回归，但旧插件登录不能作为敏感数据查询的身份核验依据。新增能力因此取“当前 IT 角色”与“服务端 OAuth/H5 已核验会话”的交集。普通平台权限及插件登录流程保留原行为。

会话核验标记仅由服务端在成功授权码交换后生成，完整 token 仍使用原表中的摘要校验，不增加迁移。配套 DSH 明确提示需重新核验，并提供已有同源登录入口。插件侧另修复旧 WebSocket 新订阅的实时撤权和查询用户的设置读取隔离。

本轮验证、提交与 PR 链接在完成后追加；实际角色、内网及部署验收仍未进行。


### r2 验证完成

- Review 修复身份核验前置条件；独立复查确认完整 token 摘要检查在核验标记判断之前，只有 OAuth/H5 成功交换的会话可获得新能力。
- 角色、OAuth/H5、认证 controller、HTTP 认证和入口回归 74/74 通过，服务端构建通过。另从最新 `origin/main` (`d22099b`) 用独立暂存索引组装精确候选，在隔离导出目录重复上述 74 项及构建，均通过；没有夹带 `feat/add-evals` 的其他提交。
- 配套插件 review 修复每个 WebSocket 新订阅的实时撤权和设置隔离，并通过原生 Host 集成。完整插件回归 222 项，221 通过；唯一 KCS 环境断言已在基线复现。桌面/390px 手机、已核验查询启动、未核验身份提示及保留原页面的新窗口验证链接已浏览器复验。
- 独立 PR 分支为 `codex/data-query-it-access`，关联插件分支为 `codex/data-query-platform`；提交、PR 及交付记录在关联插件 #23 继续回读记录。不自动合并或部署，真实角色和内网连接仍未验收。


### 提交与 PR

- Octo 配套权限：[PR #193](https://github.com/TenwaysCom/octo/pull/193)，代码提交 `768cf4f`；独立分支从最新 main 建立，仅包含本任务八个文件。
- DSH 查询平台：[PR #25](https://github.com/TenwaysCom/octo-dsh-plugins/pull/25)，提交 `537a824`，版本 `0.2.10`。
- 已推送并创建 PR，未合并、发布或部署。建议先部署 Octo 配套，再执行插件专用库迁移并部署 DSH；实际 IT 角色及内网三地连接仍需验收。
