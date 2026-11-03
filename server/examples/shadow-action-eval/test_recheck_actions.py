"""Packaging invariants for AI-authored rechecks, not tests of label semantics."""
import copy
from html.parser import HTMLParser
import json
import unittest

import compare_shadow
import recheck_actions


def fixture(number, action='human'):
    case_id = f'S10-{number:03}'
    case = {'id': case_id, 'ticket': str(number), 'split': 'development', 'input': {
        'window_start': '2026-01-01T00:00:00Z', 'decision_at': '2026-01-01T00:10:00Z',
        'messages': [{'id': f'M{i}', 'speaker': f'用户 {i}', 'at': f'2026-01-01T00:0{i}:00Z', 'text': f'Message {i} <script>untrusted</script>'} for i in range(1, 7)]}}
    label = {'id': case_id, 'split': 'development', 'state': {
        'main_request': 'Synthetic request', 'main_problem_clarity': 'clear', 'gap_type': 'investigation',
        'question_history': [], 'corrections_and_updates': [],
        'missing_or_blocking': [{'description': 'Unknown', 'evidence_ids': ['M1']}]},
        'expected': {'action': action, 'rationale': 'Previous rationale', 'evidence_ids': ['M1'],
                     'blocking_conditions': ['Old blocker'], 'resume_conditions': ['New facts'],
                     'next_question': None, 'waiting_for': 'requester' if action == 'wait' else None,
                     'clarification_kind': None, 'answer_boundary': 'Limited answer' if action == 'answer' else None,
                     'must_not': []}, 'review': {'status': 'ai_draft', 'gold_eligible': False}}
    return case, label


class RecheckPackagingTests(unittest.TestCase):
    def setUp(self):
        self.criteria = json.loads(recheck_actions.CRITERIA.read_text())

    def test_answer_to_human_clears_answer_and_preserves_previous_snapshot(self):
        case, previous = fixture(116, 'answer')
        frozen = copy.deepcopy(previous)
        note = '116|human|H01|M1,M2,M4,M6|Needs verification, not just a list pointer.|No accepted investigation.'
        revised, basis = recheck_actions.make_recheck(case, previous, note, self.criteria)
        self.assertEqual(previous, frozen)
        self.assertEqual(revised['expected']['action'], 'human')
        self.assertIsNone(revised['expected']['answer_boundary'])
        self.assertIsNone(revised['expected']['waiting_for'])
        self.assertTrue(basis['action_changed'])
        self.assertFalse(revised['review']['gold_eligible'])

    def test_human_to_clarify_adds_specific_question_and_evidence_is_quoted(self):
        case, previous = fixture(83)
        revised, basis = recheck_actions.make_recheck(case, previous, '083|clarify|Q02|M1|Missing expected quantity.|No investigation yet.', self.criteria)
        self.assertEqual(revised['expected']['clarification_kind'], 'prerequisite')
        self.assertTrue(revised['expected']['next_question'])
        self.assertEqual(basis['evidence'][0]['quote'], case['input']['messages'][0]['text'])

    def test_unclear_problem_can_be_corrected_to_missing_prerequisite_without_changing_action(self):
        case, previous = fixture(104, 'clarify')
        previous['state'].update({'main_problem_clarity': 'unclear', 'gap_type': 'main_problem'})
        previous['expected'].update({'next_question': 'Which field?', 'clarification_kind': 'main_problem'})
        revised, basis = recheck_actions.make_recheck(case, previous, '104|clarify|Q02|M1|Known operation, missing field.|No prior question.', self.criteria)
        self.assertFalse(basis['action_changed'])
        self.assertEqual(revised['state']['main_problem_clarity'], 'clear')
        self.assertEqual(revised['expected']['clarification_kind'], 'prerequisite')

    def test_rule_mismatch_and_unseen_evidence_are_rejected(self):
        case, previous = fixture(1, 'wait')
        with self.assertRaises(AssertionError):
            recheck_actions.make_recheck(case, previous, '001|wait|H01|M1|Mismatch.|Boundary.', self.criteria)
        with self.assertRaises(AssertionError):
            recheck_actions.make_recheck(case, previous, '001|human|H01|M99|Unknown evidence.|Boundary.', self.criteria)

    def test_comparison_keeps_basis_visible_history_collapsed_and_text_escaped(self):
        case, previous = fixture(1, 'wait')
        revised, basis = recheck_actions.make_recheck(case, previous, '001|human|H01|M1|<script>unsafe</script>|Request is not acceptance.', self.criteria)
        row = {'id': case['id'], 'ticket': case['ticket'], 'split': case['split'],
               'first10_input': case['input'], 'first10_candidate': revised, 'classification_recheck': basis,
               'historical_shadow_reference': compare_shadow.historical_shadow('## Shadow AI\n### 分析总览\nLater result\n### Intent\n- summary: Old request\n')}
        page = recheck_actions.render_page([row], self.criteria)
        class Check(HTMLParser):
            def __init__(self):super().__init__();self.bases=0;self.history=[];self.articles=[];self.external=[]
            def handle_starttag(self, tag, attrs):
                d = dict(attrs)
                if tag == 'section' and d.get('class') == 'recheck-basis':self.bases += 1
                if tag == 'details' and d.get('class') == 'history':self.history.append(d)
                if tag == 'article':self.articles.append(d)
                if d.get('src') or (tag == 'link' and d.get('href')):self.external.append(d)
        check = Check();check.feed(page)
        self.assertEqual(check.bases, 1)
        self.assertNotIn('open', check.history[0])
        self.assertEqual(check.articles[0]['data-action'], 'human')
        self.assertEqual(check.articles[0]['data-changed'], 'true')
        self.assertFalse(check.external)
        self.assertIn('&lt;script&gt;unsafe&lt;/script&gt;', page)
        self.assertNotIn('<script>unsafe</script>', page)


if __name__ == '__main__':
    unittest.main()
