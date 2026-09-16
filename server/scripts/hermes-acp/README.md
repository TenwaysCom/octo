# Hermes ACP 测试辅助

生产 adapter 直接执行官方 `python -m acp_adapter`，运行配置见 [Server README](../../README.md#hermes-acp)。本目录不是生产入口。

`protocol_fixture.py` 调用官方 `acp_adapter.entry.main`。它仅用于测试：隔离 HOME/HERMES_HOME 与数据库，阻止 Python socket 连接外部地址，并关闭无关的自动标题线程。测试环境关闭可选 Tirith 自动下载，模型只连接 loopback HTTP 桩；Hermes 工具、会话和风险审批代码保持原样。

```bash
HERMES_ACP_TEST_PYTHON=~/.hermes/hermes-agent/venv/bin/python pnpm --dir server test src/adapters/hermes-acp
```

协议测试验证原生初始化、工具实际执行、单次允许/拒绝、历史重放、续聊、取消和不存在的会话加载失败。未设置测试 Python 时跳过这一可选测试，普通单元测试无需安装 Hermes。此测试不证明真实模型质量、文件全面隔离或 Lark/Meegle 正式写回。

`launcher.py`、`runtime_patch.py`、`patches/`、`upstream/` 和 `test_client_tools.py` 是已停止引用的 v2/v3 历史实现。按 [任务验收顺序](../../../docs/tasks/acp/2026-09-05-hermes-acp-integration.md#实施顺序与当前验收)，待文件边界和原生业务验收完成后删除；旧测试结果不作为 v5 证据，也不要将旧 launcher 用于新部署。
