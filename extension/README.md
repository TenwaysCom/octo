# Tenways Octo - 浏览器扩展

浏览器扩展负责页面识别、上下文采集、授权触发和结果展示；真正的业务编排与建单逻辑在服务端完成。

## 当前对外术语

| 旧术语 | 当前对外名称 |
|------|------|
| `A1` | `Lark Bug` |
| `A2` | `Lark User Story` |
| `B1` | `Meegle User Story` |
| `B2` | `Meegle Product Bug` |

说明：
- 插件内部消息 action 使用 `octo.*` 命名空间
- 插件访问服务端使用当前公开 HTTP 路径

## 功能

- 识别 Lark Bug 页面并触发 `Meegle Product Bug` 草稿 / apply
- 识别 Lark User Story 页面并触发 `Meegle User Story` 草稿 / apply
- 在 Meegle 页面申请 auth code，完成授权
- 通过 popup 或注入按钮展示状态与操作入口
- 透传服务端业务错误码，并在页面侧展示更明确的失败提示

## 构建与安装

```bash
pnpm --dir extension install
pnpm --dir extension build
```

WXT 构建产物目录：

```text
extension/.output/chrome-mv3/
```

开发模式安装：

1. 打开 `chrome://extensions/`
2. 启用开发者模式
3. 点击“加载已解压的扩展程序”
4. 选择 `extension/.output/chrome-mv3/`

## 开发命令

```bash
pnpm --dir extension dev
pnpm --dir extension test
pnpm --dir extension typecheck
pnpm --dir extension build
```

## 使用流程

1. 启动服务端
2. 打开 Lark 页面，进入 `Lark Bug` 或 `Lark User Story`
3. 打开 popup，确认身份与授权
4. 分析、生成草稿、确认提交
5. 服务端返回创建结果后在页面侧展示状态

## 插件内部消息

### UI / Content Script -> Background

| Action | 描述 |
|------|------|
| `octo.identity.resolve` | 解析当前身份 |
| `octo.meegle.auth.ensure` | 确保 Meegle 认证状态 |
| `octo.lark.auth.ensure` | 确保 Lark 认证状态 |
| `octo.lark.auth.callback.detected` | 接收 Lark OAuth 回调结果 |
| `octo.lark_base.create_workitem` | 从 Lark Base 记录创建 Meegle 工作项 |
| `octo.lark_base.bulk_preview_workitems` | 批量预览 Lark Base 到 Meegle 的创建结果 |
| `octo.lark_base.bulk_create_workitems` | 批量创建 Meegle 工作项 |
| `octo.pm.analysis.run` | 运行 PM 即时分析 |

### Background -> Page Bridge

| Action | 描述 |
|------|------|
| `octo.page.meegle.auth_code.request` | 请求 auth code |

## 与服务端的主要接口

| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/identity/resolve` | POST | 解析身份 |
| `/api/meegle/auth/exchange` | POST | 交换 auth code |
| `/api/meegle/auth/status` | POST | 查询认证状态 |
| `/api/lark-bug/analyze` | POST | 分析 Lark Bug |
| `/api/lark-bug/to-meegle-product-bug/draft` | POST | 创建 Meegle Product Bug 草稿 |
| `/api/lark-bug/to-meegle-product-bug/apply` | POST | 应用 Meegle Product Bug |
| `/api/lark-user-story/analyze` | POST | 分析 Lark User Story |
| `/api/lark-user-story/to-meegle-user-story/draft` | POST | 创建 Meegle User Story 草稿 |
| `/api/lark-user-story/to-meegle-user-story/apply` | POST | 应用 Meegle User Story |

兼容说明：
- 服务端仍接受旧 `/api/a1/*` 和 `/api/a2/*`

## 身份与错误处理约定

- apply 请求优先透传页面上下文里的 `masterUserId`
- 如果页面侧没有 `masterUserId`，服务端会退回到 `operatorLarkId` 反查
- background 会保留服务端 `errorCode`
- 注入按钮遇到 `MEEGLE_AUTH_REQUIRED` 时会提示先重新授权，而不是统一显示泛化失败

## 故障排除

### 扩展无法连接服务端

1. 确认 `http://localhost:3000/health` 可访问
2. 检查 popup 设置里的服务端地址
3. 检查浏览器控制台是否存在 CORS 或 network 错误

### Meegle 授权失败

1. 确认当前 Meegle 页面已登录
2. 检查插件 ID 和服务端 Meegle 配置
3. 如页面提示 `MEEGLE_AUTH_REQUIRED`，重新走一次授权

### Lark 页面未识别

1. 确认访问的是 Lark 多维表详情页
2. 检查 URL 是否包含 `/base/`、`/table/`、`/record/`
3. 刷新页面重试
