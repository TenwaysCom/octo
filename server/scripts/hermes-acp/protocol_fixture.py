"""Real Hermes/ACP model loop against a loopback-only test model endpoint."""
import socket

original_connect = socket.socket.connect


def loopback_only(sock, address):
    if isinstance(address, tuple) and address[0] not in {"127.0.0.1", "::1", "localhost"}:
        raise OSError("Protocol fixture forbids external network access")
    return original_connect(sock, address)


socket.socket.connect = loopback_only

from acp_adapter.entry import main
from agent import title_generator

# The production adapter/model/tool loop is unchanged. Avoid unrelated title
# generation threads when tearing down this deterministic protocol fixture.
title_generator.maybe_auto_title = lambda *args, **kwargs: None
main()
