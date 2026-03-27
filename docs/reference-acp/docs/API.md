# ACP Coding Agent - API 文档

完整的 RESTful API 接口说明，支持多轮对话、文件上传、代码生成等编程助手功能。

**基础 URL**: `http://localhost:8000`

**协议版本**: `acp-v1.0`

**Content-Type**: `application/json`

---

## 目录

1. [通用接口](#通用接口)
2. [会话管理](#会话管理)
3. [对话接口](#对话接口)
4. [文件上传](#文件上传)
5. [代码编辑](#代码编辑)
6. [数据模型](#数据模型)

---

## 通用接口

### 健康检查

```http
GET /
```

**响应**:
```json
{
  "status": "ok",
  "protocol": "acp-v1.0",
  "version": "1.0.0",
  "features": [
    "multi-turn-chat",
    "file-upload",
    "streaming-response",
    "code-diff",
    "session-management"
  ],
  "models_available": ["gpt-4", "claude-3-5-sonnet", "kimi-latest"]
}
```

### 获取统计信息

```http
GET /v1/stats
```

**响应**:
```json
{
  "total_sessions": 10,
  "total_messages": 156,
  "active_sessions_last_hour": 3,
  "memory_usage_mb": 12.34
}
```

---

## 会话管理

### 创建会话

会话是上下文管理的基本单位，所有对话都在会话内进行。

```http
POST /v1/chat
Content-Type: application/json

{
  "message": "开始新会话",
  "context": {
    "project_path": "/home/user/myproject",
    "language": "python"
  },
  "stream": false
}
```

**响应**:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": {
    "id": "msg_xxx",
    "role": "assistant",
    "content": [{"type": "text", "text": "会话已创建"}],
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2024-01-15T10:30:00"
  },
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 5,
    "total_tokens": 15
  }
}
```

### 获取会话详情

```http
GET /v1/sessions/{session_id}
```

**响应**:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2024-01-15T10:00:00",
  "updated_at": "2024-01-15T10:30:00",
  "message_count": 5,
  "files": [
    {
      "original_name": "main.py",
      "stored_name": "20240115_103000_a1b2c3d4_main.py",
      "path": "uploads/550e8400-e29b-41d4-a716-446655440000/20240115_103000_a1b2c3d4_main.py",
      "size": 1024,
      "mime_type": "text/x-python",
      "is_code": true,
      "line_count": 50
    }
  ],
  "context": {
    "project_path": "/home/user/myproject",
    "language": "python"
  },
  "model": "gpt-4",
  "messages": [
    {
      "id": "msg_1",
      "role": "system",
      "content": [{"type": "text", "text": "你是一个编程助手"}],
      "timestamp": "2024-01-15T10:00:00"
    },
    {
      "id": "msg_2",
      "role": "user",
      "content": [{"type": "text", "text": "帮我优化代码"}],
      "timestamp": "2024-01-15T10:05:00"
    }
  ]
}
```

### 清空会话消息

保留会话本身，但清空所有对话历史（保留 system prompt）。

```http
POST /v1/sessions/{session_id}/clear
```

**响应**:
```json
{
  "status": "messages_cleared",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 删除会话

删除会话并清理所有关联文件。

```http
DELETE /v1/sessions/{session_id}
```

**响应**:
```json
{
  "status": "deleted",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "files_removed": 2
}
```

---

## 对话接口

### 流式对话 (SSE)

Server-Sent Events 实时返回 AI 生成的内容，适合长文本生成场景。

```http
POST /v1/chat
Content-Type: application/json
Accept: text/event-stream

{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "请分析这段代码的性能问题",
  "context": {
    "current_file": "main.py"
  },
  "stream": true,
  "temperature": 0.7,
  "model": "gpt-4"
}
```

**SSE 响应流**:
```
data: {"type": "content_delta", "delta": "我来", "msg_id": "msg_xxx", "session_id": "550e8400-..."}

data: {"type": "content_delta", "delta": "分析", "msg_id": "msg_xxx", "session_id": "550e8400-..."}

data: {"type": "content_delta", "delta": "一下...", "msg_id": "msg_xxx", "session_id": "550e8400-..."}

data: {"type": "done", "msg_id": "msg_xxx", "session_id": "550e8400-..."}
```

**事件类型说明**:

| 类型 | 说明 | 数据字段 |
|------|------|----------|
| `content_delta` | 文本增量 | `delta`: 新增的文本片段 |
| `tool_call` | 工具调用 | `tool_name`, `parameters` |
| `done` | 流结束 | - |
| `error` | 错误 | `error`: 错误信息 |

### 非流式对话

适合快速问答场景，一次性返回完整响应。

```http
POST /v1/chat
Content-Type: application/json

{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Python 中如何实现异步文件读取？",
  "stream": false
}
```

**响应**:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": {
    "id": "msg_xxx",
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "在 Python 中，可以使用 aiofiles 库实现异步文件读取..."
      }
    ],
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2024-01-15T10:30:00"
  },
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 150,
    "total_tokens": 170
  }
}
```

### 带文件引用的对话

上传文件后，在对话中引用文件内容。

```http
POST /v1/chat
Content-Type: application/json

{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "请重构这段代码，添加类型注解",
  "stream": true,
  "context": {
    "attached_files": ["main.py", "utils.py"],
    "project_type": "fastapi"
  }
}
```

**说明**: 服务端会自动读取关联文件的代码内容，添加到 LLM 上下文中。

---

## 文件上传

### 上传单个文件

支持代码文件、图片等多种类型。

```http
POST /v1/upload?session_id=550e8400-e29b-41d4-a716-446655440000
Content-Type: multipart/form-data

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="file"; filename="main.py"
Content-Type: text/x-python

[文件内容...]
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="description"

项目主程序文件
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

**响应**:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "file_info": {
    "original_name": "main.py",
    "stored_name": "20240115_103000_a1b2c3d4_main.py",
    "path": "uploads/550e8400-e29b-41d4-a716-446655440000/20240115_103000_a1b2c3d4_main.py",
    "relative_path": "550e8400-e29b-41d4-a716-446655440000/20240115_103000_a1b2c3d4_main.py",
    "size": 1024,
    "mime_type": "text/x-python",
    "extension": ".py",
    "is_code": true,
    "is_image": false,
    "is_document": false,
    "line_count": 50,
    "preview": "import asyncio\n\nasync def main():\n    ...",
    "md5_hash": "d41d8cd98f00b204e9800998ecf8427e",
    "uploaded_at": "2024-01-15T10:30:00"
  },
  "message": "文件 'main.py' 上传成功"
}
```

### 上传图片 (多模态)

```http
POST /v1/upload?session_id=xxx
Content-Type: multipart/form-data

[图片文件数据...]
```

**响应** (图片特有字段):
```json
{
  "file_info": {
    "original_name": "screenshot.png",
    "mime_type": "image/png",
    "is_image": true,
    "base64_preview": "iVBORw0KGgoAAAANSUhEUgAA...",
    "image_metadata": {
      "format": "PNG",
      "mode": "RGBA",
      "width": 1920,
      "height": 1080
    }
  }
}
```

### 支持的文件类型

| 类别 | 扩展名 | MIME 类型 | 处理方式 |
|------|--------|-----------|----------|
| Python | .py | text/x-python | 代码解析、AST 分析 |
| JavaScript | .js, .jsx | text/javascript | 代码解析 |
| TypeScript | .ts, .tsx | text/typescript | 代码解析 |
| Java | .java | text/x-java | 代码解析 |
| C/C++ | .c, .cpp | text/x-c++ | 代码解析 |
| Go | .go | text/x-go | 代码解析 |
| Rust | .rs | text/x-rust | 代码解析 |
| HTML | .html | text/html | 代码解析 |
| CSS | .css, .scss | text/css | 代码解析 |
| JSON | .json | application/json | 格式化 |
| Markdown | .md | text/markdown | 渲染 |
| 图片 | .png, .jpg, .jpeg | image/* | Base64 编码 |
| 文档 | .pdf | application/pdf | 存储 |

---

## 代码编辑

### 生成代码 Diff

根据自然语言指令生成代码变更，以 Diff 格式返回。

```http
POST /v1/edit-code
Content-Type: application/json

{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "file_path": "uploads/550e8400-e29b-41d4-a716-446655440000/20240115_103000_a1b2c3d4_main.py",
  "instruction": "添加错误处理并优化性能",
  "code_context": "可选的周围代码片段"
}
```

**响应**:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "diff": {
    "type": "diff",
    "file_path": "uploads/550e8400-e29b-41d4-a716-446655440000/20240115_103000_a1b2c3d4_main.py",
    "original": "async def process():\n    data = await fetch()\n    return data",
    "modified": "async def process():\n    try:\n        data = await fetch()\n        return data\n    except Exception as e:\n        logger.error(f'Error: {e}')\n        return None",
    "language": "python",
    "description": "根据指令 '添加错误处理并优化性能' 生成的代码变更"
  },
  "explanation": "添加了 try-except 错误处理块，并引入了日志记录"
}
```

**客户端渲染建议**:

使用 `diff2html` 或类似库渲染对比视图:

```javascript
// 原始代码 (红色背景)
diffView.renderOriginal(response.diff.original);

// 修改后 (绿色背景)
diffView.renderModified(response.diff.modified);
```

---

## 数据模型

### ContentBlock (内容块)

消息的基本组成单元。

#### TextContent
```json
{
  "type": "text",
  "text": "字符串内容"
}
```

#### ImageContent
```json
{
  "type": "image",
  "mime_type": "image/png",
  "data": "Base64编码的图片数据",
  "caption": "图片描述（可选）"
}
```

#### FileContent
```json
{
  "type": "file",
  "mime_type": "text/x-python",
  "uri": "uploads/session_id/filename.py",
  "name": "filename.py",
  "size": 1024,
  "preview": "文件内容预览"
}
```

#### DiffContent (ACP 扩展)
```json
{
  "type": "diff",
  "file_path": "path/to/file.py",
  "original": "原始代码",
  "modified": "修改后的代码",
  "language": "python",
  "description": "修改说明"
}
```

### Message (消息)

```json
{
  "id": "uuid-string",
  "role": "user | assistant | system | tool",
  "content": [ContentBlock],
  "session_id": "uuid-string",
  "timestamp": "2024-01-15T10:30:00",
  "metadata": {},
  "is_finished": true
}
```

### Session (会话)

```json
{
  "session_id": "uuid-string",
  "messages": [Message],
  "created_at": "2024-01-15T10:00:00",
  "updated_at": "2024-01-15T10:30:00",
  "context": {
    "project_path": "/path/to/project",
    "language": "python"
  },
  "files": [FileInfo],
  "model": "gpt-4",
  "temperature": 0.7,
  "message_count": 10,
  "total_tokens": 1500
}
```

---

## 错误处理

### 错误响应格式

```json
{
  "detail": "错误描述",
  "error_code": "SESSION_NOT_FOUND",
  "suggestion": "建议的解决方案"
}
```

### HTTP 状态码

| 状态码 | 说明 | 常见场景 |
|--------|------|----------|
| 200 | 成功 | 正常响应 |
| 201 | 创建成功 | 新会话创建 |
| 400 | 请求参数错误 | 缺少必要字段 |
| 404 | 资源不存在 | 会话 ID 无效 |
| 413 | 文件过大 | 超过 10MB 限制 |
| 422 | 验证错误 | 参数格式不正确 |
| 500 | 服务器内部错误 | LLM API 调用失败 |
| 503 | 服务不可用 | 服务器过载 |

### 常见错误代码

| 错误代码 | 说明 | 处理建议 |
|----------|------|----------|
| `SESSION_NOT_FOUND` | 会话不存在 | 检查 session_id 或创建新会话 |
| `FILE_TOO_LARGE` | 文件超过大小限制 | 压缩文件或分批上传 |
| `INVALID_FILE_TYPE` | 不支持的文件类型 | 检查文件扩展名 |
| `LLM_API_ERROR` | LLM 调用失败 | 检查 API Key 和网络连接 |
| `RATE_LIMITED` | 请求过于频繁 | 降低请求频率 |

---

## 代码示例

### Python 客户端

```python
import requests
import json

BASE_URL = "http://localhost:8000"

# 1. 创建会话
response = requests.post(f"{BASE_URL}/v1/chat", json={
    "message": "开始新会话",
    "context": {"project": "myproject"},
    "stream": False
})
session_id = response.json()["session_id"]
print(f"会话 ID: {session_id}")

# 2. 上传文件
with open("main.py", "rb") as f:
    files = {"file": ("main.py", f, "text/x-python")}
    response = requests.post(
        f"{BASE_URL}/v1/upload?session_id={session_id}",
        files=files,
        data={"description": "主程序"}
    )
print(f"上传成功: {response.json()['file_info']['stored_name']}")

# 3. 流式对话 (SSE)
import sseclient

response = requests.post(
    f"{BASE_URL}/v1/chat",
    headers={"Accept": "text/event-stream"},
    json={
        "session_id": session_id,
        "message": "分析代码并优化",
        "stream": True
    },
    stream=True
)

client = sseclient.SSEClient(response)
for event in client.events():
    data = json.loads(event.data)
    if data["type"] == "content_delta":
        print(data["delta"], end="", flush=True)
    elif data["type"] == "done":
        print("\n[完成]")
```

### JavaScript/Chrome Extension

```javascript
// 发送消息并处理流式响应
async function chat(message) {
  const response = await fetch('http://localhost:8000/v1/chat', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({
      session_id: currentSessionId,
      message: message,
      stream: true
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'content_delta') {
          appendToChat(data.delta);
        }
      }
    }
  }
}
```

### cURL 测试

```bash
# 健康检查
curl http://localhost:8000/

# 创建会话
curl -X POST http://localhost:8000/v1/chat   -H "Content-Type: application/json"   -d '{"message": "Hello", "stream": false}'

# 流式对话
curl -X POST http://localhost:8000/v1/chat   -H "Content-Type: application/json"   -H "Accept: text/event-stream"   -d '{"session_id": "xxx", "message": "Hi", "stream": true}'

# 上传文件
curl -X POST "http://localhost:8000/v1/upload?session_id=xxx"   -F "file=@main.py"   -F "description=主程序"

# 代码编辑
curl -X POST http://localhost:8000/v1/edit-code   -H "Content-Type: application/json"   -d '{
    "session_id": "xxx",
    "file_path": "uploads/xxx/main.py",
    "instruction": "添加错误处理"
  }'
```

---

## WebSocket 支持 (未来扩展)

虽然当前版本使用 SSE (Server-Sent Events)，但架构预留了 WebSocket 支持：

```javascript
// 未来可能的 WebSocket 接口
const ws = new WebSocket('ws://localhost:8000/v1/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'chat',
    session_id: 'xxx',
    message: 'Hello'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.delta);
};
```

---

## 相关文档

- [架构详解](ARCHITECTURE.md) - 系统架构和数据流
- [快速开始](README.md#快速开始) - 部署和使用指南
- [MCP 协议规范](https://modelcontextprotocol.io/) - 底层协议标准
