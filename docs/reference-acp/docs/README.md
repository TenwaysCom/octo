# ACP Coding Agent

基于 **ACP (Agent Client Protocol)** 协议的 AI 编程助手系统，支持多轮对话、文件上传、代码生成和 Diff 查看。

## 🌟 特性

- **🤖 ACP 协议兼容** - 遵循 Agent Client Protocol 标准，支持 MCP 多模态内容
- **💬 多轮对话** - 保持上下文记忆，支持复杂编程任务的连续对话
- **📁 文件上传** - 支持代码文件、图片等多模态输入，自动解析代码结构
- **⚡ 流式响应** - SSE (Server-Sent Events) 实时输出，低延迟体验
- **🔍 代码 Diff** - 可视化代码变更对比，支持一键应用修改
- **🌐 Chrome 扩展** - 浏览器插件支持，一键抓取网页代码进行分析

## 📁 项目结构

```
acp-coding-agent/
├── server/                    # Python FastAPI 服务端
│   ├── server.py             # 主程序入口
│   ├── models.py             # ACP 协议模型定义
│   ├── session_manager.py    # 会话管理器
│   ├── file_handler.py       # 文件上传处理
│   └── requirements.txt      # Python 依赖
│
├── chrome-extension/          # Chrome 浏览器扩展
│   ├── manifest.json           # 扩展配置
│   ├── background.js          # Service Worker (后台)
│   ├── content.js             # 内容脚本 (页面抓取)
│   ├── popup/                 # 弹出窗口界面
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── options/               # 设置页面
│   │   ├── options.html
│   │   └── options.js
│   ├── lib/                   # 工具库
│   │   └── sse-client.js
│   └── icons/                 # 扩展图标
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
│
└── docs/                      # 文档
    ├── README.md              # 本文件
    ├── ARCHITECTURE.md        # 架构详解
    └── API.md                 # API 接口文档
```

## 🚀 快速开始

### 1. 启动服务端

```bash
cd server

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
python server.py
```

服务将运行在 `http://localhost:8000`，自动打开交互式 API 文档：`http://localhost:8000/docs`

### 2. 配置环境变量 (可选)

```bash
# Linux/macOS
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://api.openai.com/v1"
export LLM_MODEL="gpt-4"

# Windows
set LLM_API_KEY=your-api-key
```

### 3. 安装 Chrome 扩展

1. 打开 Chrome 浏览器，进入 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `chrome-extension` 文件夹
5. 固定扩展图标到工具栏

### 4. 使用指南

#### 基础对话
1. 点击扩展图标打开聊天窗口
2. 输入编程问题，如："如何优化这段 Python 代码？"
3. 查看流式返回的 AI 回复

#### 文件上传分析
1. 点击 📎 按钮选择代码文件
2. 上传成功后，文件会显示在文件列表
3. 在对话中直接引用文件内容

#### 抓取网页代码
- 在 GitHub/GitLab/Stack Overflow 页面，点击扩展图标
- 自动抓取页面代码到聊天上下文
- 也可点击悬浮的 🤖 按钮快速捕获

#### 代码编辑与 Diff
1. 输入指令："请重构这段代码，添加错误处理"
2. AI 返回 Diff 格式的代码变更
3. 在弹出的 Diff 窗口中对比查看
4. 点击「应用变更」或「复制代码」

## 🔧 配置选项

### 服务端配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `ACP_HOST` | `0.0.0.0` | 服务器监听地址 |
| `ACP_PORT` | `8000` | 服务器端口 |
| `ACP_UPLOAD_DIR` | `./uploads` | 文件上传存储目录 |
| `ACP_MAX_FILE_SIZE` | `10485760` | 最大文件大小 (10MB) |
| `LLM_API_KEY` | - | LLM API 密钥 |
| `LLM_BASE_URL` | - | LLM API 基础 URL |
| `LLM_MODEL` | `gpt-4` | 默认使用的模型 |

### 支持的模型

- **OpenAI**: gpt-4, gpt-4-turbo, gpt-3.5-turbo
- **Anthropic**: claude-3-5-sonnet, claude-3-opus
- **Moonshot (Kimi)**: kimi-latest
- **本地模型**: Ollama, LM Studio (通过 OpenAI 兼容接口)

## 📚 文档

- [架构详解](ARCHITECTURE.md) - 系统架构、数据流、协议规范
- [API 文档](API.md) - 详细的 API 接口说明

## 🔌 集成其他 Agent 框架

本服务端实现的是 **Agent Client Protocol (ACP)**，可与其他兼容 ACP 的客户端集成：

- **VS Code 扩展** - 通过 ACP 协议连接
- **Claude Code** - 作为外部 Tool Server
- **OpenClaw / LangChain** - 作为 Agent 节点
- **其他 MCP/ACP 兼容工具**

## 🤝 开发贡献

### 本地开发

```bash
# 服务端热重载
uvicorn server:app --reload --port 8000

# 调试模式
export DEBUG=1
python server.py
```

### 添加新的 LLM 支持

编辑 `server.py` 中的 `stream_llm_response` 函数，添加新的模型调用逻辑：

```python
async def stream_llm_response(messages, session_id, model):
    if model.startswith("claude"):
        # 调用 Anthropic API
        async for chunk in call_claude_api(messages):
            yield chunk
    elif model.startswith("kimi"):
        # 调用 Moonshot API
        async for chunk in call_kimi_api(messages):
            yield chunk
```

## 📄 许可证

MIT License - 详见 LICENSE 文件

## 🙏 致谢

- [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol) - 协议基础
- [FastAPI](https://fastapi.tiangolo.com/) - Web 框架
- [Zed Editor](https://zed.dev/) - ACP 协议提出者

---

**项目状态**: Beta - 核心功能已完成，持续优化中

**最新更新**: 2024-XX
