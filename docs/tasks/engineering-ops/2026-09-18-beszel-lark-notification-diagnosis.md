---
title: "Beszel Lark 通知失败诊断"
module: engineering-ops
status: done
requirement_version: 1
created_on: 2026-09-18
updated_on: 2026-09-18
closed_on: 2026-09-18
owner: Codex
related: []
---

# Beszel Lark 通知失败诊断

## 目标

根据通知失败错误，定位 URL 与容器 DNS 问题并给出修复方法。本次为只读诊断，不修改防火墙、通知设置或发送群消息。

## 验收标准

- [x] 检查通知 URL 格式，输出不含凭据的正确模板。
- [x] 区分宿主机解析、Podman DNS 服务与容器到 DNS 的连通性。
- [x] 说明修复范围及未验证边界。

## 背景与范围

Beszel 0.19.0 容器 local-beszel 在 1panel-network，当前地址 10.89.0.9，DNS 为 10.89.0.1。错误中的完整 webhook 路径被 Shoutrrr 再次拼接，且请求在 DNS 阶段超时。用户粘贴的凭据不在此记录。

## 方案与决策

通知 URL 使用 `lark://open.larksuite.com/<webhook-token>?secret=<signing-secret>`。内部 DNS 放行应仅限 Beszel 容器经 podman1 到 10.89.0.1 的 TCP/UDP 53，置于现有 DROP 之前；持久规则由现有防火墙管理方式维护。容器 IP 改变时需要同步规则。消息链接 localhost 属于另一项 APP_URL 配置问题。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-18 | v1 | done | 宿主机查询 Podman DNS 成功；容器查询相同 DNS 的外部域名、内部 beszel 名称均超时，TCP 同样超时；容器直连公共 DNS 成功 | 未改规则、未验证修复后的通知投递 |
| 2026-09-18 | v1 | done | aardvark-dns 监听 10.89.0.1:53；INPUT 跳转到 1PANEL_BASIC_AFTER，后者仅放行 UDP 443，随后 DROP TCP/UDP，之前的 1PANEL_BASIC 无 DNS 放行 | 支持容器到宿主机 DNS 被防火墙拦截的判断；未抓取通信内容 |

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 运行时只读诊断 | 完成 | podman inspect、nsenter dig、ss、iptables -S | 不等于修复完成 |
| 通知端到端验证 | 未执行 | 无群消息发送 | 用户更换凭据、纠正配置及 DNS 后再测试 |
| 应用测试 | 不适用 | 无应用改动 | - |

## 关联

- [官方 Lark 通知格式](https://beszel.dev/guide/notifications/lark)
