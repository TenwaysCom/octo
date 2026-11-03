"""Real pinned DeepEval machinery, deterministic in-process judge, no API calls."""
import importlib.util
import os
import unittest
os.environ["DEEPEVAL_TELEMETRY_OPT_OUT"] = "YES"


@unittest.skipUnless(importlib.util.find_spec("deepeval"), "install evals/requirements.lock")
class DeepEvalContractTest(unittest.TestCase):
    def test_registered_metrics_execute_using_local_fake_judge(self):
        from deepeval.models import DeepEvalBaseLLM
        from evals.scenarios import SCENARIOS
        class Judge(DeepEvalBaseLLM):
            def load_model(self): return self
            def generate(self, prompt, schema=None, **kwargs):
                return schema(score=8, reason="synthetic judge") if schema else '{"score":8,"reason":"synthetic judge"}'
            async def a_generate(self, *args, **kwargs): return self.generate(*args, **kwargs)
            def get_model_name(self): return "synthetic"
        for scenario in SCENARIOS.values():
            case = {"expected": {"summary": "需要信息", "reply": "请提供报错"}}
            output = {"summary": "需要信息", "answerMarkdown": "请提供报错", "evidence": []}
            tc = scenario.to_test_case(case, [{"messageId": "m1", "createdAt": "t", "senderRole": "user", "text": "报错"}], output)
            for metric in scenario.build_metrics(Judge("synthetic"), .7):
                metric.measure(tc)
                self.assertEqual(metric.score, .8)
                self.assertTrue(metric.is_successful())

    def test_score_adapter_uses_explicit_judge_and_returns_metric_reasons(self):
        from unittest.mock import patch
        from deepeval.models import DeepEvalBaseLLM
        from evals.core.evaluator import deepeval_measure
        from evals.scenarios import SCENARIOS
        class Judge(DeepEvalBaseLLM):
            def load_model(self): return self
            def generate(self, prompt, schema=None, **kwargs):
                return schema(score=8, reason="local adapter")
            async def a_generate(self, *args, **kwargs): return self.generate(*args, **kwargs)
            def get_model_name(self): return "local"
        with patch.dict(os.environ, {"OPENAI_API_KEY": "fake-never-sent"}), patch("deepeval.models.GPTModel", return_value=Judge("local")) as factory:
            metrics = deepeval_measure(SCENARIOS["ticket.early_analysis"], {"expected": {"summary": "x"}},
                      [{"messageId": "m", "createdAt": "t", "senderRole": "user", "text": "x"}], {"summary": "x"}, {"model": "gpt-4.1", "threshold": .7})
            self.assertEqual(factory.call_args.kwargs["base_url"], "https://api.openai.com/v1")
            self.assertTrue(all(m["passed"] and m["reason"] == "local adapter" for m in metrics))
