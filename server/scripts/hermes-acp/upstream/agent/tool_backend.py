"""Required tool execution backend; failures never fall back to native tools."""
import json


def validate_backend(backend, required):
    if required and (backend is None or not callable(getattr(backend, "invoke", None))
                     or not callable(getattr(backend, "tool_definitions", None))):
        raise RuntimeError("ACP_TOOL_BACKEND_UNAVAILABLE")


def invoke_backend(agent, name, args, task_id, call_id):
    try:
        backend = getattr(agent, "tool_backend", None)
        validate_backend(backend, True)
        return backend.invoke(name, args, call_id, task_id)
    except Exception:
        return json.dumps({"error": "ACP_TOOL_BACKEND_FAILED"})
