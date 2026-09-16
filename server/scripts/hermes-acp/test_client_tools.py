"""Local tests; Hermes + ACP dependencies required, no model or external API."""
import asyncio
import json
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

import os
import atexit
from unittest.mock import Mock

# Unit tests must not load a personal Hermes config, state or model credential.
_test_home = tempfile.TemporaryDirectory(prefix="octo-hermes-unit-")
atexit.register(_test_home.cleanup)
os.environ["HOME"] = _test_home.name
os.environ["HERMES_HOME"] = _test_home.name
os.environ["OPENAI_API_KEY"] = "local-fixture"
Path(_test_home.name, "config.yaml").write_text("model:\n  default: octo-fixture\n  provider: custom\n")
import socket
socket.socket.connect = lambda *args, **kwargs: (_ for _ in ()).throw(OSError("Unit tests forbid network access"))

from launcher import create_agent
from acp_adapter.client_tools import AcpClientToolBackend, tool_error
from acp_adapter.server import HermesACPAgent
from agent.tool_backend import invoke_backend
from run_agent import AIAgent
from acp.schema import ClientCapabilities


def fake_agent(**kwargs):
    return SimpleNamespace(model="fixture", provider="openai", _interrupt_requested=False)


class BridgeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.bridge = AcpClientToolBackend()
        self.bridge.capabilities = ClientCapabilities(
            terminal=True, fs={"readTextFile": True, "writeTextFile": True})
        self.client = SimpleNamespace(
            session_update=AsyncMock(),
            request_permission=AsyncMock(return_value=SimpleNamespace(outcome=SimpleNamespace(option_id="once"))),
            read_text_file=AsyncMock(return_value=SimpleNamespace(content="client content")),
            write_text_file=AsyncMock(),
            create_terminal=AsyncMock(return_value=SimpleNamespace(terminal_id="term-1")),
            wait_for_terminal_exit=AsyncMock(return_value=SimpleNamespace(exit_code=0, signal=None)),
            terminal_output=AsyncMock(return_value=SimpleNamespace(output="client output", truncated=False)),
            release_terminal=AsyncMock(),
        )
        self.bridge.on_connect(self.client)
        self.session = "hermes_11111111-1111-4111-8111-111111111111"

    async def invoke(self, name, args):
        return json.loads(await self.bridge.invoke(self.session, "/workspace", name, args, "call-1"))

    async def test_terminal_delegates_full_command_and_lifecycle(self):
        self.assertEqual((await self.invoke("terminal", {"command": "git status"}))["exit_code"], 0)
        self.client.create_terminal.assert_awaited_once_with(
            session_id=self.session, command="/bin/bash", args=["-lc", "git status"],
            cwd="/workspace", output_byte_limit=262144)
        self.client.release_terminal.assert_awaited_once()
        self.assertEqual(self.client.request_permission.call_args.kwargs["tool_call"].title, "Bash")

    async def test_reads_and_writes_delegate_without_local_filesystem(self):
        self.assertEqual(await self.invoke("read_file", {"path": "does-not-exist.txt", "line": 2}), {"content": "client content"})
        self.client.read_text_file.assert_awaited_once_with(
            session_id=self.session, path="/workspace/does-not-exist.txt", line=2, limit=None)
        self.assertEqual(await self.invoke("write_file", {"path": "new.md", "content": "draft"}), {"success": True})
        self.client.write_text_file.assert_awaited_once_with(session_id=self.session, path="/workspace/new.md", content="draft")

    async def test_no_native_fallback_after_client_rejection(self):
        self.client.write_text_file.side_effect = RuntimeError("ACP_FILE_WRITE_DENIED")
        self.assertIn("ACP_FILE_WRITE_DENIED", (await self.invoke("write_file", {"path": "new.md", "content": "draft"}))["error"])
        self.assertEqual(self.client.session_update.call_args.kwargs["update"].status, "failed")

    async def test_rpc_policy_error_keeps_code_without_forwarding_unrelated_details(self):
        from acp.exceptions import RequestError
        error = RequestError(-32603, "Internal error", {"details": "ACP_FILE_WRITE_DENIED: outside action path"})
        self.assertEqual(tool_error(error), "ACP_FILE_WRITE_DENIED: outside action path")
        error = RequestError(-32603, "Internal error", {"details": "private diagnostic"})
        self.assertEqual(tool_error(error), "Internal error")

    async def test_disabled_capabilities_and_unknown_tools_never_execute(self):
        self.bridge.capabilities = ClientCapabilities()
        self.assertEqual(self.bridge.tool_definitions(), [])
        for name in ["terminal", "read_file", "write_file", "delegate_task", "execute_code", "process", "patch", "mcp_tool"]:
            self.assertIn("ACP_TOOL_DENIED", (await self.invoke(name, {}))["error"])
        self.client.request_permission.assert_not_awaited()
        self.client.create_terminal.assert_not_awaited()

    async def test_permission_rejection_and_extra_parameters_fail_closed(self):
        self.client.request_permission.return_value = SimpleNamespace(outcome=SimpleNamespace(option_id="reject"))
        self.assertIn("ACP_TOOL_DENIED", (await self.invoke("terminal", {"command": "git status"}))["error"])
        self.assertIn("ACP_TOOL_INPUT_INVALID", (await self.invoke("terminal", {"command": "git status", "background": True}))["error"])
        self.client.create_terminal.assert_not_awaited()

    async def test_nonzero_exit_stays_failed_and_releases_terminal(self):
        self.client.wait_for_terminal_exit.return_value = SimpleNamespace(exit_code=2, signal=None)
        result = await self.invoke("terminal", {"command": "git status"})
        self.assertEqual(result["exit_code"], 2)
        self.assertIn("error", result)
        self.client.release_terminal.assert_awaited_once()

    async def test_cancel_releases_pending_terminal(self):
        started = asyncio.Event()
        async def wait(**kwargs):
            started.set()
            await asyncio.Future()
        self.client.wait_for_terminal_exit.side_effect = wait
        task = asyncio.create_task(self.invoke("terminal", {"command": "git status"}))
        await started.wait()
        task.cancel()
        self.assertIn("cancelled", (await task)["error"])
        self.client.release_terminal.assert_awaited_once()

    async def test_disconnect_does_not_fall_back(self):
        self.bridge.initialize(self.bridge.capabilities, asyncio.get_running_loop())
        bound = self.bridge.bind_session(self.session, "/workspace")
        self.bridge.on_connect(None)
        result = await asyncio.to_thread(invoke_backend, SimpleNamespace(tool_backend=bound),
                                         "terminal", {"command": "echo denied"}, self.session, "t1")
        self.assertIn("ACP_TOOL_BACKEND_FAILED", result)
        self.client.create_terminal.assert_not_awaited()

    async def test_timeout_cancels_rpc_future_without_local_execution(self):
        from concurrent.futures import TimeoutError
        self.bridge.initialize(self.bridge.capabilities, asyncio.get_running_loop())
        future = Mock()
        future.result.side_effect = TimeoutError()
        def submit(coroutine, loop):
            coroutine.close()
            return future
        with patch("asyncio.run_coroutine_threadsafe", side_effect=submit):
            with self.assertRaisesRegex(TimeoutError, "timed out"):
                await asyncio.to_thread(self.bridge.invoke_sync, self.session, "/workspace",
                                        "terminal", {"command": "echo denied"}, "t1", self.session)
        future.cancel.assert_called_once()
        self.client.create_terminal.assert_not_awaited()

    async def test_native_prompt_propagates_model_failures(self):
        from acp.exceptions import RequestError
        from acp.schema import TextContentBlock
        from acp_adapter.session import SessionState
        for failure in [RuntimeError("fixture provider failed"), {"failed": True, "error": "fixture"}]:
            agent = fake_agent()
            if isinstance(failure, Exception):
                agent.run_conversation = Mock(side_effect=failure)
            else:
                agent.run_conversation = Mock(return_value=failure)
            server = create_agent()
            server.on_connect(self.client)
            state = SessionState(session_id=self.session, agent=agent, cwd="/workspace")
            server.session_manager._sessions[self.session] = state
            with self.assertRaisesRegex(RequestError, "ACP_AGENT_RUN_FAILED"):
                await server.prompt([TextContentBlock(type="text", text="fixture failure")], self.session)
            self.assertFalse(state.is_running)


class RequiredBackendTests(unittest.TestCase):
    def make_agent(self, backend=None):
        backend = backend or SimpleNamespace(
            invoke=Mock(return_value='{"content":"from client"}'),
            tool_definitions=lambda: [],
        )
        agent = AIAgent(model="octo-fixture", provider="custom", api_key="local-fixture",
                        api_mode="chat_completions", base_url="http://127.0.0.1:1/v1",
                        enabled_toolsets=["acp-client-tools"], quiet_mode=True,
                        skip_context_files=True, skip_memory=True, load_soul_identity=False,
                        checkpoints_enabled=False, tool_backend=backend, tool_backend_required=True)
        return agent, backend

    def test_required_backend_is_checked_before_agent_initialization(self):
        with patch("agent.agent_init.init_agent") as initialize:
            with self.assertRaisesRegex(RuntimeError, "ACP_TOOL_BACKEND_UNAVAILABLE"):
                AIAgent(tool_backend_required=True)
            initialize.assert_not_called()
        with self.assertRaisesRegex(RuntimeError, "ACP_TOOL_BACKEND_UNAVAILABLE"):
            HermesACPAgent(require_client_tools=True)

    def test_native_sequential_parallel_and_special_dispatch_use_backend(self):
        for names in [("terminal",), ("read_file", "read_file"),
                      ("delegate_task", "execute_code", "process", "todo", "memory", "session_search")]:
            with self.subTest(names=names):
                agent, backend = self.make_agent()
                calls = [SimpleNamespace(id=f"t{i}", function=SimpleNamespace(name=name,
                         arguments=json.dumps({"path": f"file-{i}.txt", "command": "echo fixture"})))
                         for i, name in enumerate(names)]
                with patch("run_agent.handle_function_call", side_effect=AssertionError("native tool called")) as native, \
                     patch.object(agent, "_dispatch_delegate_task", side_effect=AssertionError("native delegate called")) as delegate:
                    messages = []
                    agent._execute_tool_calls(SimpleNamespace(tool_calls=calls), messages, "session")
                    self.assertEqual(backend.invoke.call_count, len(names))
                    self.assertEqual(len(messages), len(names))
                    native.assert_not_called()
                    delegate.assert_not_called()
                    self.assertTrue(all("from client" in item["content"] for item in messages))

    def test_backend_missing_or_raising_never_reaches_native_dispatch(self):
        for missing in [False, True]:
            agent, backend = self.make_agent()
            backend.invoke.side_effect = RuntimeError("backend crashed")
            if missing:
                agent.tool_backend = None
            with patch("run_agent.handle_function_call", side_effect=AssertionError("native tool called")) as native:
                for names in [("terminal",), ("read_file", "read_file")]:
                    calls = [SimpleNamespace(id=f"t{i}", function=SimpleNamespace(name=name,
                             arguments=json.dumps({"path": f"file-{i}.txt"}))) for i, name in enumerate(names)]
                    messages = []
                    agent._execute_tool_calls(SimpleNamespace(tool_calls=calls), messages, "session")
                    self.assertEqual(len(messages), len(names))
                    self.assertTrue(all("ACP_TOOL_BACKEND_FAILED" in item["content"] for item in messages))
                native.assert_not_called()

    def test_native_factory_receives_controls_before_construction_and_restore(self):
        from hermes_state import SessionDB
        server = create_agent()
        server.tool_backend.on_connect(SimpleNamespace())
        server.tool_backend.initialize(ClientCapabilities(), SimpleNamespace())
        with tempfile.TemporaryDirectory() as directory:
            db = SessionDB(db_path=Path(directory) / "state.db")
            server.session_manager._db_instance = db
            try:
                with patch("run_agent.AIAgent", side_effect=lambda **kwargs: fake_agent()) as factory, \
                     patch("hermes_cli.config.load_config", return_value={"model": {"default": "fixture"}}), \
                     patch("hermes_cli.runtime_provider.resolve_runtime_provider", return_value={"provider":"custom"}):
                    state = server.session_manager.create_session("/workspace")
                    self.assertTrue(state.session_id.startswith("hermes_"))
                    params = factory.call_args.kwargs
                    self.assertTrue(params["tool_backend_required"])
                    self.assertTrue(params["skip_context_files"])
                    self.assertTrue(params["skip_memory"])
                    self.assertFalse(params["checkpoints_enabled"])
                    self.assertEqual(params["enabled_toolsets"], ["acp-client-tools"])
                    server.session_manager._sessions.clear()
                    restored = server.session_manager.get_session(state.session_id)
                    self.assertIsNotNone(restored)
                    self.assertEqual(factory.call_count, 2)
                    self.assertTrue(factory.call_args.kwargs["tool_backend_required"])
            finally:
                db.close()


class PatchLoadingTests(unittest.TestCase):
    def test_version_mismatch_and_invalid_patch_abort_without_install_writes(self):
        import hashlib
        from runtime_patch import prepare_modules
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            source.mkdir()
            (root / "patches").mkdir()
            original = b'value = "original"\n'
            (source / "sample.py").write_bytes(original)
            manifest = {"commit": "fixture", "files": {"sample.py": hashlib.sha256(original).hexdigest()}}
            (root / "patches/manifest.json").write_text(json.dumps(manifest))
            (root / "patches/client-tools.patch").write_text('--- a/sample.py\n+++ b/sample.py\n@@ -1 +1 @@\n-value = "original"\n+value = "patched"\n')
            modules = prepare_modules(source, root)
            namespace = {}
            exec(modules["sample"].get_code("sample"), namespace)
            self.assertEqual(namespace["value"], "patched")
            self.assertEqual((source / "sample.py").read_bytes(), original)
            (root / "patches/client-tools.patch").write_text("invalid patch")
            with self.assertRaisesRegex(RuntimeError, "could not be applied"):
                prepare_modules(source, root)
            (source / "sample.py").write_text("unexpected version")
            with self.assertRaisesRegex(RuntimeError, "Unsupported Hermes source"):
                prepare_modules(source, root)


if __name__ == "__main__":
    unittest.main()
