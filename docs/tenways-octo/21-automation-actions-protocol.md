# 自动化动作协议与实现设计

**Status:** DRAFT
**Updated:** 2026-05-18

## 1. 背景

Octo 插件当前已经有一些固定动作，例如打开 Chat 分析、GitHub PR 查询、Meegle 工作项更新、Lark Base 批量创建 Meegle ticket 等。这些动作由前端在不同页面写死展示，后端提供对应业务接口。

后续需要支持“动态自动化动作”：

- 动作是否展示由页面 URL、页面类型和用户角色共同决定。
- 动作配置由后端维护，并存储在 DB 中。
- 用户角色不由前端传入，后端根据用户身份自动识别。
- 动作执行后可以打开 Chat，也可以显示一个动态预览窗口。
- 动态预览窗口由后端返回表单协议，插件按协议渲染。
- 现有动作不强制迁移，可以作为 `action` 类型继续复用。

## 2. 设计目标

1. 让自动化动作可配置，而不是在插件代码里写死所有入口。
2. 保持插件薄客户端定位，只负责上下文采集、动作展示和协议渲染。
3. 后端负责动作配置、权限判断、角色识别、动作执行和业务编排。
4. 兼容现有固定动作，避免把协议建设和业务动作重构绑在一起。
5. 为后续新增 PM 自动化、GitHub PR 分析、Lark/Meegle 工作流动作提供统一入口。

## 3. 核心概念

### 3.1 Automation Action

自动化动作是一个可展示、可执行的能力入口。

一个动作包括：

- 展示信息：标题、描述、排序、启用状态。
- 匹配条件：页面类型、URL 正则、允许角色。
- 执行器：复用现有前端 action、调用后端 operation、或生成 prompt。
- 展示结果：打开 Chat 或渲染动态表单预览。

### 3.2 pageType

`pageType` 是插件已识别出的页面平台类型：

- `lark`
- `meegle`
- `github`
- `unsupported`

保留 `pageType` 的目的：

- 配置更可读，避免所有条件都写复杂 URL 正则。
- 减少误匹配，例如不同平台都有 `/detail/` 结构。
- 复用现有插件页面检测结果。
- 方便按平台做默认分组和后续扩展。

`pageType` 是粗粒度匹配条件，`urlRegex` 是细粒度匹配条件。推荐动作至少配置其中一个，生产配置不应允许两者都为空。

### 3.3 user role

前端不传用户角色。

后端根据 `masterUserId` 查身份系统或权限表，得到当前用户的角色集合，例如：

- `pm`
- `requirement_owner`
- `developer`
- `admin`

动作展示和执行时都必须由后端做角色校验。前端返回的动作列表只用于展示，不作为权限依据。

## 4. 总体架构

```text
Extension Popup
  |
  | POST /api/automation-actions/list
  | { url, pageType, masterUserId }
  v
Server Automation Action Controller
  |
  +--> Identity / Role Resolver
  +--> Automation Action DB Config
  +--> Matcher: pageType + urlRegex + role
  |
  v
Available Actions

Extension Popup
  |
  | click action
  v
Action Executor
  |
  +--> type=action      -> run existing popup action
  +--> type=backend_api -> POST /api/automation-actions/execute
  +--> type=prompt      -> open Chat and prefill rendered prompt
```

## 5. DB 配置设计

第一版建议用一张主表承载配置。后续如果要做团队灰度或租户隔离，再拆 scope 表。

### 5.1 automation_actions

```text
automation_actions
- id uuid primary key
- key text unique not null
- title text not null
- description text
- enabled boolean not null default true
- priority integer not null default 100
- page_types jsonb not null default '[]'
- url_regexes jsonb not null default '[]'
- allowed_roles jsonb not null default '[]'
- executor_type text not null
- executor_config jsonb not null default '{}'
- presentation_type text
- created_at timestamptz not null
- updated_at timestamptz not null
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `key` | 稳定动作 key，例如 `github.lookup_pr` |
| `title` | 插件按钮标题 |
| `description` | 插件按钮辅助说明 |
| `enabled` | 是否启用 |
| `priority` | 展示排序，数字越小越靠前 |
| `page_types` | 页面类型列表，例如 `["github"]` |
| `url_regexes` | URL 正则列表，命中任意一个即可 |
| `allowed_roles` | 可见角色列表，为空表示不按角色限制 |
| `executor_type` | `action`、`backend_api`、`prompt` |
| `executor_config` | 执行器配置 |
| `presentation_type` | 可选。`open_chat` 或 `preview_form` |

### 5.2 后续可选 scope 表

```text
automation_action_scopes
- id uuid primary key
- action_id uuid not null
- scope_type text not null
- scope_value text not null
- created_at timestamptz not null
```

示例：

- `scope_type=role, scope_value=pm`
- `scope_type=user, scope_value=<masterUserId>`
- `scope_type=team, scope_value=<teamId>`

第一版可以不做这张表，先用 `allowed_roles`。

## 6. 动作配置协议

后端从 DB 读取后，可以归一化成如下内部协议：

```ts
type AutomationAction = {
  key: string;
  title: string;
  description?: string;
  enabled: boolean;
  priority: number;

  visibleWhen: {
    pageTypes?: Array<"lark" | "meegle" | "github" | "unsupported">;
    urlRegex?: string[];
    roles?: string[];
  };

  executor:
    | {
        type: "action";
        actionKey: string;
      }
    | {
        type: "backend_api";
        operation: string;
        config?: Record<string, unknown>;
      }
    | {
        type: "prompt";
        promptTemplate: string;
      };

  presentation?: {
    type: "open_chat" | "preview_form";
  };
};
```

### 6.1 executor.type = action

`action` 表示复用插件内已经注册的前端动作。

这种动作不走新的后端 execute 协议，前端点击后直接调用现有：

```ts
runFeatureAction(actionKey)
```

适合兼容现有能力，避免重写已有 controller、modal、错误处理和测试。

当前可复用的 `actionKey`：

| actionKey | 说明 | 适用页面 |
| --- | --- | --- |
| `analyze` | 打开或重置 Kimi ACP Chat | Lark 等支持分析的页面 |
| `bulk-create-meegle-tickets` | Lark Base 批量创建 Meegle ticket | 指定 Lark Base 视图 |
| `update-lark-and-push` | Meegle 工作项更新 Lark 并推送 | Meegle 工作项页面 |
| `lookup-github-pr` | GitHub PR 查询关联 Meegle 工作项 | GitHub PR 页面 |
| `create-github-branch` | 基于 Meegle 工作项创建 GitHub 分支 | Meegle 工作项页面 |

不应配置为可用的旧 key：

| actionKey | 原因 |
| --- | --- |
| `draft` | 当前只有旧 label 映射，没有实际 handler |
| `apply` | 当前只有旧 label 映射，没有实际 handler |

### 6.2 executor.type = backend_api

`backend_api` 表示动作由后端 operation registry 执行。

配置示例：

```json
{
  "type": "backend_api",
  "operation": "github.create_branch_preview",
  "config": {
    "defaultRepo": "tenways/octo"
  }
}
```

安全要求：

- `operation` 必须是后端注册过的内部 operation。
- 不允许 DB 配置任意 HTTP URL 让服务端代请求。
- execute 时后端必须再次校验动作是否对当前用户、URL、pageType 可用。

### 6.3 executor.type = prompt

`prompt` 表示后端基于模板渲染 prompt，前端打开 Chat 页面并把 prompt 填入输入框。

注意：`open_chat` 不自动发送消息。用户需要检查或修改输入框内容后手动发送。

配置示例：

```json
{
  "type": "prompt",
  "promptTemplate": "请基于当前页面做 PM 分析。页面：{{url}}，平台：{{pageType}}。"
}
```

模板变量第一版建议只支持白名单：

- `url`
- `pageType`
- `masterUserId`
- `larkId`
- `meegleUserKey`

不建议第一版支持任意表达式，避免模板执行复杂化。

## 7. API 协议

### 7.1 获取可见动作

```http
POST /api/automation-actions/list
```

请求：

```json
{
  "url": "https://github.com/tenways/octo/pull/123",
  "pageType": "github",
  "masterUserId": "usr_123"
}
```

说明：

- 前端只传页面上下文和身份 ID。
- 前端不传 role。
- 后端通过 `masterUserId` 解析角色。

返回：

```json
{
  "ok": true,
  "data": {
    "actions": [
      {
        "key": "github.lookup_pr",
        "title": "查询 PR 关联的 Meegle 工作项",
        "description": "从 PR 标题、描述和提交信息中识别 Meegle ID",
        "executor": {
          "type": "action",
          "actionKey": "lookup-github-pr"
        }
      }
    ]
  }
}
```

前端可以直接使用返回的 `executor` 决定点击行为。对于 `action` 类型，前端不需要再请求 execute。

### 7.2 执行动态后端动作

```http
POST /api/automation-actions/execute
```

仅 `backend_api` 类型需要调用。

请求：

```json
{
  "actionKey": "github.create_branch_preview",
  "url": "https://project.larksuite.com/xxx/detail/123",
  "pageType": "meegle",
  "masterUserId": "usr_123",
  "formValues": {
    "branchName": "feat/123-login-flow"
  }
}
```

返回 `open_chat`：

```json
{
  "ok": true,
  "data": {
    "presentation": {
      "type": "open_chat",
      "draftMessage": "请分析当前 Meegle 工作项..."
    }
  }
}
```

`draftMessage` 只用于预填 Chat 输入框，不触发自动发送。

返回 `preview_form`：

```json
{
  "ok": true,
  "data": {
    "presentation": {
      "type": "preview_form",
      "form": {
        "title": "创建 GitHub 分支",
        "description": "请确认分支信息",
        "submitLabel": "确认创建",
        "fields": [
          {
            "key": "repo",
            "label": "仓库",
            "type": "text",
            "value": "tenways/octo",
            "readonly": true
          },
          {
            "key": "branchName",
            "label": "分支名",
            "type": "text",
            "value": "feat/123-login-flow",
            "required": true
          }
        ],
        "submit": {
          "operation": "github.create_branch"
        }
      }
    }
  }
}
```

## 8. 动态表单协议

第一版支持字段：

```ts
type AutomationForm = {
  title: string;
  description?: string;
  submitLabel?: string;
  fields: AutomationFormField[];
  submit?: {
    operation: string;
  };
};

type AutomationFormField =
  | {
      type: "text" | "url";
      key: string;
      label: string;
      value?: string;
      required?: boolean;
      readonly?: boolean;
      placeholder?: string;
    }
  | {
      type: "textarea";
      key: string;
      label: string;
      value?: string;
      required?: boolean;
      readonly?: boolean;
      placeholder?: string;
    }
  | {
      type: "select";
      key: string;
      label: string;
      value?: string;
      required?: boolean;
      readonly?: boolean;
      options: Array<{ label: string; value: string }>;
    }
  | {
      type: "checkbox";
      key: string;
      label: string;
      value?: boolean;
      readonly?: boolean;
    }
  | {
      type: "hidden";
      key: string;
      value: string;
    };
```

前端渲染规则：

- `readonly` 字段不可编辑。
- `hidden` 字段不展示，但提交时带回。
- `required` 字段由前端做基础校验，后端仍需再次校验。
- 表单提交时，前端把所有可提交字段收集为 `formValues`。

## 9. 匹配逻辑

后端 list 和 execute 都使用同一套匹配逻辑：

1. 动作必须 `enabled=true`。
2. 如果配置了 `page_types`，当前 `pageType` 必须命中。
3. 如果配置了 `url_regexes`，当前 URL 必须命中任意一个正则。
4. 如果配置了 `allowed_roles`，当前用户任一 role 必须命中。
5. 按 `priority asc, title asc` 排序。

execute 必须二次校验，不能因为前端传了 `actionKey` 就执行。

## 10. 配置示例

### 10.1 复用 GitHub PR 查询动作

```json
{
  "key": "github.lookup_pr",
  "title": "查询 PR 关联的 Meegle 工作项",
  "description": "从 PR 页面提取 Meegle ID 并查询工作项",
  "enabled": true,
  "priority": 10,
  "page_types": ["github"],
  "url_regexes": ["^https://github.com/.+/.+/pull/\\d+"],
  "allowed_roles": ["pm", "developer", "admin"],
  "executor_type": "action",
  "executor_config": {
    "actionKey": "lookup-github-pr"
  }
}
```

### 10.2 复用 Meegle 创建 GitHub 分支动作

```json
{
  "key": "meegle.create_github_branch",
  "title": "创建 GitHub 分支",
  "description": "基于当前 Meegle 工作项生成分支名并创建分支",
  "enabled": true,
  "priority": 20,
  "page_types": ["meegle"],
  "url_regexes": ["/detail/"],
  "allowed_roles": ["developer", "pm", "admin"],
  "executor_type": "action",
  "executor_config": {
    "actionKey": "create-github-branch"
  }
}
```

### 10.3 Prompt 动作

```json
{
  "key": "pm.analyze_current_page",
  "title": "分析当前页面",
  "description": "打开 Octo Chat 做 PM 视角分析",
  "enabled": true,
  "priority": 30,
  "page_types": ["lark", "meegle", "github"],
  "url_regexes": ["^https?://"],
  "allowed_roles": ["pm", "requirement_owner", "admin"],
  "executor_type": "prompt",
  "executor_config": {
    "promptTemplate": "请基于当前页面做 PM 分析。页面类型：{{pageType}}，URL：{{url}}。"
  },
  "presentation_type": "open_chat"
}
```

### 10.4 后端动态预览动作

```json
{
  "key": "github.create_branch_preview_v2",
  "title": "创建 GitHub 分支 V2",
  "description": "后端返回动态表单，插件通用渲染",
  "enabled": true,
  "priority": 40,
  "page_types": ["meegle"],
  "url_regexes": ["/detail/"],
  "allowed_roles": ["developer", "admin"],
  "executor_type": "backend_api",
  "executor_config": {
    "operation": "github.create_branch_preview"
  },
  "presentation_type": "preview_form"
}
```

## 11. 现有动作兼容策略

第一版不迁移现有动作实现。

策略：

1. 现有固定动作可以继续由前端按当前逻辑展示。
2. DB 也可以配置 `executor_type=action`，让某些现有动作进入动态动作区域。
3. `action` 类型只复用现有前端 handler，不改变业务流程。
4. 等动态协议稳定后，再按动作逐步评估是否改成 `backend_api` 或 `prompt`。

这意味着 GitHub PR 查询、创建 GitHub 分支、Lark Base 批量创建 Meegle ticket 等能力都可以先不迁移。

## 12. 后端实现职责

后端需要实现：

1. DB migration：创建 `automation_actions` 表。
2. Repository：读取启用动作，按配置排序。
3. Role resolver：基于 `masterUserId` 查询用户角色。
4. Matcher：执行 pageType、URL 正则、role 匹配。
5. List API：返回当前页面可见动作。
6. Execute API：执行 `backend_api` 类型动作。
7. Operation registry：注册可调用的后端 operation。
8. Prompt renderer：按白名单变量渲染 prompt。
9. 权限二次校验：execute 时重新匹配动作。
10. 日志：使用 `logger.ts` 记录动作匹配和执行结果。

后端不应该：

- 接收前端传入的 role 作为权限依据。
- 允许 DB 配置任意外部 URL 作为执行目标。
- 在 execute 中跳过 URL 和 role 校验。

## 13. 前端实现职责

前端需要实现：

1. Popup 初始化后，发送 `{ url, pageType, masterUserId }` 拉取动作。
2. 在 Automation 页面渲染动态动作卡片。
3. 点击 `executor.type=action` 时调用现有 `runFeatureAction(actionKey)`。
4. 点击 `executor.type=prompt` 时打开 Chat，并把 prompt 填入输入框。
5. 点击 `executor.type=backend_api` 时调用 execute API。
6. 对 `preview_form` 返回结果渲染通用表单 modal。
7. 表单提交时收集 `formValues` 再调用 execute。
8. 保留现有固定动作，避免一次性迁移造成回归。

前端不应该：

- 自行判断用户 role。
- 在前端拼接敏感业务接口。
- 执行 DB 中未识别的任意动作类型。

## 14. 分阶段落地

### Phase 1：协议和配置底座

- 新增 DB 表。
- 新增 list API。
- 支持 `executor_type=action`。
- 前端动态渲染 DB 配置动作。
- 复用一个现有动作做验证，例如 `lookup-github-pr`。

### Phase 2：动态表单

- 新增 execute API。
- 支持 `backend_api` operation registry。
- 支持 `preview_form` 协议和前端通用 modal。
- 选择一个低风险动作做动态表单版本。

### Phase 3：Prompt 动作

- 支持 `prompt` executor。
- 后端渲染 prompt。
- 前端打开 Chat 并预填初始消息，用户确认后手动发送。

### Phase 4：治理能力

- 配置导入脚本。
- 支持灰度 scope。
- 支持动作审计日志。
- 支持团队或租户级开关。

## 15. 已确认设计结论

1. 用户 role 第一版直接使用 `resolved_users.role`，不新增权限表。
2. DB 配置暂时不需要管理后台，先用 migration 或 `pnpm --dir server automation-actions:seed <actions.json>` 维护。
3. 动态表单第一版不支持数组、表格、文件上传。
4. `action` 类型动作长期共存，用于复用插件内已有动作。
5. Prompt 动作目前只需要 URL；后续可以扩展为携带页面正文、选中文本或结构化页面上下文。
