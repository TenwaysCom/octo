# Platform Data Tasks

范围：Meegle Workitem、Lark Ticket、GitHub PR 的列表、详情、本地扩展数据、关联展示与 Platform Data Web API。平台拉取、清洗、checkpoint、stale、回写与对账归 `platform-sync`；平台授权归 `platform-auth`；AI 分析与自动化归对应 AI 模块。记录规则见 [Tasks 台账](../README.md)。

- [2026-09-24：Meegle 页面 Odoo.sh 构建状态重复请求与 503 排查](2026-09-24-odoo-build-request-volume.md) — blocked；优化已实现并通过相关测试，server 完整构建受现有 undici 依赖缺失阻塞，未部署。
