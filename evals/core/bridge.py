import json
import os
import subprocess
from .storage import REPO


def bridge(operation, data, timeout=600):
    script = REPO / "server/dist/scripts/ticket-eval.js"
    if not script.exists():
        raise ValueError("Build server first: pnpm --dir server build")
    env = {**os.environ, "LOG_LEVEL": "silent", "WIKI_QA_EXTRACT_LOG_ENABLED": "false",
           "WIKI_QA_RERANK_LOG_ENABLED": "false", "WIKI_QA_ANSWER_LOG_ENABLED": "false"}
    result = subprocess.run(["node", str(script)], input=json.dumps({"operation": operation, "data": data}),
                            capture_output=True, text=True, cwd=REPO, env=env, timeout=timeout)
    try:
        envelope = json.loads(result.stdout)
    except ValueError:
        raise ValueError("EVAL_BRIDGE_PROTOCOL_ERROR; server build/runtime must be available") from None
    if result.returncode or not envelope.get("ok"):
        raise ValueError("EVAL_BRIDGE_FAILED; check configuration (database/model credentials remain in environment)")
    return envelope["data"]
