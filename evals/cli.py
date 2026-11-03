"""Run from repository root: python -m evals.cli --help."""
import argparse
import json
import sys
from pathlib import Path
from .core.storage import DEFAULT_ARTIFACTS, read_json
from .core.bridge import bridge


def main(argv=None):
    parser = argparse.ArgumentParser(description="Ticket offline evaluation: Excel → frozen cases → server → DeepEval")
    parser.add_argument("--artifacts", type=Path, default=DEFAULT_ARTIFACTS)
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser("export"); export.add_argument("--config", required=True)
    imp = commands.add_parser("import"); imp.add_argument("--excel", required=True); imp.add_argument("--export"); imp.add_argument("--validate-only", action="store_true")
    run = commands.add_parser("run"); run.add_argument("--dataset"); run.add_argument("--scenario"); run.add_argument("--config"); run.add_argument("--resume")
    score = commands.add_parser("score"); score.add_argument("--run", required=True); score.add_argument("--config", required=True)
    report = commands.add_parser("report"); report.add_argument("--run", required=True); report.add_argument("--score")
    compare = commands.add_parser("compare"); compare.add_argument("--baseline", required=True); compare.add_argument("--candidate", required=True)
    compare.add_argument("--baseline-score"); compare.add_argument("--candidate-score")
    args = parser.parse_args(argv); root = args.artifacts.resolve()
    if args.command == "export":
        from .core.dataset import export_dataset
        config = read_json(args.config)
        if set(config) != {"sourceLabel", "baseId", "tableId", "limit"} or not isinstance(config["sourceLabel"], str) or not config["sourceLabel"].strip():
            raise ValueError("Export config requires sourceLabel/baseId/tableId/limit only")
        exported = bridge("export", {k: config[k] for k in ("baseId", "tableId", "limit")})
        result = {"export_id": export_dataset(root, exported["tickets"], config["sourceLabel"], exported["prompts"])}
    elif args.command == "import":
        from .core.dataset import import_dataset
        result = import_dataset(root, args.excel, args.export, args.validate_only)
    elif args.command == "run":
        from .core.runner import create_run, run_cases
        if args.resume:
            if args.dataset or args.scenario or args.config: raise ValueError("--resume cannot change dataset/scenario/config")
            run_id = args.resume
        else:
            if not all((args.dataset, args.scenario, args.config)): raise ValueError("run requires --dataset --scenario --config")
            run_id = create_run(root, args.dataset, args.scenario, read_json(args.config))
        print(json.dumps({"run_id": run_id, "state": "starting"}), flush=True)
        result = {"run_id": run_cases(root, run_id)}
    elif args.command == "score":
        from .core.evaluator import score_run
        result = {"score_id": score_run(root, args.run, read_json(args.config))}
    elif args.command == "report":
        from .core.report import report_run
        result = {"report": report_run(root, args.run, args.score)}
    else:
        from .core.report import compare_runs
        result = {"comparison_id": compare_runs(root, args.baseline, args.candidate, args.baseline_score, args.candidate_score)}
    print(json.dumps({**result, "artifacts": str(root)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ValueError as error:
        print(str(error), file=sys.stderr); sys.exit(1)
    except (OSError, KeyError, TypeError):
        print("EVAL_INPUT_OR_STORAGE_ERROR: check file paths and documented schema", file=sys.stderr); sys.exit(1)
