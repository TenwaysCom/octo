from __future__ import annotations
import os
from importlib.metadata import version
from pathlib import Path
from .runner import load_run
from .storage import atomic_json, digest, file_hash, lock, new_id, now, read_json, staging, write_jsonl
from evals.scenarios import SCENARIOS


def judge_config(config):
    if set(config) - {"model", "threshold"} or not isinstance(config.get("model"), str) or not config["model"].strip():
        raise ValueError("Explicit judge model required; keys remain in OPENAI_API_KEY")
    threshold = config.get("threshold", .7)
    if type(threshold) not in (int, float) or not 0 <= threshold <= 1: raise ValueError("Invalid judge threshold")
    return {"model": config["model"], "threshold": threshold}


def deepeval_measure(scenario, case, messages, output, config):
    # Standalone metric.measure: no Confident login, dataset upload or evaluate() run publishing.
    os.environ["DEEPEVAL_TELEMETRY_OPT_OUT"] = "YES"
    from deepeval.models import GPTModel
    judge = GPTModel(model=config["model"], api_key=os.environ["OPENAI_API_KEY"],
                     base_url="https://api.openai.com/v1", temperature=0, timeout=60, max_retries=2)
    test_case = scenario.to_test_case(case, messages, output)
    metrics = []
    for metric in scenario.build_metrics(judge, config["threshold"]):
        try:
            metric.measure(test_case)
            if metric.score is None: raise ValueError("Missing score")
            score = float(metric.score)
            if not 0 <= score <= 1: raise ValueError("Invalid score")
            metrics.append({"name": metric.__name__, "score": score, "reason": metric.reason,
                            "passed": score >= config["threshold"], "status": "ok"})
        except Exception:
            # Provider exceptions can contain credentials/requests; only stable diagnostics are persisted.
            metrics.append({"name": metric.__name__, "status": "judge_error", "errorCode": "EVAL_JUDGE_FAILED"})
    return metrics


def score_run(root, run_id, config, measure=deepeval_measure):
    config = judge_config(config)
    if measure is deepeval_measure and not os.environ.get("OPENAI_API_KEY", "").strip():
        raise ValueError("OPENAI_API_KEY is required for the explicit OpenAI judge")
    run, manifest, cases, inputs = load_run(root, run_id)
    if manifest["state"] != "completed": raise ValueError("Run must finish before scoring")
    scenario = SCENARIOS[manifest["scenario_id"]]
    if scenario.version != manifest["scenario_version"]: raise ValueError("Scenario version changed")
    try: engine = version("deepeval")
    except Exception:
        if measure is deepeval_measure: raise ValueError("Install evals/requirements.txt before scoring") from None
        engine = "mock"
    specs = scenario.metric_specs()
    config = {**config, "engine": engine, "judge_provider": "openai", "judge_endpoint": "https://api.openai.com/v1", "requested_temperature": 0, "metric_specs": specs, "scenario_version": scenario.version,
              "scoring_code_hash": digest({"evaluator": file_hash(Path(__file__)), "scenarios": file_hash(Path(__file__).parents[1] / "scenarios/__init__.py")})}
    score_id = new_id("score")
    # Publish complete scoring reports only. Each case is persisted in staging during execution.
    with lock(run / ".lock"), staging(run / "scores", score_id) as path:
        results = []
        for case in cases:
            actual = read_json(run / "cases" / (case["case_id"] + ".json"))
            result = {"case_id": case["case_id"], "input_hash": case["input_hash"], "expected_hash": case["expected_hash"],
                      "actual_hash": digest(actual), "metrics": [], "generation_status": actual["status"]}
            if actual["status"] != "ok":
                result["status"] = "quality_failed" if actual["status"] == "invalid_output" else "generation_error"
            else:
                output = actual["output"]
                if scenario.id == "ticket.early_analysis":
                    intent = output["analysis"]["intent"]["intentType"]
                    result["actual_intent"] = intent; result["expected_intent"] = case["expected"]["intent"]
                    result["metrics"].append({"name": "意图准确率", "score": float(intent == case["expected"]["intent"]),
                                              "passed": intent == case["expected"]["intent"], "status": "ok", "reason": "枚举与人工标签精确匹配"})
                try:
                    result["metrics"].extend(measure(scenario, case, inputs[case["input_ref"]]["input"]["messages"], output, config))
                except Exception:
                    result["metrics"].append({"name": "裁判", "status": "judge_error", "errorCode": "EVAL_JUDGE_FAILED"})
                result["status"] = ("judge_error" if any(m["status"] != "ok" for m in result["metrics"]) else
                                    "passed" if all(m["passed"] for m in result["metrics"]) else "quality_failed")
            results.append(result); atomic_json(path / "cases" / (case["case_id"] + ".json"), result)
        write_jsonl(path / "results.jsonl", results)
        atomic_json(path / "manifest.json", {"score_id": score_id, "run_id": run_id, "created_at": now(),
                    "config": config, "config_hash": digest(config), "results_hash": file_hash(path / "results.jsonl"),
                    "calibrated": False})
    return score_id
