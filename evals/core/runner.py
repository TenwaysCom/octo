from __future__ import annotations
import copy
import shutil
import subprocess
import time
from pathlib import Path
from urllib.parse import urlsplit
from .bridge import bridge
from .dataset import load_dataset
from .storage import REPO, atomic_json, digest, file_hash, locate, lock, new_id, now, read_json, staging, write_jsonl
from evals.scenarios import SCENARIOS


def code_identity():
    files = {}
    for directory in (REPO / "server/src", REPO / "server/dist", REPO / "evals"):
        for path in sorted(directory.rglob("*")):
            if path.suffix not in (".ts", ".js", ".py", ".txt") or not path.is_file(): continue
            if any(part in {"artifacts", ".venv", "__pycache__"} for part in path.relative_to(directory).parts): continue
            files[str(path.relative_to(REPO))] = file_hash(path)
    def git(*args):
        return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, check=True).stdout.strip()
    return {"commit": git("rev-parse", "HEAD"), "dirty": bool(git("status", "--porcelain")), "code_hash": digest(files)}


def safe_url(value):
    url = urlsplit(value)
    if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password or url.query or url.fragment:
        raise ValueError("Endpoint must be an HTTP URL without credentials, query or fragment")


def validate_config(config, scenario):
    allowed = {"provider", "model", "prompts", "timeoutMs", "wikiWorkspace", "rerank"}
    if set(config) - allowed: raise ValueError("Unknown model config field; credentials belong in environment")
    if config.get("provider") not in ("deepseek", "zcode") or not isinstance(config.get("model"), str) or not config["model"].strip():
        raise ValueError("Explicit provider and model required")
    if not isinstance(config.get("prompts", {}), dict) or not all(isinstance(k, str) and isinstance(v, str) and v.strip() for k, v in config.get("prompts", {}).items()):
        raise ValueError("prompts must be a nonempty-text mapping")
    timeout = config.setdefault("timeoutMs", 120000)
    if type(timeout) is not int or not 0 < timeout <= 600000: raise ValueError("timeoutMs must be in 1..600000")
    if SCENARIOS[scenario].requires_knowledge:
        rerank = config.get("rerank", {})
        if not config.get("wikiWorkspace") or set(rerank) - {"mode", "url", "model", "minScore"}:
            raise ValueError("Wiki workspace and explicit rerank configuration required")
        if rerank.get("mode") not in ("general", "rerank") or not rerank.get("model") or not rerank.get("url"):
            raise ValueError("Explicit rerank mode/url/model required")
        safe_url(rerank["url"])
        score = rerank.setdefault("minScore", .7)
        if type(score) not in (int, float) or not 0 <= score <= 1: raise ValueError("Invalid minScore")
    return config


def freeze_wiki(workspace, destination):
    source = Path(workspace).resolve() / "docs/llm-wiki"
    if source.is_symlink() or source.parent.is_symlink(): raise ValueError("Wiki snapshot may not contain symlinks")
    if not source.is_dir(): raise ValueError("wikiWorkspace must contain docs/llm-wiki")
    files = {}
    for path in sorted(source.rglob("*")):
        if path.is_symlink(): raise ValueError("Wiki snapshot may not contain symlinks")
        if path.is_file() and path.suffix == ".md":
            relative = path.relative_to(source)
            target = Path(destination) / "docs/llm-wiki" / relative
            target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(path, target)
            files[str(relative)] = file_hash(target)
    if not files: raise ValueError("Empty Wiki snapshot")
    return files


def verify_wiki(run, manifest):
    root = run / "knowledge/docs/llm-wiki"
    if any(p.is_symlink() for p in root.rglob("*")): raise ValueError("Frozen knowledge contains symlinks")
    actual = {str(p.relative_to(root)): file_hash(p) for p in root.rglob("*.md") if p.is_file()}
    if actual != manifest.get("knowledge_files", {}): raise ValueError("Frozen knowledge modified")


def create_run(root, dataset_id, scenario_id, config, invoke=bridge):
    if scenario_id not in SCENARIOS: raise ValueError("Unknown scenario")
    manifest, cases, inputs = load_dataset(root, dataset_id)
    cases = [c for c in cases if c["scenario_id"] == scenario_id]
    if not cases: raise ValueError("Dataset contains no cases for this scenario")
    if any(c["scenario_version"] != SCENARIOS[scenario_id].version for c in cases):
        raise ValueError("Scenario changed; reimport annotations for the current version")
    config = validate_config(copy.deepcopy(config), scenario_id)
    if set(config.get("prompts", {})) - set(SCENARIOS[scenario_id].prompt_keys):
        raise ValueError("Prompt override key is not used by this scenario")
    config["prompts"] = {**invoke("defaults", None)["prompts"], **manifest.get("prompts", {}), **config.get("prompts", {})}
    # Only scenario-relevant templates are frozen and sent to the execution boundary.
    keys = SCENARIOS[scenario_id].prompt_keys
    config["prompts"] = {k: config["prompts"][k] for k in keys}
    run_id = new_id("run")
    with staging(Path(root) / "runs", run_id) as path:
        knowledge_files = freeze_wiki(config["wikiWorkspace"], path / "knowledge") if SCENARIOS[scenario_id].requires_knowledge else {}
        config.pop("wikiWorkspace", None)
        write_jsonl(path / "cases.jsonl", cases)
        write_jsonl(path / "inputs.jsonl", [inputs[k] for k in sorted({c["input_ref"] for c in cases})])
        atomic_json(path / "manifest.json", {"schema_version": 1, "run_id": run_id, "dataset_id": dataset_id,
                    "dataset_hash": manifest["content_hash"], "scenario_id": scenario_id, "scenario_version": SCENARIOS[scenario_id].version,
                    "config": config, "config_hash": digest(config), "code": code_identity(), "created_at": now(),
                    "knowledge_files": knowledge_files, "knowledge_hash": digest(knowledge_files), "state": "pending",
                    "cases_hash": file_hash(path / "cases.jsonl"), "inputs_hash": file_hash(path / "inputs.jsonl")})
    return run_id


def load_run(root, run_id):
    from .storage import read_jsonl
    path = locate(root, "runs", run_id); manifest = read_json(path / "manifest.json")
    if file_hash(path / "cases.jsonl") != manifest["cases_hash"] or file_hash(path / "inputs.jsonl") != manifest["inputs_hash"] or digest(manifest["config"]) != manifest["config_hash"]:
        raise ValueError("Frozen run inputs/config modified")
    return path, manifest, read_jsonl(path / "cases.jsonl"), {s["source_id"]: s for s in read_jsonl(path / "inputs.jsonl")}


def run_cases(root, run_id, invoke=bridge):
    path, manifest, cases, inputs = load_run(root, run_id)
    with lock(path / ".lock"):
        if code_identity()["code_hash"] != manifest["code"]["code_hash"]:
            raise ValueError("Code/build changed; create a new Run")
        if SCENARIOS[manifest["scenario_id"]].requires_knowledge: verify_wiki(path, manifest)
        manifest["state"] = "running"; atomic_json(path / "manifest.json", manifest)
        for case in cases:
            target = path / "cases" / (case["case_id"] + ".json")
            if target.exists(): continue
            source = inputs[case["input_ref"]]
            config = copy.deepcopy(manifest["config"])
            if SCENARIOS[manifest["scenario_id"]].requires_knowledge: config["wikiWorkspace"] = str((path / "knowledge").resolve())
            request = {"scenario": case["scenario_id"], "messages": source["input"]["messages"],
                       "actionRunId": run_id + ":" + case["case_id"], "config": config,
                       "exclusionTokens": source["exclusion_tokens"]}
            started = time.monotonic(); attempts = []
            for attempt in range(3):
                try:
                    result = invoke("run", request, timeout=config["timeoutMs"] / 1000 * 4 + 30)
                except subprocess.TimeoutExpired:
                    result = {"status": "error", "error": {"errorCode": "EVAL_BRIDGE_TIMEOUT"}}
                except (ValueError, OSError):
                    result = {"status": "error", "error": {"errorCode": "EVAL_BRIDGE_FAILED"}}
                if result.get("status") not in ("ok", "error", "invalid_output"):
                    result = {"status": "error", "error": {"errorCode": "EVAL_INVALID_RESULT"}}
                attempts.append(result)
                code = result.get("error", {}).get("errorCode", "")
                transient = "TIMEOUT" in code or code.endswith("REQUEST_FAILED")
                if not transient or attempt == 2: break
                time.sleep(attempt + 1)
            atomic_json(target, {"case_id": case["case_id"], "input_hash": case["input_hash"],
                        "expected_hash": case["expected_hash"], "request": request, **result,
                        "attempts": attempts, "duration_ms": round((time.monotonic() - started) * 1000), "finished_at": now()})
        manifest["state"] = "completed"; manifest["finished_at"] = now()
        atomic_json(path / "manifest.json", manifest)
    return run_id
