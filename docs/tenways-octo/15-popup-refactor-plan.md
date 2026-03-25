# Popup 重构与功能验收计划

## 背景

基于 `docs/tenways-octo` 文档，当前 popup 实现存在以下差距：

### 文档要求 vs 当前实现

| 功能 | 文档要求 | 当前状态 | 优先级 |
|------|----------|----------|--------|
| 身份解析 | `itdog.identity.resolve` | ❌ 未实现 | P1 |
| Meegle 认证 | `itdog.meegle.auth.ensure` | ⚠️ 部分实现 | P1 |
| Lark 认证 | `itdog.lark.auth.ensure` | ⚠️ 部分实现 | P1 |
| A1 分析 | `itdog.a1.analyze` | ⚠️ Mock 实现 | P1 |
| A1 B2 草稿 | `itdog.a1.create_b2_draft` | ⚠️ Mock 实现 | P1 |
| A1 B2 确认 | `itdog.a1.apply_b2` | ⚠️ Mock 实现 | P1 |
| A2 流程 | A2 分析/B1 创建 | ❌ 未实现 | P2 |
| PM 分析 | `itdog.pm.analysis.run` | ❌ 未实现 | P2 |
| 身份映射 | Lark ID ↔ Meegle UserKey | ❌ 未实现 | P1 |

## 架构重构

### 当前问题

```
popup.js (406行)
├── 所有逻辑耦合在一起
├── 硬编码配置 (SERVER_URL, MEEGLE_BASE_URL)
├── 无类型定义 (纯 JS)
├── 无错误边界处理
└── 无测试覆盖
```

### 目标架构

```
popup/
├── index.html           # HTML 结构
├── main.ts              # 入口，初始化
├── config.ts            # 配置管理
├── state.ts             # 状态管理
├── api/
│   ├── background.ts    # Background 消息封装
│   └── server.ts        # 服务端 API 封装
├── ui/
│   ├── components.ts    # UI 组件
│   └── render.ts        # 渲染逻辑
├── pages/
│   ├── meegle.ts        # Meegle 页面逻辑
│   ├── lark-a1.ts       # Lark A1 页面逻辑
│   ├── lark-a2.ts       # Lark A2 页面逻辑
│   └── unsupported.ts   # 不支持页面
└── utils/
    ├── log.ts           # 日志
    └── detect.ts        # 页面检测
```

## 功能验收清单

### P1 - 核心认证流程

#### 1. Meegle 认证 (Meegle 页面)
- [ ] 检测 Meegle 登录状态
- [ ] 显示认证状态 (已认证/需登录/失败)
- [ ] 点击"获取认证"→ 调用 `itdog.page.meegle.auth_code.request`
- [ ] 获取 authCode → 调用 `/api/meegle/auth/exchange`
- [ ] 显示 token 交换结果
- [ ] 处理错误: `MEEGLE_NOT_LOGGED_IN`, `AUTH_CODE_REQUEST_FAILED`

#### 2. Lark A1 页面
- [ ] 显示页面类型: Lark 支持工单 (A1)
- [ ] 显示 Meegle 认证状态
- [ ] 显示 Lark 认证状态
- [ ] "分析当前页面" → `/api/a1/analyze`
- [ ] "生成草稿" → `/api/a1/create-b2-draft`
- [ ] "确认创建" → `/api/a1/apply-b2`
- [ ] 按钮状态管理: 分析 → 草稿 → 确认

#### 3. 身份解析
- [ ] 实现 `itdog.identity.resolve`
- [ ] 检测 Lark ID
- [ ] 查询身份映射状态
- [ ] 显示绑定状态

### P2 - 扩展功能

#### 4. Lark A2 页面
- [ ] 显示页面类型: Lark 需求页面 (A2)
- [ ] A2 分析 → `/api/a2/analyze`
- [ ] A2 创建 B1 草稿 → `/api/a2/create-b1-draft`
- [ ] A2 确认 B1 → `/api/a2/apply-b1`

#### 5. PM 分析
- [ ] 选择项目范围
- [ ] 选择时间范围
- [ ] 执行分析 → `/api/pm/analysis/run`
- [ ] 显示分析结果

## 测试计划

### 单元测试

```
tests/
├── popup/
│   ├── detect.test.ts      # 页面检测
│   ├── state.test.ts       # 状态管理
│   └── api.test.ts         # API 封装
└── e2e/
    ├── meegle-auth.test.ts # Meegle 认证流程
    ├── lark-a1.test.ts     # Lark A1 完整流程
    └── identity.test.ts    # 身份解析
```

### E2E 测试场景

1. **Meegle 认证流程**
   - 打开 Meegle 页面 → 检测到认证状态
   - 点击"获取认证" → 成功获取 authCode
   - Token 交换成功 → 显示"已认证"

2. **Lark A1 → B2 流程**
   - 打开 Lark A1 页面 → 显示工单类型
   - 检测认证状态 → Meegle/Lark 都已认证
   - 点击"分析" → 返回分析结果
   - 点击"生成草稿" → 显示草稿预览
   - 点击"确认创建" → 成功创建 B2

3. **错误处理**
   - Meegle 未登录 → 显示"需登录"，引导用户
   - 认证失败 → 显示错误信息，提供重试
   - 网络错误 → 显示连接失败，提供重试

## 实现步骤

### 阶段 1: 重构基础结构 (Day 1)
1. 创建模块化目录结构
2. 提取配置、状态管理
3. 封装 API 层
4. 保持功能不变，仅重构代码

### 阶段 2: 完善认证流程 (Day 2)
1. 完善 Meegle 认证状态显示
2. 实现 authCode 获取与交换
3. 添加错误处理与用户引导
4. 添加单元测试

### 阶段 3: 完善 A1 流程 (Day 3)
1. 对接真实 `/api/a1/*` 接口
2. 添加草稿预览 UI
3. 添加确认对话框
4. 添加 E2E 测试

### 阶段 4: A2 与 PM 分析 (Day 4)
1. 实现 A2 页面 UI 和逻辑
2. 实现 PM 分析入口
3. 完善测试覆盖

## 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                          Popup UI                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Meegle  │  │  Lark    │  │  A1/A2   │  │   PM     │       │
│  │  Auth    │  │  Auth    │  │  Actions │  │  Analysis│       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │             │             │              │
│       └─────────────┴─────────────┴─────────────┘              │
│                           │                                     │
│                     ┌─────┴─────┐                               │
│                     │   State   │                               │
│                     └─────┬─────┘                               │
└───────────────────────────┼─────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
        ┌─────┴─────┐               ┌─────┴─────┐
        │ Background │               │  Server   │
        │  Message   │               │   API     │
        └─────┬─────┘               └─────┬─────┘
              │                           │
    ┌─────────┴─────────┐         ┌───────┴───────┐
    │                   │         │               │
┌───┴───┐         ┌─────┴────┐  ┌─┴───┐    ┌─────┴─────┐
│Content│         │  Storage │  │/api │    │  Meegle   │
│Script │         │          │  │     │    │  BFF      │
└───────┘         └──────────┘  └─────┘    └───────────┘
```

## NOT in Scope

- 服务端 API 实现 (separate project)
- Content Script 重构 (working)
- 浏览器扩展发布流程
- 多租户支持
- 国际化 (i18n)