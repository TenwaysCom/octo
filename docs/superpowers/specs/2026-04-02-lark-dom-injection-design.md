# Lark DOM Injection Design

## Summary

这份设计只覆盖两件事：

1. 一个可复用的网页注入公共模块
2. 基于这套模块实现的 Lark 详情页注入入口

当前目标不是一次性做出通用网页自动化框架，也不是直接覆盖 Lark 多维表格的所有交互形态。首轮只解决一个明确问题：

- 当用户在 Lark 多维表格里打开一条记录详情时，插件能够稳定识别当前记录
- 在详情标题区域注入 `发送到 Meegle` 按钮
- 在标题下方展开一个折叠面板，完成草稿生成和确认创建

## Background

当前的 Lark content script 还停留在比较轻的页面识别和 OAuth 辅助逻辑上，没有一套适合“动态网页注入”的稳定运行时。

而多维表格这类页面存在几个典型问题：

- DOM 高动态，列表和详情经常重绘
- 详情抽屉/侧栏不一定常驻，可能关闭后销毁
- 单靠一个 selector 很容易误判
- 一旦直接在 content script 里写死 probe + observer + mount，很快就会和别的网站注入逻辑纠缠在一起

因此需要先抽一层很薄的公共注入模块，用来统一处理：

- 页面壳探测
- 详情态探测
- 观察器生命周期
- 调试 overlay
- 挂载 / 重挂载 / 清理

然后再让 Lark 作为第一个 adapter 接上去。

## Goals

- 把注入运行时从业务逻辑里抽出来，避免后续复制 probe / observer / mount 代码
- 让 Lark 详情页注入有一条稳定、可调试、可回归的主线
- 保持“插件是薄客户端，服务端负责业务编排”的原则不变
- 允许后续为其他网页场景复用同一套注入运行时

## Non-Goals

- 首轮不做列表行注入
- 首轮不做 page tab 或伪原生导航
- 不在本设计里处理 Lark Base 官方插件替补方案
- 不在本设计里处理多目标项目、多模板、多工作项类型配置
- 不在本设计里处理通用 skill 或自动化勘测工作流

## High-Level Architecture

整个注入体系分成两层：

- `core`
  - 不懂 Lark，也不懂 Meegle
  - 只负责 observer、probe 调度、状态机、挂载、overlay
- `adapter`
  - 只负责某个具体网站的 DOM 特征识别和 UI 渲染

结构建议：

```text
extension/src/injection/
  core/
    observer.ts
    probe-controller.ts
    mount.ts
    overlay.ts
  platforms/
    lark/
      adapter.ts
      probe.ts
      render.ts
  types.ts
```

### Core 层职责

- 建立 shell observer
- 在合适时机建立 / 销毁 detail observer
- 节流执行 probe
- 维护页面状态
- 调用 adapter 的 probe/render
- 管理 debug overlay
- 保证注入节点幂等

### Adapter 层职责

- 定义“当前网站的详情页长什么样”
- 从详情页抽上下文字段
- 找出注入锚点
- 根据状态渲染入口按钮和折叠面板

## Core Design

### Shared Types

```ts
type InjectionPageState =
  | { kind: "idle" }
  | { kind: "detail-loading" }
  | { kind: "detail-ready"; context: unknown; anchor: AnchorCandidate }
  | { kind: "unsupported"; reason: string };

type AnchorCandidate = {
  element: Element;
  label: string;
  confidence: number;
};

type ProbeShellResult = {
  shellRoot: Element | null;
  overlayRoot: Element | null;
};

type ProbeDetailResult = {
  isOpen: boolean;
  detailRoot: Element | null;
  reason?: string;
};
```

### Adapter Contract

```ts
type InjectionAdapter<TContext> = {
  probeShell(): ProbeShellResult;
  probeDetail(): ProbeDetailResult;
  probeContext(detailRoot: Element): TContext | null;
  probeAnchor(detailRoot: Element): AnchorCandidate | null;
  render(state: {
    pageState: InjectionPageState;
    context: TContext | null;
    anchor: AnchorCandidate | null;
  }): void;
  cleanup?(): void;
};
```

这层 contract 的关键点是：

- `core` 只依赖这些通用函数
- `adapter` 不直接管理 observer
- `render()` 只接收已经解析好的状态，不需要自己再做一遍探测

### Observer Strategy

公共模块固定采用两层 observer：

1. `shell observer`
   - 监听稳定父容器或页面主区域
   - 负责感知详情打开 / 关闭 / 结构重建
   - 只做低频状态刷新

2. `detail observer`
   - 只挂在当前详情 root 上
   - 负责感知标题区、字段区、注入锚点的局部变化
   - 当详情 root 变化时自动切换

触发链路固定为：

```text
MutationObserver
-> scheduleProbeRefresh()
-> adapter.probeDetail()
-> adapter.probeContext()
-> adapter.probeAnchor()
-> adapter.render()
```

### Probe Controller

`probe-controller.ts` 负责：

- 控制 probe 刷新节奏
- 把多次 DOM 变化合并成一次重算
- 管理从 `detail-loading` 到 `detail-ready` 的状态跃迁

建议节流策略：

- DOM 高频变化时，100ms 到 150ms 合并一次
- 不做每次 mutation 都立刻 render

### Mount Policy

`mount.ts` 负责：

- 避免重复插入多个注入节点
- 注入点重建后自动 remount
- 详情关闭时自动 cleanup

规则：

- 同一个详情 root 下，只允许存在一套注入 UI
- 记录切换时必须重置上一个记录的局部状态
- anchor 丢失时不能留残影 DOM

### Debug Overlay

`overlay.ts` 负责开发期可视化调试：

- 当前 page state
- 当前 title
- 当前 anchor label
- 当前 detail root 是否存在

这层是开发辅助，不是正式用户功能。

建议让 overlay 支持：

- 开关控制
- 手动 refresh
- 显示当前 probe 结果摘要

## Lark Adapter Design

### Scope

Lark adapter 首轮只处理：

- 多维表格中的单条记录详情态
- 标题右侧按钮注入
- 标题下折叠面板注入

不处理：

- 列表行内按钮
- 页面级 tab
- 批量操作

### Detail Detection

Lark 详情页判定不依赖单一 selector，而是使用组合信号：

- 出现可见侧栏 / 抽屉 / 详情面板
- 面板内存在标题区域
- 面板内存在字段区
- 结构更像记录详情，而不是筛选 / 视图设置 / 配置面板

只有满足足够多条件时，才进入 `detail-ready`。

### Context Extraction

Lark 首轮只提取最小上下文：

- `title`
- `recordKey` 或请求编号
- `status`
- `priority`
- `requester`
- `pm`
- `developer`
- `description`

原则：

- 只提取当前“发送到 Meegle”必需或高价值的字段
- 拿不到的字段允许缺省，不阻断整个入口注入

### Anchor Selection

Lark adapter 只选择两个注入候选：

1. 标题右侧操作区
2. 标题下方第一块稳定内容区域

对应两个用途：

- 标题右侧：注入主按钮 `发送到 Meegle`
- 标题下方：注入折叠面板容器

如果标题右侧没有稳定容器，则允许退化为标题下方主入口。

## Lark UI Design

### Entry Button

详情标题区域注入一个主按钮：

- 文案：`发送到 Meegle`

这一步不做 page tab，不引入新的伪导航。

### Collapsible Panel

点击主按钮后，在标题下方展开折叠面板。

面板包含：

- 当前记录摘要
- 当前准备映射到 Meegle 的字段摘要
- `生成草稿`
- `确认创建`
- 成功后显示结果链接

### UI State Machine

折叠面板内部状态：

- `collapsed`
- `draft-loading`
- `draft-ready`
- `submitting`
- `success`
- `error`

状态切换规则：

- 点击按钮时从 `collapsed` 进入 `draft-loading`
- 草稿返回后进入 `draft-ready`
- 点击确认后进入 `submitting`
- 创建成功后进入 `success`
- 任意请求失败时进入 `error`

## Data Flow

### Draft

点击 `发送到 Meegle` 后，前端向服务端发送：

```json
{
  "masterUserId": "usr_xxx",
  "tenantKey": "tenant_xxx",
  "baseId": "bascn_xxx",
  "tableId": "tbl_xxx",
  "viewId": "vew_xxx",
  "recordId": "rec_xxx",
  "recordSnapshot": {
    "title": "...",
    "description": "...",
    "priority": "...",
    "requester": "...",
    "pm": "...",
    "status": "..."
  }
}
```

接口建议：

- `POST /api/lark/dom-transport/draft`

服务端返回：

- 标准化字段
- Meegle 草稿
- 缺失字段
- 是否可直接创建

### Apply

用户确认后再调用：

- `POST /api/lark/dom-transport/apply`

返回：

- Meegle 工作项编号
- 工作项链接
- 可选回写结果

## Error Handling

首轮明确处理以下失败类型：

- `detail-lost`
  - 当前详情被关闭或重建
- `context-incomplete`
  - 关键字段不完整
- `auth-required`
  - 当前用户未完成 Meegle 授权
- `draft-failed`
  - 草稿生成失败
- `apply-failed`
  - 创建失败

策略：

- 不静默吞错
- 不在详情切换后保留旧面板状态
- 允许用户在错误态下重试

## Testing Strategy

### Core Tests

- shell observer 能触发 probe 刷新
- detail root 变化时会切换 detail observer
- 重绘后能正确 remount
- 详情关闭时会 cleanup

### Lark Adapter Tests

- 能识别 detail-like DOM
- 能抽出最小字段集
- 能找到标题右侧 / 标题下方 anchor
- 切换记录时能刷新 context

### Panel Behavior Tests

- 点击主按钮会展开折叠面板
- `draft-loading -> draft-ready` 状态切换正确
- `submitting -> success` 状态切换正确
- error 状态能显示并重试

## Rollout Strategy

建议按这个顺序落地：

1. 先抽公共注入模块
2. 把当前临时 debug overlay 接到公共模块
3. 用 Lark adapter 接入详情探测和 anchor 探测
4. 再接 `发送到 Meegle` 主按钮
5. 最后接折叠面板和服务端 draft/apply 链路

## Open Questions

- Lark 详情页在不同视图下，标题区和字段区的 DOM 稳定性如何
- 标题右侧是否总能找到足够稳定的操作区容器
- `recordKey` 是否总能在详情态拿到，还是需要从字段映射中兼容兜底
- 折叠面板是用原生 DOM 注入，还是直接挂一个 Vue/轻组件容器更合适

## Final Recommendation

先做公共注入模块，再把 Lark 作为第一个 adapter 接上去，是当前最稳的落地方式。

这能解决两个问题：

- 当前 Lark 详情页注入不必继续把 probe / observer / mount 逻辑堆在 content script 里
- 后续如果要给别的网站做类似注入，不需要再从头复制一套探测和重挂载机制
