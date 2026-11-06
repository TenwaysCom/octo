# Ticket 六属性合并保存接口

Octo 列表、详情、Lark App 共用本协议；DSH 可通过既有 Octo Web session 接入。当前仓库只实现 Octo，不包含外部 DSH 客户端改造。所有接口要求有效 HttpOnly Web session、`platformSync` 权限及匹配当前 `masterUserId` 的 `expectedUserId`，响应 `Cache-Control: no-store`；不能用请求字段选择身份。

## 提交

`POST /api/web/lark-tickets/:recordId/field-submissions`

```json
{
  "baseId": "synthetic-base",
  "tableId": "synthetic-table",
  "expectedUserId": "synthetic-octo-user",
  "submissionId": "a2c55ced-71da-4145-ad62-ce9ed9c9a363",
  "actionRunId": "ticket-save-example",
  "changes": [
    { "field": "priority", "value": "P3", "expected": { "value": "P1" } },
    { "field": "responsible", "value": "Lin", "optionUserId": "ou_synthetic_lin", "expected": { "value": "Ada", "userIds": ["ou_synthetic_ada"] } }
  ]
}
```

`changes` 为 1–6 个不重复语义字段：`status/priority/requester/responsible/issueType/businessLine`。值非空、最多 512 字符。人员必须有 `optionUserId`；`expected.userIds` 可用时优先比较 ID 集合，兼容旧客户端只有展示名的基线。基线是编辑开始时已确认值，不是最后一次乐观回显。提交编号是 UUID，与该不可变差异和完整账号/记录身份绑定；不得用同一编号提交不同内容。

Server 回读源记录，只校验本次字段，统一解析元数据后只更新实际改变字段；其他源字段不回写。`Finish` 同批写服务器当前关闭时间。无实际变化时不写 Lark、不触发同步。正常批次一次 Lark 更新、一次 Octo 单记录同步清洗；回读和元数据查询是额外读请求。

响应统一为 `{ "ok": true, "data": result }` 或 `{ "ok": false, "error": { "actionRunId", "layer", "module", "stage", "errorCode", "errorMessage" } }`。处理结果在 `data` 中，即使业务状态为 rejected/conflict/unknown，客户端也必须判断 `state` 和 `larkBaseUpdated`；不能仅凭 HTTP 2xx 判定保存成功。

| state | larkBaseUpdated | 客户端处理 |
| --- | --- | --- |
| preparing / writing | false | 提交已登记/处理中；按编号观察，不新建编号重写 |
| saved | true | 清除本批草稿，保留后续编辑；显示已保存 |
| saved_pending_sync | true | 清除已保存草稿，显示已保存、待同步，只调用 sync |
| conflict | false | values 是最新源值，conflicts 是冲突字段；保留草稿，由用户选择本地/远端 |
| rejected | false | 展示 errorCode/errorMessage，保留草稿；显式核对或放弃 |
| unknown | false | 尚未证明成功或失败；暂停该 Ticket 后续发送，允许编辑草稿并重新核对 |
| not_applied | false | 服务端确认写前 preparing 已原子取消，可核对草稿后创建新提交 |

结果含 `submissionId/actionRunId/layer/module/stage/state/larkBaseUpdated/syncFailed`。可有 `values`（六字段 `{value,userIds?}`）、`ticket`（展示投影）、`conflicts/errorCode/errorMessage`。只应用本批字段和相关人员数组/关闭时间，不能用完整 ticket 覆盖更晚的选择。

## 查询和恢复

以下 GET query / POST body 都带 `{baseId,tableId,expectedUserId}`，recordId 在路径中。

| 方法 | 路径（`/api/web/lark-tickets/:recordId` 后） | 行为 |
| --- | --- | --- |
| GET | `/editable-fields` | 回读 Lark 六属性及展示投影；用于未发送草稿的刷新核对 |
| GET | `/field-submissions/:submissionId` | 查询持久提交结果；按账号、域名和完整 Ticket 身份隔离 |
| POST | `/field-submissions/:submissionId/reconcile` | 已保存时仅重试同步；未知时回读本批字段，未能确认则继续 unknown；不会重发 Lark 更新 |
| POST | `/field-submissions/:submissionId/sync` | 仅对 saved_pending_sync 重试 Octo 同步；已 saved 直接返回结果 |

超时/网络中断不能视为明确失败。Octo 客户端观察超时为 15 秒，Server 继续处理和保存结果。客户端先 GET，仍处理中/未知再 reconcile；若查不到提交记录，仅允许重放**原编号、原内容**，利用数据库 claim 防止原 HTTP 请求迟到造成重复写入。禁止换编号盲目重发。未知写入对应的 Ticket 锁不会随重启或新批次消失；读回旧值也不能证明未写入。回读全部符合目标值后可确认当前目标状态并继续同步，这不能证明历史上只有该提交改变过这些值。

恢复人员和其他字段冲突时，新提交仍携带用户已审阅的远端值作为 expected，提交前再次检查，不能用强制覆盖标志绕过。写前检查与 Lark 更新非原子，Lark 网页或旧单字段客户端仍可能在间隙修改相同字段；本协议降低覆盖风险，不提供外部编辑完全互斥。

## 浏览器草稿与兼容

App 按 API 地址和账号隔离 sessionStorage，只暂存六属性差异、基线、相关人员投影和提交状态；不保存 token/cookie 或完整 Ticket。切换 Ticket 保留队列；同一标签刷新先核对账号和源数据再恢复；换账号清除上个账号暂存、退出清除当前草稿。存储不可用会提示；不承诺关闭标签后的恢复。

原 `POST /api/web/lark-tickets/:recordId/fields` 保留，解决方案仍手动保存；没有本批量协议的提交编号和冲突恢复保证。旧逐字段浏览器脚本是历史基线，当前验收入口见 [FE README](../../fe/README.md#ticket-字段连续编辑)。数据库由既有 schema migration 新建 `lark_ticket_field_submissions`；发布前需正常迁移，不需要 reset。迁移和部署未在本次开发会话执行。

实现和验证证据见 [任务记录](../tasks/platform-data/2026-11-06-lark-ticket-batched-autosave.md)。
