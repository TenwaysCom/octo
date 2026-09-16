"""ACP client tool backend. No local tool fallback or business permission rules."""
import asyncio
import json
import logging
import os
from concurrent.futures import TimeoutError as FutureTimeout
from types import SimpleNamespace

from acp.schema import PermissionOption, ToolCallStart, ToolCallProgress, ToolCallUpdate

TOOLS = {
    "terminal": ("Bash", "execute", {
        "command": {"type": "string", "description": "Complete foreground command; shell operators and expansions are restricted by Octo."},
        "cwd": {"type": "string"},
    }, ["command"]),
    "read_file": ("ReadFile", "read", {
        "path": {"type": "string"}, "line": {"type": "integer", "minimum": 1},
        "limit": {"type": "integer", "minimum": 1},
    }, ["path"]),
    "write_file": ("WriteFile", "edit", {
        "path": {"type": "string"}, "content": {"type": "string"},
    }, ["path", "content"]),
}


def tool_error(error):
    # The ACP SDK wraps client-side policy errors in JSON-RPC internal_error.
    # Preserve Octo's actionable code without forwarding arbitrary RPC details.
    details = getattr(error, "data", None)
    reason = details.get("details") if isinstance(details, dict) else None
    return reason if isinstance(reason, str) and reason.startswith("ACP_") else str(error)


class AcpClientToolBackend:
    def __init__(self):
        self.capabilities = None
        self.loop = None
        self.connection = None
        self.pending = {}

    def initialize(self, capabilities, loop):
        self.capabilities = capabilities
        self.loop = loop

    def on_connect(self, connection):
        self.connection = connection

    def bind_session(self, session_id, cwd):
        if self.connection is None or self.loop is None:
            raise RuntimeError("ACP_TOOL_BACKEND_UNAVAILABLE")
        return SimpleNamespace(
            tool_definitions=self.tool_definitions,
            invoke=lambda name, args, call_id, task_id: self.invoke_sync(
                session_id, cwd, name, args, call_id, task_id),
        )

    def cancel(self, session_id):
        for task in tuple(self.pending.get(session_id, ())):
            task.cancel()

    def enabled(self, name):
        caps = self.capabilities
        if name == "terminal":
            return bool(caps and caps.terminal)
        fs = getattr(caps, "fs", None)
        return bool(fs and getattr(fs, "read_text_file" if name == "read_file" else "write_text_file", False))

    def tool_definitions(self):
        return [{"type": "function", "function": {
            "name": name, "description": f"{title} through Octo's controlled ACP client. Other operations are unavailable.",
            "parameters": {"type": "object", "properties": props, "required": required, "additionalProperties": False},
        }} for name, (title, _kind, props, required) in TOOLS.items() if self.enabled(name)]

    def invoke_sync(self, session_id, cwd, name, args, call_id, task_id):
        if task_id != session_id or not self.loop or not self.connection:
            raise ValueError("ACP tool session mismatch or connection unavailable")
        future = asyncio.run_coroutine_threadsafe(self.invoke(session_id, cwd, name, args, call_id), self.loop)
        try:
            return future.result(timeout=75)
        except FutureTimeout:
            future.cancel()
            raise TimeoutError("Octo ACP tool request timed out") from None

    async def invoke(self, session_id, cwd, name, args, call_id):
        task = asyncio.current_task()
        self.pending.setdefault(session_id, set()).add(task)
        terminal_id = None
        try:
            if name not in TOOLS or not self.enabled(name):
                raise ValueError("ACP_TOOL_DENIED: tool is not enabled by the Octo client")
            title, kind, props, required = TOOLS[name]
            if not isinstance(args, dict) or set(args) - set(props) or any(key not in args for key in required):
                raise ValueError("ACP_TOOL_INPUT_INVALID")
            for key, value in args.items():
                if props[key]["type"] == "string" and not isinstance(value, str):
                    raise ValueError("ACP_TOOL_INPUT_INVALID")
                if props[key]["type"] == "integer" and (type(value) is not int or value < 1):
                    raise ValueError("ACP_TOOL_INPUT_INVALID")
            await self.connection.session_update(session_id=session_id, update=ToolCallStart(
                session_update="tool_call", tool_call_id=call_id, title=title, kind=kind,
                status="pending", raw_input=args))
            permission = await self.connection.request_permission(
                session_id=session_id,
                tool_call=ToolCallUpdate(tool_call_id=call_id, title=title, kind=kind, raw_input=args),
                options=[PermissionOption(option_id="once", kind="allow_once", name="Allow once"),
                         PermissionOption(option_id="reject", kind="reject_once", name="Reject")])
            if getattr(permission.outcome, "option_id", None) != "once":
                raise ValueError("ACP_TOOL_DENIED: permission was not granted")
            if name == "terminal":
                created = await self.connection.create_terminal(
                    session_id=session_id, command="/bin/bash", args=["-lc", args["command"]],
                    cwd=os.path.abspath(os.path.join(cwd, args.get("cwd", "."))), output_byte_limit=262144)
                terminal_id = created.terminal_id
                status = await self.connection.wait_for_terminal_exit(session_id=session_id, terminal_id=terminal_id)
                output = await self.connection.terminal_output(session_id=session_id, terminal_id=terminal_id)
                result = {"output": output.output, "exit_code": status.exit_code,
                          "signal": status.signal, "truncated": output.truncated}
                if status.exit_code != 0:
                    result["error"] = "Command did not complete successfully"
            elif name == "read_file":
                response = await self.connection.read_text_file(
                    session_id=session_id, path=os.path.abspath(os.path.join(cwd, args["path"])),
                    line=args.get("line"), limit=args.get("limit"))
                result = {"content": response.content}
            else:
                await self.connection.write_text_file(
                    session_id=session_id, path=os.path.abspath(os.path.join(cwd, args["path"])), content=args["content"])
                result = {"success": True}
        except asyncio.CancelledError:
            result = {"error": "ACP tool execution cancelled"}
        except Exception as error:
            result = {"error": tool_error(error)}
        finally:
            if terminal_id:
                try:
                    await self.connection.release_terminal(session_id=session_id, terminal_id=terminal_id)
                except Exception:
                    logging.getLogger(__name__).warning("ACP terminal release failed")
            self.pending.get(session_id, set()).discard(task)
        await self.connection.session_update(session_id=session_id, update=ToolCallProgress(
            session_update="tool_call_update", tool_call_id=call_id,
            status="failed" if "error" in result else "completed", raw_output=result,
            content=[{"type": "content", "content": {"type": "text", "text": json.dumps(result)}}]))
        return json.dumps(result)
