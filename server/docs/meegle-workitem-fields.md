# Meegle 工作项字段定义

项目: `4c3fv6` (Tenways Software R&D)

---

## Production Bug (产线缺陷)

**工作项类型 Key**: `6932e40429d1cd8aac635c82`

**默认模板 ID**: `645025` (Default Production Bug type)

### 核心字段

| 字段 Key | 字段名称 | 类型 | 必填 | 说明 |
|---------|---------|------|-----|------|
| `name` | Bug Name | text | 是 | Bug 名称 |
| `description` | Bug Description | multi-text | 否 | Bug 描述 |
| `priority` | Priority | select | 否 | 优先级 |
| `template` | Production Bug type | template | 是 | 模板类型 |

### 优先级 (priority) 选项

| 值 | 标签 |
|----|------|
| `option_1` | P0 |
| `option_2` | P1 |
| `option_3` | P2 |

**API 格式**:
```json
{
  "field_key": "priority",
  "field_value": {"value": "option_2", "label": "P1"}
}
```

### 业务线 (business) 选项

| 值 | 标签 | 子选项 |
|----|------|--------|
| `68a2ed91ae11245c28da261d` | Finance | payroll |
| `68a2ed91ae11245c28da261f` | Legal | - |
| `68a2ed91ae11245c28da2620` | B2B sales | - |
| `68a2ed91ae11245c28da2621` | B2C sales | - |
| `68a2ed91ae11245c28da2622` | HR | - |
| `68a2ed91ae11245c28da2623` | Supply Chain | - |
| `68a2ff54ae11245c28da2637` | After-sales | - |
| `68f6fa67e6dddb508efee886` | Ebike R&D | - |
| `693a9822f8a616ae182f7631` | Software center | - |
| `694a9cf8f1127ee7a9914e34` | Warehouse&Logistics | - |
| `697b233dd70464c907f9f9f6` | Marketing | - |

### 相关系统 (field_4976fc) 选项

| 值 | 标签 | 子选项 |
|----|------|--------|
| `2llp11l7n` | Tenways App | IOS, Android |
| `cyvssley1` | Odoo | Odoo EU, Odoo UK, Odoo US |
| `o0wesage1` | Tenways Backend Platform | - |
| `31j37nw9x` | Turbo App | IOS, Android |
| `ebzvt6did` | Portal | Portal EU, Portal UK, Portal US |

### 技术团队 (field_26ef68) 选项

| 值 | 标签 |
|----|------|
| `gph_nuu5k` | Dev Team 1 |
| `cmb9pif3i` | Dev Team 2 |

### 状态流转

| 状态 Key | 状态名称 |
|---------|---------|
| `NqUdvDA_K` | New |
| `L_BVnQXPr` | In Development |
| `61QHroIrK` | QA Review |
| `OSkXFO8gI` | To be launched |
| `eRkPSe9HL` | To be validated online |
| `mxJPixvTv` | Fixed |
| `closed` | 已终止 |

---

## Story (需求)

**工作项类型 Key**: `story`

**模板选项**:
- `400154`: Product feature draft
- `400155`: Configuration request
- `400329`: Product feature

### 核心字段

| 字段 Key | 字段名称 | 类型 | 必填 | 说明 |
|---------|---------|------|-----|------|
| `name` | Feature Name | text | 是 | 需求名称 |
| `description` | Feature Description | multi-text | 否 | 需求描述 |
| `priority` | Priority | select | 否 | 优先级 |
| `template` | Feature Type | template | 是 | 模板类型 |
| `schedule` | Schedule Period | schedule | 否 | 排期 |

### 优先级 (priority) 选项

| 值 | 标签 |
|----|------|
| `0` | P0 |
| `1` | P1 |
| `2` | P2 |

**API 格式**:
```json
{
  "field_key": "priority",
  "field_value": {"value": "1", "label": "P1"}
}
```

### 验收状态 (field_d9e011) 选项

| 值 | 标签 |
|----|------|
| `9ylccov0i` | Approved |
| `587ocu863` | Declined |

### 评审结果 (field_657b77) 选项

| 值 | 标签 |
|----|------|
| `rne7yf9bc` | Approved |
| `swya29tpi` | Rejected |

### 研发处理结果 (field_711a2d) 选项

| 值 | 标签 |
|----|------|
| `l4wsmh6rv` | Resolved |
| `_ebi3e82g` | Invalid bug |
| `u1xccar_n` | Irreproducible |
| `aj8w9rvs4` | Unresolved |
| `4cl7wqj4h` | Fix in future |

### 子组件 (field_148367) 选项

| 值 | 标签 |
|----|------|
| `4sdzo64i8` | Service_osr |
| `7oz210bag` | Service_nip |
| `3tjdkyka6` | Service_tts |
| `l7hjmkdoi` | Architecture optimization |
| `4kw98rq53` | Stability guarantee |

### 部门 (field_82dc7f) 选项

| 值 | 标签 |
|----|------|
| `d0q8cy3a0` | Finance |
| `j75qurq8c` | R&D |
| `pdu_gryih` | PM |

### 系统 (field_0dba3a) 选项

| 值 | 标签 |
|----|------|
| `f9m7hf4o5` | Odoo EU |
| `gnbgliy5u` | Portal |
| `_f1xe2cn9` | Tenways App |
| `pn25sezko` | Tenways App management platform |
| `8h79nr2_o` | Odoo US |
| `pbn35bnap` | Odoo UK |

### 状态流转

| 状态 Key | 状态名称 |
|---------|---------|
| `w1E3ojpME` | Product Backlog |
| `ftg9jxaj4` | Pending Business Review |
| `sub_stage_1682410012439` | PRD Designing |
| `sub_stage_1682409877189` | Pending PRD Review |
| `bpwdw0utp` | Tech Designing |
| `r1it_o_gu` | Pending Tech Review |
| `sub_stage_1682410102504` | To be scheduled |
| `sub_stage_1682410168161` | To be developed |
| `sub_stage_1682410193214` | In development |
| `sub_stage_1682410266374` | Pending integration test |
| `sub_stage_1682410289580` | Pending testing |
| `sub_stage_1682410311880` | Testing |
| `sub_stage_1682410348054` | Pending release |
| `nLLJAuXNz` | UAT Review |
| `sub_stage_1682410371762` | Launched |
| `closed` | 已终止 |

---

## 工作流字段映射

### A1 → Production Bug (a1-workflow.service.ts)

| Lark A1 Record | Meegle Field | 转换逻辑 |
|---------------|-------------|---------|
| `title` | `name` | 直接传递 |
| `summary` | `description` | 直接传递 |
| `priority` (P0/P1/P2) | `priority` | `mapPriorityToOption()` → `{value: "option_1/2/3", label: "P0/P1/P2"}` |

### A2 → Story (a2-workflow.service.ts)

| Lark A2 Record | Meegle Field | 转换逻辑 |
|---------------|-------------|---------|
| `title` | `name` | 直接传递 |
| `target` | `description` | 直接传递 |
| `priority` (P0/P1/P2) | `priority` | `mapStoryPriority()` → `{value: "0/1/2", label: "P0/P1/P2"}` |
| - | `field_d9e011` | 固定值 `{value: "9ylccov0i", label: "Approved"}` |

**注意**: Story 和 Production Bug 的 priority 值格式不同！

## API 调用示例

### 创建 Production Bug

```typescript
const bug = await client.createWorkitem({
  projectKey: "4c3fv6",
  workItemTypeKey: "6932e40429d1cd8aac635c82",
  name: "[Bug] 支付功能异常",
  templateId: 645025,
  fieldValuePairs: [
    { field_key: "description", field_value: "用户无法完成支付" },
    { field_key: "priority", field_value: { value: "option_1", label: "P0" } },
  ],
});
```

### 创建 Story

```typescript
const story = await client.createWorkitem({
  projectKey: "4c3fv6",
  workItemTypeKey: "story",
  name: "[Feature] 添加暗黑模式",
  templateId: 400329,
  fieldValuePairs: [
    { field_key: "description", field_value: "支持暗黑主题切换" },
    { field_key: "priority", field_value: { value: "1", label: "P1" } },
    { field_key: "field_d9e011", field_value: { value: "9ylccov0i", label: "Approved" } },
  ],
});
```

---

## 字段类型说明

| 类型 | 说明 | 示例值 |
|------|------|--------|
| `text` | 单行文本 | `"Bug 标题"` |
| `multi-text` | 多行文本/Markdown | `"详细描述..."` |
| `select` | 单选 | `{"value": "option_1", "label": "P0"}` |
| `multi-select` | 多选 | `[{"value": "Plan", "label": "Plan"}]` |
| `user` | 单用户 | `user_key` |
| `multi-user` | 多用户 | `[user_key1, user_key2]` |
| `date` | 日期 | 毫秒时间戳 |
| `schedule` | 排期 | `[开始时间, 结束时间]` |
| `bool` | 布尔 | `true` / `false` |
| `number` | 数字 | `123` |
| `link` | 链接 | `"https://..."` |
| `multi-file` | 附件 | 文件对象数组 |
| `tree-select` | 树形选择 | `{"value": "2llp11l7n", "label": "Tenways App"}` |
| `workitem_related_select` | 关联工作项(单选) | 工作项 ID |
| `workitem_related_multi_select` | 关联工作项(多选) | `[工作项ID1, 工作项ID2]` |
