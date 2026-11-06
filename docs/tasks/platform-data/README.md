# Platform Data Tasks

范围：Meegle Workitem、Lark Ticket、GitHub PR 的列表、详情、本地扩展数据、关联展示与 Platform Data Web API。平台拉取、清洗、checkpoint、stale、回写与对账归 `platform-sync`；平台授权归 `platform-auth`；AI 分析与自动化归对应 AI 模块。记录规则见 [Tasks 台账](../README.md)。

- [Ticket 源记录错误识别与 Octo 删除标记](2026-11-06-lark-ticket-source-errors-and-deletion.md) — done；错误分类、两处确认入口及本地软删除完成；Server/FE 与浏览器模拟验收通过，未部署。

- [Ticket 列表与详情联系人头像](2026-11-06-lark-ticket-contact-avatars.md) — done；v2 人员选择列表也按 open ID 使用缓存头像，保留搜索/选中及缺图首字；Server/FE 与菜单浏览器 mock 通过，未部署。
- [Ticket 窄页打开 Lark Base](2026-11-06-lark-ticket-app-open-base.md) — done；Meegle 操作后新增当前 Base 记录入口，支持缺失链接读取和重试，FE 与窄屏模拟验证通过，未部署。
- [Lark App 创建 Meegle 工作项](2026-10-21-lark-app-create-meegle.md) — done；创建、防重、关联链接及部分成功提示完成，FE 与模拟浏览器验证通过，尚未部署。
- [2026-09-24：Meegle 页面 Odoo.sh 构建状态重复请求与 503 排查](2026-09-24-odoo-build-request-volume.md) — blocked；优化已实现并通过相关测试，server 完整构建受现有 undici 依赖缺失阻塞，未部署。
- [Meegle 页面性能与 Odoo.sh 构建状态批量读取](2026-08-29-meegle-page-performance.md)
