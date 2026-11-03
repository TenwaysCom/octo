"""Synthetic checks for the historical-reference comparison, no platform calls."""
from html.parser import HTMLParser
from pathlib import Path
import tempfile
import unittest

import compare_shadow
import dataset


HISTORICAL = '''## Shadow AI 完整分析记录(参考,非证据)
### 元数据
- status: `ok`
- analyzedAt: 2026-10-22T00:00:00Z
- promptKey / promptVersion: `example` / `v4`
- snapshotVersion: 3
### 分析总览
Later resolution must remain only a historical reference.
### Intent
- intentType / intentSubtype: `troubleshoot` / `data_inconsistency`
- confidence: 0.8
- summary: Original request, not the result summary.
- keywords: example
### Result
- summary: DO NOT READ THIS AS THE QUESTION
'''


class HistoricalComparisonTests(unittest.TestCase):
    def test_extracts_actual_fields_without_result_summary_or_fake_question(self):
        result = compare_shadow.historical_shadow(HISTORICAL)
        self.assertEqual(result['intent_type'], 'troubleshoot')
        self.assertEqual(result['intent_subtype'], 'data_inconsistency')
        self.assertEqual(result['intent_summary'], 'Original request, not the result summary.')
        self.assertEqual(result['overall_summary'], 'Later resolution must remain only a historical reference.')
        self.assertIsNone(result['standalone_question_field'])
        self.assertFalse(result['usable_as_model_input'])
        self.assertFalse(result['usable_as_gold'])

    def test_missing_shadow_does_not_use_ticket_fields_as_fallback(self):
        result = compare_shadow.historical_shadow('intent_type: service_request\nquestion: manual title\n## 线程消息\nText')
        self.assertEqual(result['availability'], 'missing')
        self.assertIsNone(result['intent_summary'])
        self.assertIsNone(result['intent_type'])

    def test_historical_panel_is_collapsed_and_text_is_escaped(self):
        candidate = {'state': {'main_request': '<script>current</script>'}, 'expected': {
            'action': 'wait', 'rationale': 'Waiting', 'evidence_ids': ['M1'],
            'blocking_conditions': ['Pending'], 'resume_conditions': ['Reply'],
            'next_question': None, 'answer_boundary': None}}
        row = {'id': 'S10-001', 'ticket': '1', 'split': 'development',
               'first10_candidate': candidate,
               'first10_input': {'window_start': 'start', 'decision_at': 'end', 'messages': []},
               'historical_shadow_reference': compare_shadow.historical_shadow(HISTORICAL)}
        page = compare_shadow.comparison_page([row])
        class Check(HTMLParser):
            def __init__(self):super().__init__();self.history=[];self.scripts=0
            def handle_starttag(self, tag, attrs):
                values = dict(attrs)
                if tag == 'details' and values.get('class') == 'history':self.history.append(values)
                if tag == 'script':self.scripts += 1
        parsed = Check();parsed.feed(page)
        self.assertEqual(len(parsed.history), 1)
        self.assertNotIn('open', parsed.history[0])
        self.assertEqual(parsed.scripts, 0)
        self.assertIn('&lt;script&gt;current&lt;/script&gt;', page)

    def test_frozen_artifact_tampering_is_rejected(self):
        with tempfile.TemporaryDirectory() as name:
            base = Path(name)
            path = base / 'model-inputs.private.jsonl'
            path.write_text('frozen input\n')
            manifest = {'extractor_sha256': dataset.sha(Path(dataset.__file__).read_bytes()),
                        'hashes': {path.name: dataset.sha(path.read_bytes())}}
            compare_shadow.verify_frozen(base, manifest)
            path.write_text('modified input\n')
            with self.assertRaisesRegex(AssertionError, 'Frozen v1 artifact changed'):
                compare_shadow.verify_frozen(base, manifest)


if __name__ == '__main__':
    unittest.main()
