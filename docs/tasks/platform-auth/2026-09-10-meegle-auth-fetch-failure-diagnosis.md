---
title: "排查 Meegle 授权状态请求失败"
module: "platform-auth"
status: completed
requirement_version: 2
created_on: 2026-09-10
updated_on: 2026-09-10
closed_on: 2026-09-10
owner: Codex
related: []
---

# 排查 Meegle 授权状态请求失败

## 目标

检查今天刚刚的日志，定位 Meegle 授权失败阶段。v2 按用户要求将系统 DNS 配置为 223.5.5.5 和 8.8.8.8，并验证解析与无代理连接。

## 验收标准

- [x] 确认最近失败请求、状态码和服务端错误。
- [x] 对照代码定位失败调用，说明证据边界。
- [x] 持久配置系统 DNS，确认系统解析与相同 Node 无代理连接恢复。

## 背景与范围

只提取日志中的时间、路由、阶段、状态和异常类型，不输出凭据、用户资料或响应体。

## 方案与决策

以今日 app/api 日志和 Meegle auth adapter 交叉定位。失败发生于授权状态检查触发凭据刷新、获取插件 token 的 fetch 调用。进一步在实际主机使用 Server 相同 Node 程序复现直连失败：`getaddrinfo EAI_AGAIN project.larksuite.com`。实际 Server 启动环境缺少代理变量；同一 Node 临时启用环境代理并指向 Clash 后可收到 HTTP 响应。最终主机诊断确认 systemd-resolved 没有上游 DNS，直接查询两个公共 DNS 均能解析该域名。修复方向为补充系统 DNS，不需要以启用应用代理作为必要条件；没有证据证明用户凭据被 Meegle 拒绝。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-09-10 | v1 | completed | 日志时间 16:31:01、16:31:16、16:31:20、16:33:15，POST /api/meegle/auth/status 均返回 500，耗时分别为 5、6、2、2 ms。每次 REFRESH / refresh_plugin_token 与 PLUGIN_TOKEN START 后立即出现 fetch failed。该窗口未见 auth/exchange。 | 未修改代码、配置或服务状态；底层网络原因和授权恢复尚未验证。 |
| 2026-09-10 | v1 | completed | 用户追问是否未加载环境变量：同一失败进程 PID 425259 在 15:59:30 记录 Meegle auth configured；代码仅在插件 ID 与 secret 均非空时输出该日志。源码和 dist 均导入 dotenv/config，PM2 配置 cwd 为 server；dotenv 解析当前 server/.env 确认两项凭据非空、目标主机为 project.larksuite.com，文件无代理变量。最新失败延续至 16:33:51。 | 可排除该进程完全缺少 Meegle ID/secret，但未证明值正确或与当前文件一致；当前工具进程视图中无该 PID，无法核对其继承环境及代理配置。 |
| 2026-09-10 | v1 | completed | 获批在实际主机只读检查 PID 425259，确认 cwd 为 server、Node 为 /home/deploy/.hermes/node/bin/node，启动环境无大小写 HTTP_PROXY/HTTPS_PROXY/ALL_PROXY、NODE_USE_ENV_PROXY、NODE_OPTIONS。相同 Node v26.8.1 直连无凭据 HEAD 请求报 EAI_AGAIN；curl 经 Clash 及相同 Node 加临时 HTTP(S)_PROXY 与 --use-env-proxy 均收到 HTTP 404。 | HEAD 仅证明网络可达，不证明 POST 换 token 或授权成功；未改配置、重启服务或触发真实授权。最初沙箱探测不单独作为主机诊断证据。 |
| 2026-09-10 | v2 | completed | 用户明确要求执行后，创建 /etc/systemd/resolved.conf.d/60-dns.conf（此前不存在），配置 [Resolve] 下 DNS=223.5.5.5 8.8.8.8，权限 0644；重启 systemd-resolved。resolvectl 显示全局 DNS，query 与 getent 均成功；相同 Node 清除代理环境后 HEAD 返回 HTTP 404，不再报 fetch failed。 | 未重启 Server、未改其代理配置；真实授权待用户重试，未单独验证 8.8.8.8；未重启主机验证持久化。 |

## 验证

修复前主机检查：Ubuntu 24.04.2，`/etc/resolv.conf` 链接至 `/run/systemd/resolve/stub-resolv.conf`、nameserver 为 `127.0.0.53`。systemd-resolved 与 NetworkManager active；上联网卡为 eno1，连接 netplan-eno1。`resolvectl dns` 和 NetworkManager IP4/IP6 DNS 均为空；`resolvectl query project.larksuite.com` 报 `No appropriate name servers or networks for name found`。`dig @223.5.5.5` 与 `dig @1.1.1.1` 均返回该域名 A 记录。缺失 DNS 的历史成因未确认。

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 日志检查 | 失败阶段确认 | server/logs/api.2026-09-10.1.log:335、374、414、470；app.2026-09-10.1.log:2396、2409、2422、2443 | 无底层网络异常 cause |
| 代码核对 | 插件 token 请求目标确认 | server/src/adapters/meegle/auth-adapter.ts getPluginToken；日志 baseUrl 主机为 project.larksuite.com | 未发起带凭据请求，未执行授权闭环 |
| 主机网络对照 | 直连 DNS 失败，代理可达 | 相同 Node 二进制对同一 Meegle 路径无凭据 HEAD：直连 EAI_AGAIN，临时环境代理 HTTP 404 | 未执行真实 token 请求，未定位系统 DNS 配置故障来源；原始日志未保留 cause，以当前复现解释故障 |
| DNS 修复验证 | 通过 | 配置后全局 DNS 为用户指定的两个地址；resolvectl/getent 解析成功，Node 无代理 HEAD 返回 HTTP 404 | 404 只证明 DNS/TLS/HTTP 可达，不代表 token 交换成功 |

## 复盘

最初工具沙箱看不到主机 PID，且网络请求也报 DNS 错误；改为获批主机检查，并使用实际 Server 的 Node 程序对照验证。网络异常必须定位到真实运行环境与底层 cause，不能仅凭代理能访问就建议应用必须使用代理。通用规则及失败签名记入学习账本。

## 关联

- [Meegle auth adapter](../../../server/src/adapters/meegle/auth-adapter.ts)
