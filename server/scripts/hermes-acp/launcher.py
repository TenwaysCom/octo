"""Thin entrypoint for Hermes native ACP with its required client-tool backend."""
import asyncio
from contextlib import redirect_stdout
import logging
import os
import sys
import uuid

from runtime_patch import activate

os.environ["HERMES_ACP_CLIENT_TOOLS_REQUIRED"] = "1"
activate()
with redirect_stdout(sys.stderr):
    import acp
    from acp_adapter.client_tools import AcpClientToolBackend
    from acp_adapter.server import HermesACPAgent


def create_agent():
    # Preserve existing native IDs while letting Hermes create/persist sessions.
    return HermesACPAgent(
        tool_backend=AcpClientToolBackend(), require_client_tools=True,
        session_id_factory=lambda: "hermes_" + str(uuid.uuid4()),
    )


def main():
    from acp_adapter.entry import _load_env, _setup_logging
    _load_env()
    _setup_logging()
    logging.getLogger().setLevel(logging.WARNING)
    agent = create_agent()
    if "--check" in sys.argv:
        print("Hermes ACP required client-tool backend check OK")
        return
    asyncio.run(acp.run_agent(agent, use_unstable_protocol=True))


if __name__ == "__main__":
    main()
