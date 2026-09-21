---
title: "Lark 页面姓名被当作用户 ID 写入 users 排查"
module: "platform-auth"
status: done
requirement_version: 1
created_on: 2026-09-18
updated_on: 2026-09-18
closed_on: 2026-09-18
owner: TBD
related:
  - "2026-09-02-new-user-meegle-authorization-diagnosis.md"
---

# Lark 页面姓名被当作用户 ID 写入 users 排查

## 目标

解释 users.lark_id 出现姓名的原因，核对生产影响范围。本次只排查，不修改认证代码或生产数据。

## 验收标准

- [x] 定位能把姓名当 ID 的提取与写入链路。
- [x] 只读核对生产匿名统计。
- [x] 区分已证实代码缺陷与未还原的历史写入事件。

## 方案与结论

- `extension/src/injection/platforms/lark/bootstrap.ts::resolveLarkUserId` 遍历 `[data-user-id]`、`[data-user_id]`、`.user-id`、`[id*='user']`。元素没有 dataset.userId 时，将 innerText.trim() 长度超过 5 的显示文字作为 userId 返回，优先于 global/storage 路径。用户名元素可满足此条件。0.8.2 已存在，0.8.2 → 0.9.1 此文件无变化。
- 插件初始化把结果写入 identity.larkId，identity resolve 请求把它作为 operatorLarkId 提交；DTO 仅要求非空字符串。identity-resolution.service 创建用户或补充空 larkId 时直接接受该值；PG adapter 正常映射 larkId → lark_id，并非把 larkName 列映射错。
- `applyHints` 优先保留已有非空 larkId，所以后续普通身份解析不会自动纠正。成功的 Lark OAuth 回调有独立路径更新 larkId 为 openId，因此并非永远不可修正。
- 2026-09-18 使用生产 `/home/deploy/projects/octo/server/.env` 连接配置，在 `BEGIN READ ONLY` 中执行 users 聚合：总计 7 行；5 行 lark_id 以 ou_ 开头；2 行 lark_id 等于 lark_name；2 行 lark_id 含空白。未输出用户 ID、姓名、凭证或原始记录。
- 代码缺陷与生产异常形态相符，但尚未取得两个用户首次错误写入时的 DOM/客户端日志，不能断言每行都来自此选择器，也不能直接关联昨天 Meegle 授权故障。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-18 | v1 | done | 定位 DOM 文本误识别、非空校验放行与正常列映射链路；生产匿名统计确认 2 行 ID 等于姓名 | 后续修复应去除姓名文本 fallback，并按明确身份类型验证；既有数据需用可信身份关联修复，不按姓名合并 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 静态检查 | 完成 | 上述提取、DTO、identity service、PG store 与旧标签 | 未执行真实浏览器复现 |
| 生产只读查询 | 完成 | users 匿名聚合 | 不证明历史具体写入来源 |
| 单测 / mock integration / live E2E | 未执行 | 本次无代码修改 | 未修复或部署 |

## 关联

- [授权版本兼容性排查](2026-09-02-new-user-meegle-authorization-diagnosis.md)
