# octo-cli 私有发布操作

此文档仅供维护者使用，不随 `@tenways/octo-cli` npm 制品发布。不要将实际发布主机、下载 URL、远端目录或任何 token 写入 `octo-cli/README.md`、`octo-cli/USAGE.md`、Skills 或示例配置。

## 发布前提

- 将 `octo-cli/package.json` 升级为新的稳定语义版本；不得覆盖已发布版本。
- 受保护 tag 必须命名为 `octo-cli-vX.Y.Z`，与 `package.json` 完全一致，并且提交已包含在 `main`。
- 私有静态目录必须提供 HTTPS，并提供 `latest.json` 和同版本 `.tgz` 的读取权限。
- 发布机器具备 SSH/SCP 写权限；发布后回读使用的 bearer token 仅以环境变量传入。

## 手动执行

在仓库根目录为本次发布临时注入以下值，再执行：

```bash
OCTO_CLI_RELEASE_BASE_URL=<private-https-release-directory> \
OCTO_CLI_RELEASE_HOST=<ssh-host> \
OCTO_CLI_RELEASE_PORT=<ssh-port> \
OCTO_CLI_RELEASE_DIR=<absolute-remote-directory> \
OCTO_CLI_RELEASE_VERIFY_TOKEN=<release-read-token> \
pnpm --dir octo-cli run release:deploy
```

脚本会依次测试、打包、生成带 SHA-256 与大小的 `latest.json`、上传，并通过 HTTPS 回读清单。任一阶段失败都不得宣称完成发布。

## CI 执行

推送受保护的 `octo-cli-vX.Y.Z` tag 会触发 `.github/workflows/octo-cli-release.yml`。流水线分为 preflight、候选制品构建和受保护环境部署：部署 job 只接收已验证的候选制品，不会重新构建。

在 GitHub Environment `octo-cli-private-release` 配置以下变量和 secret：

- Variables：`OCTO_CLI_RELEASE_BASE_URL`、`OCTO_CLI_RELEASE_HOST`、`OCTO_CLI_RELEASE_PORT`、`OCTO_CLI_RELEASE_DIR`
- Secret：`OCTO_CLI_RELEASE_VERIFY_TOKEN`

这些实际值不得写入代码、用户文档、Skills 或 CLI 配置。

## 客户端回归

以独立于部署凭据的低权限读取 token 验证：

```bash
OCTO_CLI_UPDATE_URL=<private-https-release-directory>/latest.json \
OCTO_CLI_UPDATE_TOKEN=<release-read-token> \
octo-cli upgrade --check
```

只有当清单版本高于客户端当前版本时，才在测试环境执行 `octo-cli upgrade --apply --yes`；确认版本、命令入口和 Skills 均可用后再通知使用者。
