# Popup Notebook 重构设计

## 背景

当前扩展 popup 已经迁到 Vue/WXT，但页面组织仍然带着旧 `popup.html` 的影子：

- 首页内容和设置入口耦合在一个壳里
- 设置仍然通过 modal 打开，不是真正的 page
- 后续如果继续加 `状态`、`日志`、`调试` 页面，结构会越来越别扭

这次重构只处理展示层结构，把现有 popup 收成一个可见的双页 `Notebook`，并统一到 `Vue + ant-design-vue` 组件体系里。

## 目标

- 把 popup 重构为 `主页 | 设置` 两页 notebook
- 把旧 `popup.html` 里的首页和设置页都迁入 Vue
- 设置页不再使用 modal，而是成为独立 page
- 保留现有授权、日志、配置保存逻辑，不改 server / background 协议
- 顺手做一轮轻量视觉优化，让 UI 更稳定、清爽、可扩展

## 非目标

- 不改 Meegle / Lark 授权链路
- 不改 popup 初始化流程和 runtime API
- 不增加新的业务字段
- 不在本轮引入第三个 page，例如 `日志` 或 `调试`

## 方案选择

本次采用可见的双页 `Notebook` 方案，而不是继续保留 modal 设置页。

原因：

- 这次用户明确要 `notebook + page`
- `设置` 作为独立 page，更符合后续扩展方向
- 右上角 `设置` 从“弹框动作”变成“导航动作”，信息结构更清楚
- 相比一次性拆成 `主页 / 设置 / 日志` 三页，双页方案改动更聚焦，风险更低

## 页面结构

### 主页

`主页` 承载当前 popup 的主任务区：

- 顶部品牌头部
- 授权状态卡片
- 日志卡片

其中授权状态继续复用现有 `Meegle / Lark` 状态与按钮行为。日志继续复用现有 entries 和清除动作。

### 设置

`设置` page 取代现在的 `SettingsModal`，承载以下字段：

- `Server URL`
- `MEEGLE Plugin ID`
- `Meegle User Key`
- `Lark User ID`

设置页底部保留 `取消 / 保存` 两个动作：

- `取消`：丢弃未保存输入并返回 `主页`
- `保存`：调用现有 `saveSettingsForm`，保存成功后返回 `主页`

## 组件边界

### `PopupNotebook`

负责顶层页签导航和当前 page 切换。

职责：

- 渲染 `主页 | 设置` 两个 tab
- 管理当前激活 page
- 对外暴露切页动作

不负责：

- 授权逻辑
- 设置保存逻辑
- 页面内部布局

### `PopupPage`

通用 page 容器，用于统一各 page 的版式。

职责：

- 标题、副标题、辅助操作区
- 页面主体和底部 actions 的布局节奏
- 统一留白、圆角、卡片间距

### `HomePage`

承接旧首页内容。

职责：

- 组合 `AuthStatusCard`
- 组合 `LogPanel`
- 保持现有按钮事件和显示状态

### `SettingsPage`

取代 `SettingsModal`。

职责：

- 使用 ant-design-vue 表单组件展示配置
- 绑定现有 `settingsForm`
- 触发 `取消 / 保存`

## 交互设计

- 默认打开 `主页`
- 点击 header 右上角 `设置`，切到 `设置` page
- 点击 notebook tab，也可以切换 `主页 | 设置`
- `设置` 页保存后自动回到 `主页`
- `设置` 页取消时恢复进入该页前的表单值，再回到 `主页`

## UI 组件选型

本次统一使用 `Vue + ant-design-vue` 完成 popup 重构。

建议使用：

- `a-segmented` 或轻量 tab 样式做 notebook 切换
- `a-card` 承载授权状态和日志区块
- `a-form`、`a-form-item`、`a-input` 构成设置页
- `a-button` 统一按钮行为和视觉
- 保留项目已有的 `a-config-provider` 主题入口

视觉方向：

- 延续现有蓝色 header 识别度
- notebook 使用轻量胶囊切换，不做厚重 tab
- 卡片圆角、边框和输入框风格统一
- 设置页更像独立工作面板，而不是弹窗表单

## 数据流

本轮不改现有数据来源，只调整 UI 承载方式。

- `usePopupApp()` 继续作为 popup 的状态与动作入口
- `settingsForm` 仍由 composable 管理
- `logs`、`meegleStatus`、`larkStatus`、授权动作全部原样透传到新页面组件
- `loadPopupSettings()` / `savePopupSettings()` 的协议保持不变

## 错误处理

本轮不新增新的业务错误类型。

UI 层需要保证：

- 设置页保存失败时，保留当前输入，不清空表单
- 页面切换不影响当前授权状态和日志状态
- `主页` 与 `设置` 间来回切换，不重复触发初始化

## 实施要点

建议按以下顺序落地：

1. 抽出 `PopupNotebook` 和 `PopupPage`
2. 把 `SettingsModal` 改写为 `SettingsPage`
3. 把首页内容收进 `HomePage`
4. 调整 `App.vue` 为 `shell + notebook + pages`
5. 删除或退役 modal 相关渲染路径
6. 补齐交互测试

## 测试策略

至少覆盖：

- 默认渲染进入 `主页`
- 点击 `设置` 按钮会切到 `设置`
- `设置` 页展示当前配置值
- `取消` 会恢复未保存修改并回到 `主页`
- `保存` 会调用现有保存逻辑并回到 `主页`
- `主页` 中授权按钮和日志清除事件仍然可用

## 验收标准

- popup 中可以明确看到 `主页 | 设置` 两页切换
- 设置页不再依赖 modal
- 主页授权状态、按钮文案、日志展示与现有行为一致
- 设置保存后配置实际落盘
- 页面样式整体比当前更统一，但不改变核心交互语义
