from collections import Counter, defaultdict
from pathlib import Path
from .dataset import chunks, message_text, write_table
from .runner import load_run
from .storage import atomic_json, canonical, digest, file_hash, locate, new_id, now, read_json, read_jsonl, staging
from evals.scenarios import SCENARIOS


def load_score(root, run_id, score_id=None):
    run, manifest, cases, inputs = load_run(root, run_id)
    if score_id is None:
        ids = [p.name for p in (run / "scores").glob("score_*") if (p / "manifest.json").exists()]
        if len(ids) != 1: raise ValueError("Specify --score when there isn't exactly one score")
        score_id = ids[0]
    path = locate(run, "scores", score_id); score = read_json(path / "manifest.json")
    if score["run_id"] != run_id or digest(score["config"]) != score["config_hash"] or file_hash(path / "results.jsonl") != score["results_hash"]:
        raise ValueError("Score modified or mismatched")
    results = read_jsonl(path / "results.jsonl")
    if {r["case_id"] for r in results} != {c["case_id"] for c in cases}: raise ValueError("Incomplete score")
    for result in results:
        if digest(read_json(run / "cases" / (result["case_id"] + ".json"))) != result["actual_hash"]:
            raise ValueError("Actual output changed since scoring")
    return run, manifest, cases, inputs, path, score, results


def expanded_table(path, rows):
    # Reports also split long text; never silently lose evidence at Excel's limit.
    headers = list(dict.fromkeys(k for row in rows for k in row))
    expanded, final_headers = [], []
    for h in headers:
        count = max((len(chunks(row.get(h, ""))) for row in rows), default=1)
        final_headers.extend([h] + [f"{h}_{n}" for n in range(2, count + 1)])
    for row in rows:
        record = {}
        for h in headers:
            for n, part in enumerate(chunks(row.get(h, "")), 1): record[h if n == 1 else f"{h}_{n}"] = part
        expanded.append(record)
    write_table(path, final_headers or ["结果"], expanded)


def report_run(root, run_id, score_id=None):
    run, manifest, cases, inputs, path, score, results = load_score(root, run_id, score_id)
    indexed = {r["case_id"]: r for r in results}; rows, confusion = [], Counter()
    metric_scores = defaultdict(list)
    for case in cases:
        actual = read_json(run / "cases" / (case["case_id"] + ".json")); result = indexed[case["case_id"]]
        output = actual.get("output", {"raw_completions": [call["content"] for call in actual.get("calls", []) if "content" in call]})
        row = {"Case": case["case_id"], "场景": case["scenario_id"], "窗口消息": message_text(inputs[case["input_ref"]]["input"]["messages"]),
               "人工答案": canonical(case["expected"]), "实际输出": canonical(output), "状态": result["status"],
               "耗时ms": actual["duration_ms"], "错误码": actual.get("error", {}).get("errorCode", "")}
        for metric in result["metrics"]:
            row[metric["name"] + "_分数"] = str(metric.get("score", ""))
            row[metric["name"] + "_理由"] = metric.get("reason") or metric.get("errorCode", "")
            if metric["status"] == "ok": metric_scores[metric["name"]].append(metric["score"])
        if "actual_intent" in result: confusion[(result["expected_intent"], result["actual_intent"])] += 1
        rows.append(row)
    counts = Counter(r["status"] for r in results)
    summary = {"planned": len(cases), "generation_ok": sum(r["generation_status"] == "ok" for r in results),
               "scoring_ok": sum(r["generation_status"] == "ok" and r["status"] in ("passed", "quality_failed") for r in results),
               "quality_failed": counts["quality_failed"], "generation_error": counts["generation_error"],
               "judge_error": counts["judge_error"], "passed": counts["passed"], "calibrated": False,
               "metrics": {k: {"mean": sum(v)/len(v), "denominator": len(v)} for k, v in metric_scores.items()},
               "intent_confusion": [{"expected": a, "actual": b, "count": n} for (a, b), n in sorted(confusion.items())],
               "knowledge_boundary": "当前冻结知识；同 Ticket 显式来源过滤不保证排除所有间接泄漏" if manifest["scenario_id"] == "ticket.reply" else None}
    atomic_json(path / "summary.json", summary)
    # Put counts directly in Excel as columns so the report stands alone.
    for row in rows:
        row.update({"批次计划数": summary["planned"], "批次生成成功数": summary["generation_ok"],
                    "批次评分成功数": summary["scoring_ok"], "批次质量失败数": summary["quality_failed"],
                    "批次生成错误数": summary["generation_error"], "批次裁判错误数": summary["judge_error"], "评分已校准": "否"})
    expanded_table(path / "report.xlsx", rows)
    return str(path / "report.xlsx")


def compare_runs(root, baseline, candidate, baseline_score=None, candidate_score=None):
    a = load_score(root, baseline, baseline_score); b = load_score(root, candidate, candidate_score)
    ai, bi = {r["case_id"]: r for r in a[6]}, {r["case_id"]: r for r in b[6]}
    common_config = a[5]["config_hash"] == b[5]["config_hash"] and a[1]["scenario_id"] == b[1]["scenario_id"] and a[1]["scenario_version"] == b[1]["scenario_version"]
    rows, deltas = [], defaultdict(list)
    for cid in sorted(ai.keys() | bi.keys()):
        left, right = ai.get(cid), bi.get(cid)
        reason = ("新增" if left is None else "缺失" if right is None else "评分或场景口径变化" if not common_config else
                  "输入变化" if left["input_hash"] != right["input_hash"] else "人工答案变化" if left["expected_hash"] != right["expected_hash"] else "同口径")
        row = {"Case": cid, "比较口径": reason, "基线状态": left["status"] if left else "", "候选状态": right["status"] if right else ""}
        if reason == "同口径":
            lm, rm = {m["name"]: m for m in left["metrics"]}, {m["name"]: m for m in right["metrics"]}
            for name in lm.keys() & rm.keys():
                if lm[name]["status"] == rm[name]["status"] == "ok":
                    delta = rm[name]["score"] - lm[name]["score"]
                    row[name + "_变化"] = str(round(delta, 6)); deltas[name].append(delta)
            row["质量变化"] = ("新增失败" if left["status"] == "passed" and right["status"] == "quality_failed" else
                             "改善" if left["status"] == "quality_failed" and right["status"] == "passed" else "")
        rows.append(row)
    identifier = new_id("compare")
    with staging(Path(root) / "comparisons", identifier) as path:
        atomic_json(path / "manifest.json", {"comparison_id": identifier, "created_at": now(), "baseline": baseline,
                    "candidate": candidate, "baseline_score": a[5]["score_id"], "candidate_score": b[5]["score_id"],
                    "comparable": sum(r["比较口径"] == "同口径" for r in rows),
                    "metric_deltas": {k: {"mean": sum(v)/len(v), "denominator": len(v)} for k, v in deltas.items()}})
        expanded_table(path / "comparison.xlsx", rows)
    return identifier
