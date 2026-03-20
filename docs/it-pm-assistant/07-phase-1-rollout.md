# 一期实施路线

## 1. 一期目标

在不引入独立项目看板和业务镜像的前提下，先跑通三个核心能力：

1. `A1 -> B2` 半自动建单
2. `A2 -> B1` 半自动建单
3. `PM 即时分析`

详细可执行开发计划见：

- [2026-03-20-it-pm-assistant-implementation-plan.md](../superpowers/plans/2026-03-20-it-pm-assistant-implementation-plan.md)

## 2. 推荐实施顺序

### 阶段 1：基础底座

- 浏览器插件骨架
- 服务端 API Gateway
- 身份识别链路
- 用户映射与团队级凭证管理
- Rule / Template 基础存储
- Meegle `plugin_id/plugin_secret -> plugin_token -> auth code -> user token / refresh token` 认证管理
- 插件侧 `auth code` 申请能力

交付结果：

- 能跑通最小协议层与身份链路
- 能完成 `auth code -> user token` 的正式产品主路径
- 能为后续 A1 / A2 工作流提供统一认证前置

### 阶段 2：Lark 入口能力

- A1 页面识别与上下文采集
- A2 页面识别与上下文采集
- 基础插件侧边栏 / 弹窗展示
- Lark Adapter 基础读取能力

交付结果：

- A1 / A2 页面都能稳定识别当前页面和当前用户
- 插件可发送统一消息到 Background / 服务端

### 阶段 3：A1 智能分析与 B2 草稿

- Meegle `project / workitem_type / field / template / meta` 读取
- A1 Intake Agent
- A1 相关 Skills
- B2 草稿 schema
- 半自动创建确认链路

交付结果：

- A1 页面可以生成 B2 草稿
- 草稿经过 schema 校验
- 用户确认后可以写入 Meegle

### 阶段 4：A2 智能分析与 B1 草稿

- A2 Requirement Agent
- A2 相关 Skills
- B1 草稿 schema
- 半自动创建确认链路
- Meegle workitem 读取与更新闭环

交付结果：

- A2 页面可以生成 B1 草稿
- A2 -> B1 链路与 A1 -> B2 共享同一套认证和执行框架

### 阶段 5：PM 即时分析

- 分析范围选择
- 多平台实时读取
- PM Analysis Agent
- 一次性分析结果展示

交付结果：

- 可按项目 / 时间窗口触发一次性分析
- 能识别阻塞项、滞留项、说明缺失项

### 阶段 6：稳定性与验收

- 错误提示和降级
- 审计日志
- 幂等检查
- 样例集回归测试
- 真实场景验收

交付结果：

- 主链路具备可回归的测试样例
- 错误与降级路径可被明确验证

## 3. 依赖关系

- 身份链路是所有执行动作的前置条件
- Lark Adapter 是 A1/A2 两条主链路前置
- `Meegle create_workitem / get_workitem_meta / get_workflow_details` 是主链路关键依赖
- 插件侧 `Meegle auth code` 获取与服务端 `user token` 刷新是所有 Meegle 写操作前置
- GitHub 能力可优先只支持读取，不阻塞 A1/A2 主链路

## 4. 风险点

1. 页面侧用户识别稳定性
2. Meegle `project_key / workitem_type_key / template_id / field_value_pairs` 复杂度高于预期
3. Agent 输出稳定性和字段可控性
4. 多平台接口速率限制和异常降级体验
5. `auth code -> user token / refresh token` 的实现链路与刷新策略
6. 是否需要提前引入 `workflow task` 支持

## 5. 验收标准

- PM 可以在真实 A1 / A2 页面触发半自动建单
- B1 / B2 草稿质量可直接用于人工微调后提交
- 即时分析能在一次操作中给出跨平台结论
- 错误情况有明确提示，不会默默失败

## 6. 开发计划关系说明

本文件回答的是“一期先做什么、后做什么、每一阶段交付什么”。

对应的详细开发计划回答的是：

- 每个阶段要改哪些文件
- 先写哪些测试
- 每一步如何验证
- 每个任务完成后如何提交

## 7. 当前实现落点

- `extension/`：已落地协议类型、Background Router、Meegle auth bridge 与基础 e2e 测试
- `server/`：已落地 identity、meegle-auth、A1、A2、PM analysis 模块及配套测试
- 当前实现采用最小可运行骨架，便于下一步接入真实平台 API 与持久化存储
