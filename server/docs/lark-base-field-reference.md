# Lark Base 字段信息

> 来源多维表格：https://nsghpcq7ar4z.sg.larksuite.com/base/XO0cbnxMIaralRsbBEolboEFgZc?table=tblUfu71xwdul3NH&view=vewmpIUTAu
> Base ID: `XO0cbnxMIaralRsbBEolboEFgZc`
> Table ID: `tblUfu71xwdul3NH`
> 更新时间: 2026-04-13

## 字段列表（共 29 个）

| 字段名 | field_id | 类型 | 备注 |
|--------|----------|------|------|
| 预计修复日期 | `fldvLniG8L` | datetime | format: yyyy/MM/dd |
| 紧急度 | `fldIrUeius` | select | 单选 |
| Responsible | `fldjrR1qFg` | user | 单选 |
| 开始天数 | `fldxFdbdTY` | formula | |
| Issue Description | `fldaAzcMtg` | text | plain |
| 编号 | `fldAONyxvh` | auto_number | incremental_number, length: 3 |
| 创建时间 | `fldUP4mMdj` | created_at | format: yyyy/MM/dd HH:mm |
| 紧急度（旧） | `fldolRnPyx` | number | rating, min: 1, max: 5 |
| 上级ticket | `fld8cFxJm6` | link | |
| 关闭时间 | `fldZi0Ssx5` | datetime | format: yyyy/MM/dd HH:mm |
| 状态 | `fldDpfWZoj` | select | 单选 |
| 测试环境 | `fldBIijQSs` | text | url 样式 |
| Business line | `fldGiMKgMo` | select | 单选 |
| 关闭 | `fld5iruY38` | not_support | 不支持 OpenAPI 读写 |
| 关闭周数 | `fld3ZAM9Kh` | formula | |
| Issue 类型 | `fldSQ1D6LG` | select | 多选 |
| 解决方案 | `fldUlDrMTr` | text | plain |
| 需求人 | `fldy1P3LFN` | user | 多选 |
| status（旧） | `fldNOcS2Lr` | not_support | 不支持 OpenAPI 读写 |
| 关联需求 | `fld4STsxi9` | link | |
| **meegle链接** | `fldp4WrRpO` | **text** | **url 样式，可写入** |
| 状态记录时间 | `fldEPOKnti` | updated_at | format: yyyy/MM/dd HH:mm |
| Attachments | `fldP1lfgmi` | attachment | |
| 总耗时 | `fldii21nHn` | formula | |
| 创建日期 | `fld9Ka0P0J` | created_at | format: yyyy/MM/dd |
| 创建周数 | `fldFYxVslk` | formula | |
| 创建人 | `fldYfNZQDs` | created_by | |
| Details Description | `fldML66Cx1` | text | plain |
| tag | `fld66P6lNh` | select | 多选 |

## 常用写入字段

以下字段可以通过 OpenAPI 直接写入：

- `meegle链接` (`fldp4WrRpO`) — text/url
- `Issue Description` (`fldaAzcMtg`) — text
- `Details Description` (`fldML66Cx1`) — text
- `解决方案` (`fldUlDrMTr`) — text
- `测试环境` (`fldBIijQSs`) — text/url
- `预计修复日期` (`fldvLniG8L`) — datetime
- `关闭时间` (`fldZi0Ssx5`) — datetime
- `状态` (`fldDpfWZoj`) — select
- `紧急度` (`fldIrUeius`) — select
- `Issue 类型` (`fldSQ1D6LG`) — select (多选)
- `Business line` (`fldGiMKgMo`) — select
- `tag` (`fld66P6lNh`) — select (多选)
- `Responsible` (`fldjrR1qFg`) — user
- `需求人` (`fldy1P3LFN`) — user (多选)
- `上级ticket` (`fld8cFxJm6`) — link
- `关联需求` (`fld4STsxi9`) — link
- `Attachments` (`fldP1lfgmi`) — attachment

## 只读字段

- `编号` (`fldAONyxvh`) — auto_number
- `创建时间` (`fldUP4mMdj`) — created_at
- `创建日期` (`fld9Ka0P0J`) — created_at
- `创建人` (`fldYfNZQDs`) — created_by
- `状态记录时间` (`fldEPOKnti`) — updated_at
- `开始天数` (`fldxFdbdTY`) — formula
- `关闭周数` (`fld3ZAM9Kh`) — formula
- `总耗时` (`fldii21nHn`) — formula
- `创建周数` (`fldFYxVslk`) — formula
- `关闭` (`fld5iruY38`) — not_support
- `status（旧）` (`fldNOcS2Lr`) — not_support
