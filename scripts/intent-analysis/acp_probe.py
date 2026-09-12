"""Minimal ACP round-trip probe against `kimi acp`."""
import json
import os
import subprocess
import sys
import threading

KIMI = os.path.expanduser("~/.kimi-code/bin/kimi")
WORKDIR = "/Users/linyu/proj/octo"


def send(proc, payload):
    proc.stdin.write(json.dumps(payload) + "\n")
    proc.stdin.flush()


def main():
    env = dict(os.environ)
    for k in ("ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy"):
        v = env.get(k)
        if v and v.startswith("socks://"):
            env[k] = "socks5://" + v[len("socks://"):]
    proc = subprocess.Popen(
        [KIMI, "acp"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        cwd=WORKDIR,
        env=env,
        bufsize=1,
    )
    responses = {}
    chunks = []
    lock = threading.Lock()

    def reader():
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if "id" in msg and ("result" in msg or "error" in msg):
                with lock:
                    responses[msg["id"]] = msg
            elif msg.get("method") == "session/update":
                update = msg.get("params", {}).get("update", {})
                if update.get("sessionUpdate") == "agent_message_chunk":
                    content = update.get("content", {})
                    if content.get("type") == "text":
                        chunks.append(content.get("text", ""))

    t = threading.Thread(target=reader, daemon=True)
    t.start()

    def wait_response(rid, timeout=120):
        import time
        deadline = time.time() + timeout
        while time.time() < deadline:
            with lock:
                if rid in responses:
                    return responses.pop(rid)
            time.sleep(0.05)
        raise TimeoutError(f"timeout waiting for response id={rid}")

    send(proc, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": 1,
        "clientCapabilities": {"fs": {"readTextFile": False, "writeTextFile": False}, "terminal": False},
        "clientInfo": {"name": "octo-intent-probe", "version": "0.1.0"},
    }})
    r = wait_response(1)
    print("initialize:", json.dumps(r.get("result", r.get("error")), ensure_ascii=False)[:300])

    send(proc, {"jsonrpc": "2.0", "id": 2, "method": "session/new", "params": {"cwd": WORKDIR, "mcpServers": []}})
    r = wait_response(2)
    result = r.get("result") or {}
    session_id = result.get("sessionId")
    print("session/new:", session_id or json.dumps(r.get("error"), ensure_ascii=False)[:300])
    if not session_id:
        sys.exit(1)

    send(proc, {"jsonrpc": "2.0", "id": 3, "method": "session/prompt", "params": {
        "sessionId": session_id,
        "prompt": [{"type": "text", "text": "只回复两个字：你好。不要调用任何工具。"}],
    }})
    r = wait_response(3, timeout=180)
    print("prompt stopReason:", json.dumps(r.get("result", r.get("error")), ensure_ascii=False)[:200])
    print("agent text:", "".join(chunks)[:500])

    proc.terminate()


if __name__ == "__main__":
    main()
