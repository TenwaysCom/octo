---
title: "GitHub push 使用 ben 密钥仍报 publickey 的排查"
module: engineering-ops
status: done
requirement_version: 1
created_on: 2026-11-04
updated_on: 2026-11-04
closed_on: 2026-11-04
owner: Codex
related:
  - "https://docs.github.com/en/authentication/troubleshooting-ssh/error-permission-denied-publickey"
---

# GitHub push 使用 ben 密钥仍报 publickey 的排查

## 目标

排查当前仓库已配置 `core.sshCommand` 指向 `/home/deploy/.ssh/ben`，但 `git push` 仍报 `Permission denied (publickey)` 的问题，定位实际失败阶段并核实恢复结果；无法确认的具体诱因保持未定。只使用用户指定的既有密钥，不创建或替换密钥、不修改其他仓库或 GitHub 授权。

## 验收标准

- [x] 确认仓库配置、远端、环境覆盖和 Git 实际使用的密钥。
- [x] 对实际失败阶段取得证据，区分已证实事实与根因推断。
- [x] 用户确认原配置推送成功后，真实回读远端提交与本地一致；不将恢复等同于稳定根因修复。

## 背景与范围

用户已设置本仓库 `core.sshCommand = ssh -F /dev/null -i /home/deploy/.ssh/ben -o IdentitiesOnly=yes`，仍在推送时报公钥失败。此前同一密钥曾真实推送 `631d15b` 成功；当前有文档提交 `d9bf9a7` 尚未推送。失败重试不改写提交或强制推送。

## 方案与决策

- 通过 `git push --dry-run origin main` 复现实际 SSH 认证路径，添加诊断日志及超时，提取安全握手摘要，不记录私钥、token 或完整调试日志。
- 已检查同一公钥的重复连接、公私钥一致性与默认推送目标。用户随后确认原配置推送成功，真实回读一致，因此结束恢复核验，不再修改算法或切换端口；不能将恢复归因于尚未执行的候选方案。
- 仅在配置方案经过实际验证后调整本仓库配置；不修改全局 SSH 配置或其他密钥。

## 进展记录

| 日期 | 需求版本 | 状态 | 结果与证据 | 未验证边界 / 下一步 |
| --- | --- | --- | --- | --- |
| 2026-11-04 | v1 | in_progress | 当前配置来自 `.git/config`，没有 GIT_SSH_COMMAND/GIT_SSH 覆盖，远端为预期仓库，私钥权限 0600。真实 dry-run exit 128；Git trace 确认调用 ben，公钥已发送，但服务端没有接受，也没有进入签名或 git-receive-pack | 尚不能认定密钥损坏、网络问题或仓库写权限错误；继续控制变量对比 |
| 2026-11-04 | v1 | done | 公私钥指纹一致，私钥无需 agent 即可派生公钥；第二次直接认证仍在同一公钥检查阶段被拒。随后用户反馈 `git push origin main` 成功，使用未覆盖的原配置真实 `ls-remote` 确认远端 main 等于本地 `d9bf9a7`；默认目标也为 origin/main | 当前症状恢复，未改配置或密钥；具体远端拒绝诱因未确定，不宣称稳定性修复或显式参数解决了认证问题 |

## 结论

已证实生效配置和 Git 实际执行均指向 ben；公钥文件与私钥派生的公钥指纹一致，且私钥可在不使用 agent 的情况下读取公钥。两次失败连接均到 github.com / 20.205.243.166:22，服务端主机指纹与 GitHub 官方公布的 Ed25519 指纹一致；客户端发送 ben 的 RSA 公钥后被拒绝，没有进入私钥签名或仓库命令阶段。不能将此错误解释成仓库写权限不足、未设置 ben 或私钥口令缺失。

原配置随后成功推送并可读回远端，说明认证结果有间歇性差异；现有日志不能确认具体触发条件。默认分支配置为 `branch.main.remote=origin`、`branch.main.merge=refs/heads/main`，没有 pushRemote、remote.pushDefault、pushurl、URL 重写或额外 refspec 配置，未发现默认目标差异。显式 `origin main` 的 dry-run 也曾失败，因此不能认定这两个参数修复了认证。

本次只完成失败阶段定位与恢复核验，不修改已有 SSH 配置、GitHub 授权或密钥，不将网络、GitHub 后端、RSA 算法兼容性等未验证可能性写成根因。若再次发生，可对实际失败命令提取同样的握手阶段摘要继续对比。

## 验证

| 类型 | 结果 | 证据 | 边界 |
| --- | --- | --- | --- |
| 配置与文件元数据 | 生效配置、远端及权限正确 | Git config/show-origin、环境变量存在性、文件 stat | 不输出环境值或私钥 |
| 真实 SSH / Git 复现 | 失败，exit 128 | `git push --dry-run origin main`：连接 github.com / 20.205.243.166:22，服务端版本 5ec5cb2f，发送 ben 的 RSA 公钥后被拒绝 | 未写远端；历史成功不证明本次连接可用 |
| 私钥 / 公钥一致性 | 通过，两个 SHA256 指纹一致，私钥可无 agent 派生公钥 | ssh-keygen 输出仅在内存比对，记录指纹一致性 | 不输出或更改私钥、公钥正文；不涉及用户口令 |
| 第二次直接认证 | 失败，exit 255，同一公钥再次未被接受 | 原配置参数 + `ssh -vvv -T` 的安全摘要 | 确认失败发生在 Git 命令前；未验证其他 RSA 算法或 443 |
| 默认推送目标 | origin/main | 分支上游和所有 scope 的推送配置读取 | 配置检查，未据此归因认证差异 |
| 真实恢复回读 | 通过，用户推送后 `git ls-remote origin refs/heads/main` exit 0；远端与本地均为 `d9bf9a7a0e2bf546072f9542c2675fdf1ed205fd` | 使用未覆盖的原仓库 SSH 配置，无额外写入 | 证明本次推送完成，不证明间歇拒绝已永久消失 |
| 应用测试 / 部署 | 未执行 | 仅 Git 认证排障，无应用改动 | 不重启服务或 Worker |

## 关联

- [GitHub 公钥认证失败官方说明](https://docs.github.com/en/authentication/troubleshooting-ssh/error-permission-denied-publickey)
- [GitHub 服务端主机指纹](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints)
