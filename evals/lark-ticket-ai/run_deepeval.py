#!/usr/bin/env python3
"""Run Lark Ticket FE AI Actions through the real browser-session API contract.

The Node child process deliberately imports the FE service module, so this
suite evaluates the same request and SSE parsing path used by the UI.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SUITE_DIR = Path(__file__).resolve().parent
DATA_DIR = SUITE_DIR / "data"
NODE_RUNNER = ROOT / "fe/scripts/run-lark-ticket-ai-eval-case.mjs"


@dataclass(frozen=True)
class Expected:
    must_include: tuple[str, ...]
    must_not_include: tuple[str, ...]
    allowed_tools: tuple[str, ...]
    required_tools: tuple[str, ...]
    max_latency_ms: int | None
    judge_criteria: str | None


@dataclass(frozen=True)
class EvalCase:
    id: str
    enabled: bool
    action_key: str
    ticket: dict[str, str]
    message: str
    expected: Expected


def load_cases(dataset_path: Path) -> list[EvalCase]:
    cases: list[EvalCase] = []
    with dataset_path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        required_columns = {"id", "enabled", "action_key", "base_id", "table_id", "record_id", "message", "must_include", "must_not_include", "allowed_tools", "required_tools", "max_latency_ms", "judge_criteria"}
        if reader.fieldnames is None or not required_columns.issubset(reader.fieldnames):
            raise ValueError(f"{dataset_path} is missing a required eval CSV column.")
        rows = list(reader)

    for row_number, item in enumerate(rows, start=2):
        if not all(isinstance(item.get(key), str) and item[key].strip() for key in ("id", "enabled", "action_key", "base_id", "table_id", "record_id", "message")):
            raise ValueError(f"{dataset_path} row {row_number} is missing a required value.")
        if item["enabled"] not in {"true", "false"}:
            raise ValueError(f"{dataset_path} row {row_number} has invalid enabled value; use true or false.")
        max_latency_ms = parse_optional_int(item["max_latency_ms"], dataset_path, row_number)
        cases.append(EvalCase(
            id=item["id"],
            enabled=item["enabled"] == "true",
            action_key=item["action_key"],
            ticket={"base_id": item["base_id"], "table_id": item["table_id"], "record_id": item["record_id"]},
            message=item["message"],
            expected=Expected(
                must_include=tuple(json_string_list(item["must_include"], dataset_path, row_number, "must_include")),
                must_not_include=tuple(json_string_list(item["must_not_include"], dataset_path, row_number, "must_not_include")),
                allowed_tools=tuple(json_string_list(item["allowed_tools"], dataset_path, row_number, "allowed_tools")),
                required_tools=tuple(json_string_list(item["required_tools"], dataset_path, row_number, "required_tools")),
                max_latency_ms=max_latency_ms,
                judge_criteria=item["judge_criteria"].strip() or None,
            ),
        ))
    return cases


def json_string_list(value: str, dataset_path: Path, row_number: int, column: str) -> list[str]:
    try:
        result = json.loads(value or "[]")
    except json.JSONDecodeError as error:
        raise ValueError(f"{dataset_path} row {row_number} has invalid JSON in {column}.") from error
    if not isinstance(result, list) or not all(isinstance(entry, str) and entry for entry in result):
        raise ValueError(f"{dataset_path} row {row_number} column {column} must be a JSON array of non-empty strings.")
    return result


def parse_optional_int(value: str, dataset_path: Path, row_number: int) -> int | None:
    if not value.strip():
        return None
    try:
        parsed = int(value)
    except ValueError as error:
        raise ValueError(f"{dataset_path} row {row_number} max_latency_ms must be an integer.") from error
    if parsed <= 0:
        raise ValueError(f"{dataset_path} row {row_number} max_latency_ms must be greater than zero.")
    return parsed


def run_fe_action(dataset_path: Path, case: EvalCase, allow_disabled: bool) -> dict[str, Any]:
    env = os.environ.copy()
    if allow_disabled:
        env["OCTO_EVAL_ALLOW_DISABLED"] = "1"
    result = subprocess.run(
        ["node", str(NODE_RUNNER), str(dataset_path), case.id],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
        env=env,
    )
    if not result.stdout.strip():
        raise RuntimeError(f"FE eval runner produced no trace for {case.id}: {result.stderr.strip()}")
    trace = json.loads(result.stdout)
    if result.returncode != 0:
        raise RuntimeError(f"FE action failed for {case.id}: {trace.get('errorCode')} {trace.get('errorMessage')}")
    return trace


def evaluate_case(case: EvalCase, trace: dict[str, Any]) -> None:
    from deepeval import evaluate
    from deepeval.metrics import BaseMetric, GEval
    from deepeval.test_case import LLMTestCase, SingleTurnParams, ToolCall

    class ContractMetric(BaseMetric):
        def __init__(self, expected: Expected):
            self.expected = expected
            self.threshold = 1.0
            self.include_reason = True
            self.evaluation_model = "deterministic"

        @property
        def __name__(self) -> str:
            return "Output contract"

        def measure(self, test_case: LLMTestCase) -> float:
            output = test_case.actual_output or ""
            failures = [f"missing required text: {text}" for text in self.expected.must_include if text not in output]
            failures.extend(f"contains prohibited text: {text}" for text in self.expected.must_not_include if text in output)
            self.score = 0.0 if failures else 1.0
            self.reason = "; ".join(failures) if failures else "Output contract passed."
            self.success = self.is_successful()
            return self.score

        async def a_measure(self, test_case: LLMTestCase) -> float:
            return self.measure(test_case)

    class ToolPolicyMetric(BaseMetric):
        def __init__(self, expected: Expected):
            self.expected = expected
            self.threshold = 1.0
            self.include_reason = True
            self.evaluation_model = "deterministic"

        @property
        def __name__(self) -> str:
            return "Tool policy"

        def measure(self, test_case: LLMTestCase) -> float:
            actual = [tool.name for tool in (test_case.tools_called or [])]
            failures = [f"missing required tool: {tool}" for tool in self.expected.required_tools if tool not in actual]
            if self.expected.allowed_tools:
                failures.extend(f"tool outside allowlist: {tool}" for tool in actual if tool not in self.expected.allowed_tools)
            self.score = 0.0 if failures else 1.0
            self.reason = "; ".join(failures) if failures else "Tool policy passed."
            self.success = self.is_successful()
            return self.score

        async def a_measure(self, test_case: LLMTestCase) -> float:
            return self.measure(test_case)

    metrics: list[BaseMetric] = [ContractMetric(case.expected), ToolPolicyMetric(case.expected)]
    if os.getenv("OCTO_EVAL_ENABLE_LLM_JUDGE") == "1" and case.expected.judge_criteria:
        metrics.append(GEval(
            name="Ticket AI quality",
            criteria=case.expected.judge_criteria,
            evaluation_params=[SingleTurnParams.INPUT, SingleTurnParams.ACTUAL_OUTPUT],
            threshold=0.7,
        ))
    test_case = LLMTestCase(
        input=case.message,
        actual_output=trace["output"],
        tools_called=[ToolCall(name=tool["title"]) for tool in trace["toolCalls"]],
    )
    evaluate(test_cases=[test_case], metrics=metrics)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", choices=("happy-path", "badcases", "all"), default="all")
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--include-disabled", action="store_true", help="required before any fixture is executed")
    args = parser.parse_args()

    dataset_paths = {
        "happy-path": DATA_DIR / "eval-dataset.csv",
        "badcases": DATA_DIR / "badcase-dataset.csv",
    }
    paths = list(dataset_paths.values()) if args.dataset == "all" else [dataset_paths[args.dataset]]
    all_cases = [(path, case) for path in paths for case in load_cases(path)]
    print(f"Validated {len(all_cases)} eval cases from {len(paths)} dataset(s).")
    if args.validate_only:
        return 0

    selected = [(path, case) for path, case in all_cases if case.enabled or args.include_disabled]
    if not selected:
        print("No enabled cases. Configure isolated Ticket fixtures, set enabled=true, then rerun with --include-disabled.")
        return 0

    for dataset_path, case in selected:
        trace = run_fe_action(dataset_path, case, args.include_disabled)
        if case.expected.max_latency_ms is not None and trace["latencyMs"] > case.expected.max_latency_ms:
            raise RuntimeError(f"{case.id} exceeded latency budget: {trace['latencyMs']}ms > {case.expected.max_latency_ms}ms")
        evaluate_case(case, trace)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # keeps secrets out of the traceback by construction
        print(f"Lark Ticket AI eval failed: {error}", file=sys.stderr)
        raise SystemExit(1)
