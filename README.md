# Octo - Tenways IT  Assistant

跨平台协同助手 - 帮助用户在 Lark、Meegle、GitHub 之间更高效地推进工单、需求和项目分析。

## 核心价值

> 跨平台半自动建单 + A1/A2 智能分析补全 + PM 即时分析

## 项目结构

```
octo/
├── extension/              # 浏览器扩展插件
│   ├── src/
│   │   ├── types/         # 类型定义
│   │   ├── background/    # Background 脚本
│   │   ├── content-scripts/ # 内容脚本
│   │   ├── page-bridge/   # 页面认证桥
│   │   └── popup.html     # Popup 界面
│   ├── manifest.json
│   ├── package.json
│   └── README.md
├── server/                 # 服务端 API
│   ├── src/
│   │   ├── adapters/      # 平台适配器
│   │   ├── application/   # 应用服务层
│   │   ├── modules/       # API 模块
│   │   └── validators/    # 校验器
│   ├── tests/
│   ├── package.json
│   └── README.md
├── meegle_clients/         # Meegle API 客户端参考
│   └── ...
└── docs/                   # 设计文档
    ├── it-pm-assistant/   # IT PM Assistant 设计文档
    │   ├── 01-requirements-overview.md
    │   ├── 02-business-flow.md
    │   ├── 03-prd.md
    │   ├── 04-architecture.md
    │   ├── 05-ai-agent-skill-design.md
    │   ├── 06-data-security.md
    │   ├── 07-phase-1-rollout.md
    │   ├── 08-open-questions.md
    │   ├── 09-meegle-adapter-design.md
    │   ├── 10-meegle-auth-bridge-design.md
    │   ├── 11-extension-message-and-api-schema.md
    │   ├── 12-field-schema-and-state-machine.md
    │   └── 13-code-structure-and-validation-design.md
    └── superpowers/
        └── specs/
            └── 2026-03-20-it-pm-assistant-design.md
```

## 快速开始

### 1. 启动服务端

```bash
cd server
npm install
npm run dev
```

服务端运行在 `http://localhost:3000`

**API 端点：**
- `GET /health` - 健康检查
- `POST /api/identity/resolve` - 身份解析
- `POST /api/meegle/auth/exchange` - Meegle 认证
- `POST /api/a1/analyze` - A1 工单分析
- `POST /api/a1/create-b2-draft` - 生成 B2 草稿
- `POST /api/a1/apply-b2` - 创建 B2
- `POST /api/a2/analyze` - A2 需求分析
- `POST /api/a2/create-b1-draft` - 生成 B1 草稿
- `POST /api/a2/apply-b1` - 创建 B1
- `POST /api/pm/analysis/run` - PM 即时分析

### 2. 安装浏览器扩展

**构建扩展：**

```bash
cd extension
npm install
npm run build
```

**加载到浏览器：**

1. 打开 Chrome/Edge 浏览器
2. 访问 `chrome://extensions/`
3. 启用右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `extension/dist` 目录（不是 extension 目录）
6. 扩展图标出现在工具栏后，点击图钉固定

**扩展打包：**

构建后的 `extension/dist` 目录包含所有可部署文件：
```
extension/dist/
├── manifest.json       # 扩展清单
├── popup.html          # 弹窗界面
├── background/         # Background 脚本
├── content-scripts/    # 内容脚本
├── page-bridge/        # 页面认证桥
└── types/              # 类型定义
```

可将 `dist` 目录打包为 `.crx` 文件发布到 Chrome Web Store。

### 3. 使用

1. 打开 Lark 工单页面（A1 或 A2）
2. 点击扩展图标
3. 点击「分析当前页面」
4. 生成草稿并确认创建

详细使用说明见 [extension/README.md](extension/README.md) 和 [server/README.md](server/README.md)

## 功能特性

### A1 → B2 半自动建单

在 Lark A1（支持工单）页面：
- 智能分析工单内容
- 判断是否应转为 Meegle B2（产线 Bug）
- 自动生成 Bug 草稿（标题、描述、优先级、环境信息）
- 用户确认后创建 Meegle 工作项

### A2 → B1 半自动建单

在 Lark A2（需求池）页面：
- 结构化分析需求内容
- 识别信息缺口
- 生成研发可执行的任务草稿
- 用户确认后创建 Meegle 工作项

### PM 即时分析

选择分析范围后：
- 实时拉取 Lark、Meegle、GitHub 数据
- 识别阻塞项、滞留项、描述不完整项
- 输出一次性分析报告和建议动作

## 设计原则

1. **不替代现有平台** - 只做协同增强，不做独立 PM 看板
2. **不维护业务镜像** - 实时拉取最新数据
3. **AI 集中在服务端** - 以 `agents + skills` 形式编排
4. **浏览器插件轻量** - 只做触发器、上下文采集和展示
5. **一切执行保留人工确认** - 不全自动写入

## 技术栈

| 组件 | 技术 |
|------|------|
| 浏览器扩展 | TypeScript, Web Extensions Manifest V3 |
| 服务端 | Node.js, TypeScript, Express |
| AI Agent | Anthropic Claude API (待集成) |
| 测试 | Vitest |

## 当前状态

### 已完成

- [x] 项目脚手架
- [x] 类型定义和协议层
- [x] Extension Background Router
- [x] Extension Popup 界面
- [x] 服务端 API 框架
- [x] 身份解析模块（内存存储）
- [x] Meegle 认证模块（内存存储）
- [x] A1/A2 工作流服务（mock 数据）
- [x] Agent 输出校验器
- [x] 单元测试和 E2E 测试框架

### 待完成

- [ ] 真实 Lark API 集成
- [ ] 真实 Meegle API 集成
- [ ] 数据库持久化
- [ ] AI Agent 实现
- [ ] GitHub API 集成
- [ ] 审计日志和幂等性检查

## 开发

### 扩展开发

```bash
cd extension
npm run dev  # 监听模式
```

### 服务端开发

```bash
cd server
npm run dev  # 监听模式
npm test     # 运行测试
```

### 运行测试

```bash
# Extension 测试
cd extension && npm test

# Server 测试
cd server && npm test
```

## 文档索引

### 产品设计

- [需求概述](docs/it-pm-assistant/01-requirements-overview.md)
- [业务流程设计](docs/it-pm-assistant/02-business-flow.md)
- [PRD](docs/it-pm-assistant/03-prd.md)

### 架构设计

- [总体架构设计](docs/it-pm-assistant/04-architecture.md)
- [AI Agent / Skill 设计](docs/it-pm-assistant/05-ai-agent-skill-design.md)
- [数据与安全设计](docs/it-pm-assistant/06-data-security.md)

### 实施路线

- [一期实施路线](docs/it-pm-assistant/07-phase-1-rollout.md)
- [详细开发计划](docs/superpowers/plans/2026-03-23-it-pm-assistant-phase1.md)

### 技术设计

- [开放问题与待补设计](docs/it-pm-assistant/08-open-questions.md)
- [Meegle Adapter 适配设计](docs/it-pm-assistant/09-meegle-adapter-design.md)
- [Meegle 轻认证桥设计](docs/it-pm-assistant/10-meegle-auth-bridge-design.md)
- [插件消息协议与 API Schema](docs/it-pm-assistant/11-extension-message-and-api-schema.md)
- [字段 Schema 与状态机](docs/it-pm-assistant/12-field-schema-and-state-machine.md)
- [代码结构与校验设计](docs/it-pm-assistant/13-code-structure-and-validation-design.md)

## 下一步计划

根据 [一期实施路线](docs/it-pm-assistant/07-phase-1-rollout.md)，下一步优先：

1. **完成 A2 → B1 流程** - 与 A1 → B2 对称的需求转任务流程
2. **接入真实 Meegle API** - 基于 `meegle_clients` 实现认证和工作项创建
3. **接入真实 Lark API** - 读取真实工单数据
4. **编写集成测试** - 端到端验证完整流程

## License

Private
