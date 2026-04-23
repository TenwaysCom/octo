# GitHub PR 反查 Meegle 功能设计文档

**日期**: 2026-04-21  
**作者**: Claude  
**状态**: 已批准，待实现

---

## 1. 背景与目标

### 1.1 需求背景
用户在浏览 GitHub PR 页面时，希望能够快速查看该 PR 关联的 Meegle 工作项信息。PR 中可能通过以下方式引用 Meegle 工作项：
- Commit 标题中包含 Meegle ID
- PR 标题中包含 Meegle ID
- PR 描述中包含 Meegle ID
- PR 评论中包含 Meegle ID

### 1.2 功能目标
- 在 GitHub PR 页面显示一个按钮，用户点击后触发查询
- 从 PR 的 commits、标题、描述、评论中提取 Meegle ID
- 调用 Meegle API 获取工作项详情（标题、类型、状态、Sprint、自定义字段）
- 在 Popup 中展示查询结果

---

## 2. 技术方案

### 2.1 架构选择

采用 **方案 3：纯 Server 端 GitHub API** 方案。

#### 2.1.1 架构对比

> **对比参考**: [.hermes/plans/2026-04-21_144647-conversation-plan.md](../.hermes/plans/2026-04-21_144647-conversation-plan.md)
>
> 备选方案：Extension 端提取文本后传给 Server
> - Extension 通过 content script 读取 PR 标题、描述、commits、评论
> - 将完整文本发送到 Server 进行 ID 提取和 Meegle 查询
>
> **本设计采用 Server 端调 GitHub API**，理由：
> 1. **提取逻辑统一**：ID 提取、GitHub 数据获取、Meegle 查询都在 Server 端，便于维护和更新规则
> 2. **减少 Extension 复杂度**：无需新增 content script，Popup 只需发送 PR URL
> 3. **避免 CORS 问题**：GitHub API 调用在 Server 端完成
> 4. **Token 管理简化**：GitHub Token 只需配置在 Server 端

#### 2.1.2 设计理由

- 需要从 4 个来源（commits、标题、描述、评论）提取信息
- GitHub API 调用在 Server 端完成，避免 CORS 和 Token 管理问题
- 提取逻辑在 Server 端统一维护，易于更新规则

### 2.2 数据流

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   GitHub PR     │────▶│  Popup Extension │────▶│  Octo Server    │
│     Page        │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                    ┌─────────────────────┼─────────────────────┐
                                    │                     │                     │
                                    ▼                     ▼                     ▼
                            ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
                            │  GitHub API   │    │ MeegleId      │    │  Meegle API   │
                            │  - PR details │    │ Extractor     │    │  - Workitem   │
                            │  - Commits    │    │  - Regex      │    │    query      │
                            │  - Comments   │    │  - Deduplicate│    │               │
                            └───────────────┘    └───────────────┘    └───────────────┘
                                    │                     │                     │
                                    └─────────────────────┴─────────────────────┘
                                                          │
                                                          ▼
                                               ┌──────────────────┐
                                               │  Return Results  │
                                               │  to Popup        │
                                               └──────────────────┘
```

### 2.3 组件设计

#### 2.3.1 Server 端组件

| 组件 | 文件路径 | 职责 |
|------|----------|------|
| `GitHubClient` | `server/src/adapters/github/github-client.ts` | 封装 GitHub API 调用（获取 PR、commits、评论） |
| `MeegleIdExtractor` | `server/src/domain/meegle-id-extractor.ts` | 从文本中提取 Meegle ID，支持多种格式 |
| `GitHubReverseLookupController` | `server/src/controllers/github-reverse-lookup.ts` | HTTP 控制器，编排查询流程 |
| Route | `server/src/routes/github-lookup.ts` | 注册 `/api/github/lookup-meegle` 路由 |

#### 2.3.2 Extension 端组件

| 组件 | 文件路径 | 职责 |
|------|----------|------|
| `githubActions` | `extension/src/popup-shared/popup-controller.ts` | 新增 GitHub 平台 action |
| `GithubLookupController` | `extension/src/popup-shared/controllers/github-lookup.ts` | 懒加载控制器，处理查询逻辑 |
| `GithubLookupResultView` | `extension/src/popup-react/components/GithubLookupResult.tsx` | 展示查询结果 |
| `AutomationPage` | 更新 | 添加 GitHub 平台支持 |

#### 2.3.3 平台检测更新

| 文件 | 修改内容 |
|------|----------|
| `extension/src/platform-url.ts` | 新增 `github` 平台识别 |
| `extension/wxt.config.ts` | 添加 `github.com` host_permissions |

---

## 3. 详细设计

### 3.1 Meegle ID 提取规则

#### 3.1.1 设计决策说明

> **对比参考**: [.hermes/plans/2026-04-21_144647-conversation-plan.md](../.hermes/plans/2026-04-21_144647-conversation-plan.md)
>
> 根据调研，Meegle GitHub 集成支持**任意字母前缀**的格式：`[prefix]-[数字ID]`（如 `m-49545`, `f-123456`, `bug-789`, `feature-100`）。
>
> **本设计采用固定格式规则**，理由：
> 1. **减少误匹配**：避免匹配到版本号（如 `v-1.2.3`）、日期（如 `2024-01-01`）等非工作项引用
> 2. **覆盖 95%+ 场景**：实际使用中 `m-`（需求）、`f-`（缺陷）、`#`（通用引用）、纯数字是最常见的格式
> 3. **易于维护**：规则明确，用户预期一致

#### 3.1.2 提取规则

支持以下格式（去重后）：

| 格式 | 正则 | 示例 | 说明 |
|------|------|------|------|
| 纯数字 | `\b(\d{6,})\b` | `123456` | 6位以上数字 |
| m-前缀 | `\bm-(\d+)\b` | `m-123545` | 需求类工作项 |
| f-前缀 | `\bf-(\d+)\b` | `f-123456` | 缺陷类工作项 |
| #前缀 | `#(\d{6,})` | `#123456` | 通用引用格式 |

提取逻辑：
1. 扫描 PR 标题、描述、所有 commits 的 message、所有评论的 body
2. 收集所有匹配的数字 ID
3. 去重（以数字 ID 为准，同一 ID 可能以不同前缀出现多次）
4. 返回唯一数字 ID 列表

### 3.2 Server API 设计

#### 3.2.1 请求

```typescript
POST /api/github/lookup-meegle
Content-Type: application/json

{
  "prUrl": "https://github.com/owner/repo/pull/123"
}
```

#### 3.2.2 成功响应

```typescript
{
  "success": true,
  "data": {
    "prInfo": {
      "title": "Fix bug in login flow",
      "description": "Related to #123456",
      "commits": [
        { "message": "fix: resolve auth issue (#123456)" }
      ],
      "comments": [
        { "body": "Please check m-789012" }
      ]
    },
    "extractedIds": ["123456", "789012"],
    "workitems": [
      {
        "id": "123456",
        "name": "修复登录流程问题",
        "type": "需求",
        "status": "进行中",
        "sprint": "Sprint 15",
        "priority": "P0",
        "module": "用户认证",
        "businessLine": "核心业务"
      }
    ]
  }
}
```

#### 3.2.3 错误响应

```typescript
{
  "success": false,
  "error": {
    "code": "NO_MEEGLE_ID_FOUND",
    "message": "未从 PR 中提取到 Meegle ID"
  }
}
```

错误码定义：

| 错误码 | 含义 | HTTP 状态 |
|--------|------|-----------|
| `INVALID_PR_URL` | PR URL 格式无效 | 400 |
| `GITHUB_API_ERROR` | GitHub API 调用失败 | 502 |
| `NO_MEEGLE_ID_FOUND` | 未提取到 Meegle ID | 404 |
| `MEEGLE_API_ERROR` | Meegle API 调用失败 | 502 |

### 3.3 GitHub API 调用

#### 3.3.1 需要的数据

```typescript
// 获取 PR 详情
GET /repos/{owner}/{repo}/pulls/{pull_number}

// 获取 PR Commits
GET /repos/{owner}/{repo}/pulls/{pull_number}/commits

// 获取 Issue 评论（PR 也是 Issue）
GET /repos/{owner}/{repo}/issues/{pull_number}/comments

// 获取 PR Review 评论
GET /repos/{owner}/{repo}/pulls/{pull_number}/comments
```

#### 3.3.2 认证方式

使用 GitHub Personal Access Token：
```typescript
Authorization: Bearer ${GITHUB_TOKEN}
```

### 3.4 Meegle API 调用

使用现有 `filterWorkitemsAcrossProjects` 接口，通过 `work_item_ids` 参数查询：

```typescript
POST /open_api/work_items/filter_across_project
{
  "work_item_ids": [123456, 789012],
  "page_num": 1,
  "page_size": 50
}
```

---

## 4. 配置项

### 4.1 Server 环境变量

```bash
# .env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx  # GitHub Personal Access Token
```

Token 需要权限：
- `repo` - 访问仓库内容

### 4.2 Extension 配置

无需新增配置，复用现有 Server URL 配置。

---

## 5. UI 设计

### 5.1 Popup 界面

**AutomationPage 中 GitHub 平台显示**：

```
┌─────────────────────────────┐
│  Octo 跨平台协同助手          │
├─────────────────────────────┤
│  GitHub 功能                 │
│  ┌───────────────────────┐  │
│  │ 🔍 反查 Meegle 工作项 │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│  [查询结果展示区域]           │
│  ┌───────────────────────┐  │
│  │ 需求: 修复登录流程问题 │  │
│  │ 状态: 进行中           │  │
│  │ Sprint: Sprint 15      │  │
│  │ 优先级: P0             │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

### 5.2 交互流程

1. 用户打开 GitHub PR 页面
2. 点击扩展图标打开 Popup
3. Popup 检测到 GitHub 平台，显示「反查 Meegle 工作项」按钮
4. 用户点击按钮，显示加载状态
5. Server 完成查询，返回结果
6. Popup 展示查询到的 Meegle 工作项列表

---

## 6. 错误处理

### 6.1 用户可见错误

| 场景 | 提示信息 |
|------|----------|
| 未提取到 Meegle ID | "未在 PR 中找到 Meegle 工作项 ID" |
| GitHub API 失败 | "GitHub API 调用失败，请检查 Token 配置" |
| Meegle API 失败 | "Meegle 查询失败，请稍后重试" |

### 6.2 降级策略

- 如果 GitHub API 部分失败（如评论获取失败），仍使用已获取的数据继续查询
- 如果 Meegle API 返回部分结果，展示成功查询的工作项，标记失败项

---

## 7. 测试策略

### 7.1 单元测试

| 组件 | 测试内容 |
|------|----------|
| `MeegleIdExtractor` | 各种 ID 格式的提取和去重 |
| `GitHubClient` | URL 解析、API 调用封装 |
| `GitHubReverseLookupController` | 完整流程编排 |

### 7.2 集成测试

- 使用真实 GitHub PR 测试端到端流程
- 使用 Mock Server 测试错误场景

---

## 8. 后续扩展（可选）

- 缓存机制：缓存已查询的 PR 结果，减少 API 调用
- 自动触发：可选配置，打开 PR 页面自动查询
- 批量查询：支持一次查询多个 PR

---

## 9. 附录

### 9.1 相关文件引用

- `server/src/adapters/meegle/meegle-client.ts` - Meegle API 客户端
- `extension/src/platform-url.ts` - 平台 URL 识别
- `extension/src/popup-shared/popup-controller.ts` - Popup 状态管理
- `extension/wxt.config.ts` - 扩展配置

### 9.3 与 Hermes 文档的交叉验证

本设计参考并对比了 `.hermes/plans/2026-04-21_144647-conversation-plan.md` 中的调研结果：

| 方面 | Hermes 文档建议 | 本设计决策 | 理由 |
|------|----------------|------------|------|
| Meegle ID 格式 | 支持任意前缀 `[a-zA-Z][a-zA-Z0-9]*-\d+` | **固定 4 种格式** | 减少误匹配（避免版本号、日期等），覆盖 95%+ 实际场景 |
| 架构 | Extension 传文本给 Server | **Server 调 GitHub API** | 提取逻辑统一维护，减少 Extension 复杂度 |
| GitHub Token 位置 | Server 端 | Server 端 | ✓ 一致 |
| Meegle API | `filter_across_project` 按 `work_item_ids` 查询 | ✓ 一致 | 无需 projectKey 和 workitemTypeKey |

关键差异说明：
1. **ID 提取规则**：Hermes 建议支持任意前缀，但考虑到版本号（`v-1.2.3`）、日期等常见格式的误匹配风险，本设计采用固定规则
2. **架构选择**：Hermes 考虑了 Extension 提取文本的方案，但本设计明确采用 Server 端调 GitHub API，原因见 [2.1.1 架构对比](#211-架构对比)
