# IT PM Assistant - 浏览器扩展

浏览器扩展插件，用于 Lark 到 Meegle 的半自动工单创建。

## 功能

- **Lark A1 页面识别**: 自动检测支持工单页面，生成 B2 Bug 草稿
- **Lark A2 页面识别**: 自动检测需求页面，生成 B1 任务草稿
- **Meegle 认证桥**: 在 Meegle 页面直接申请 auth code，完成认证流程
- **Popup 操作界面**: 提供分析、生成草稿、确认创建的交互界面

## 安装方法

### 开发模式安装（Chrome/Edge）

1. 打开浏览器扩展管理页面：
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`

2. 启用「开发者模式」（右上角开关）

3. 点击「加载已解压的扩展程序」

4. 选择 `extension/` 目录（包含 `manifest.json` 的目录）

5. 安装完成后，扩展图标会出现在浏览器工具栏

### 构建

```bash
cd extension
npm install
npm run build
```

构建产物输出到 `dist/` 目录。

## 使用方法

### 1. 启动服务端

扩展需要配合服务端使用。先启动服务端：

```bash
cd ../server
npm install
npm start
```

服务端默认运行在 `http://localhost:3000`

### 2. 配置服务端地址

编辑 `src/popup.html` 中的 `SERVER_URL` 变量（如需要修改默认地址）。

### 3. 使用流程

1. 打开 Lark 工单页面（A1 或 A2）
2. 点击扩展图标打开 popup
3. 点击「分析当前页面」获取分析结果
4. 点击「生成草稿」创建 Meegle 工作项草稿
5. 确认草稿内容后点击「确认创建」

### 快捷键

- `Alt+A` - 分析当前页面
- `Alt+D` - 生成草稿

## 权限说明

| 权限 | 用途 |
|------|------|
| `tabs` | 检测当前页面类型和 URL |
| `activeTab` | 在当前页面注入内容脚本 |
| `scripting` | 动态注入内容脚本 |
| `storage` | 存储用户配置和认证状态 |
| `host_permissions` | 访问 Lark、Meegle 和服务端 API |

## 目录结构

```
extension/
├── manifest.json          # 扩展配置文件
├── package.json
├── tsconfig.json
├── src/
│   ├── types/
│   │   ├── protocol.ts    # 消息协议类型定义
│   │   ├── context.ts     # 页面上下文类型
│   │   └── meegle.ts      # Meegle 相关类型
│   ├── background/
│   │   ├── router.ts      # 消息路由
│   │   └── handlers/
│   │       ├── meegle-auth.ts
│   │       └── a1.ts
│   ├── page-bridge/
│   │   └── meegle-auth.ts # 页面认证桥
│   ├── content-scripts/
│   │   ├── lark.ts        # Lark 页面脚本
│   │   └── meegle.ts      # Meegle 页面脚本
│   └── popup.html         # Popup 界面
├── tests/
│   ├── e2e/
│   │   └── auth-bridge.test.ts
│   ├── protocol.test.ts
│   └── meegle-auth-handler.test.ts
└── dist/                  # 构建产物
```

## 消息协议

### UI → Background

| Action | 描述 |
|--------|------|
| `itdog.identity.resolve` | 解析当前用户身份 |
| `itdog.meegle.auth.ensure` | 确保 Meegle 认证状态 |
| `itdog.a1.analyze` | 分析 A1 工单 |
| `itdog.a1.create_b2_draft` | 生成 B2 草稿 |
| `itdog.a1.apply_b2` | 确认创建 B2 |
| `itdog.a2.analyze` | 分析 A2 需求 |
| `itdog.a2.create_b1_draft` | 生成 B1 草稿 |
| `itdog.a2.apply_b1` | 确认创建 B1 |

### Background → Page Bridge

| Action | 描述 |
|--------|------|
| `itdog.page.meegle.auth_code.request` | 请求 auth code |

## 开发

```bash
# 监听模式
npm run dev

# 运行测试
npm test
```

## 与服务端集成

扩展通过 HTTP 与服务端通信。主要接口：

| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/identity/resolve` | POST | 解析身份 |
| `/api/meegle/auth/exchange` | POST | 交换 auth code |
| `/api/meegle/auth/status` | POST | 查询认证状态 |
| `/api/a1/analyze` | POST | 分析 A1 |
| `/api/a1/create-b2-draft` | POST | 创建 B2 草稿 |
| `/api/a1/apply-b2` | POST | 应用 B2 |

详见 [server/README.md](../server/README.md)

## 故障排除

### 扩展无法连接到服务端

1. 确认服务端已启动：`curl http://localhost:3000/health`
2. 检查浏览器控制台是否有 CORS 错误
3. 确认 `manifest.json` 中的 `host_permissions` 包含服务端地址

### Meegle 认证失败

1. 确认已登录 Meegle
2. 检查 Meegle 页面是否正常加载
3. 查看浏览器控制台的认证相关日志

### Lark 页面无法识别

1. 确认访问的是 Lark 多维表页面
2. 检查 URL 格式是否包含 `/base/` 和 `/table/`
3. 刷新页面后重试

## 下一步计划

当前实现的是最小可运行版本。下一步需要：

1. **接入真实 Lark API** - 读取真实工单数据
2. **接入真实 Meegle API** - 创建工作项
3. **完善 Popup UI** - 更友好的交互界面
4. **添加 A2 → B1 流程** - 对称的需求转任务流程
5. **添加 PM 即时分析** - 跨平台项目状态分析
