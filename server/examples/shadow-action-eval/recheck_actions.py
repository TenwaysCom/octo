"""Assemble case-by-case AI rechecks; preserve frozen inputs and prior outputs.

The private notes are authored by reading each frozen ten-minute window. This
script validates and packages those judgments; it does not infer semantic labels
from keywords, call a model, or use historical Shadow text to classify a case.
"""
import argparse
import collections
import copy
import csv
from datetime import datetime, timezone
import html
import json
from pathlib import Path

import compare_shadow
import dataset

CRITERIA = dataset.REPO / 'docs/tasks/ai-ticket/shadow-first10-v2/classification-criteria.json'
BASE = dataset.PRIVATE / 'shadow-first10-v1'
OLD_COMPARISON = dataset.PRIVATE / 'shadow-first10-v1-comparison'
MANIFEST = dataset.REPO / 'docs/tasks/ai-ticket/shadow-first10-v1/verification.json'
COMPARISON_MANIFEST = dataset.REPO / 'docs/tasks/ai-ticket/shadow-first10-v1/comparison-verification.json'


def verify_comparison(root, manifest):
    for name, checksum in manifest['files'].items():
        assert Path(name).name == name
        assert dataset.sha((root / name).read_bytes()) == checksum, 'Previous comparison changed: ' + name


def make_recheck(case, previous, note, criteria):
    num, action, rule_id, evidence_text, rationale, boundary = note.split('|')
    assert case['id'] == previous['id'] == f'S10-{int(num):03}'
    rule = next(r for r in criteria['rules'] if r['id'] == rule_id)
    assert rule['action'] == action
    messages = {m['id']: m for m in case['input']['messages']}
    evidence_ids = evidence_text.split(',')
    assert len(evidence_ids) == len(set(evidence_ids)) and set(evidence_ids) <= messages.keys()
    revised = copy.deepcopy(previous)
    expected, state = revised['expected'], revised['state']
    old_expected = previous['expected']
    expected.update({'action': action, 'rationale': rationale, 'evidence_ids': evidence_ids})
    if action == 'human':
        state['gap_type'] = {'H01': 'investigation', 'H02': 'authority', 'H03': 'knowledge'}[rule_id]
    if action != 'wait':
        expected['waiting_for'] = None
    if action != 'answer':
        expected['answer_boundary'] = None
    if action != 'clarify':
        expected['next_question'] = None
        expected['clarification_kind'] = None
    else:
        expected['clarification_kind'] = 'main_problem' if rule_id == 'Q01' else 'prerequisite'
    if int(num) in (68, 93, 104):
        state['main_problem_clarity'], state['gap_type'] = 'clear', 'prerequisite'
    if int(num) == 93:
        expected['next_question'] = '请提供审批流程名称和需要调整的节点；移除和新增的人员已在消息里，无需重复提供。'
        state['missing_or_blocking'] = [{'description': '缺具体审批流程和节点，人员变更目标已明确', 'evidence_ids': ['M1']}]
        expected['blocking_conditions'] = ['具体审批流程与节点尚未提供']
        expected['resume_conditions'] = ['用户提供流程名称和节点后重新判断']
    if int(num) == 43:
        expected['waiting_for'] = 'no_open_request'
        expected['blocking_conditions'] = ['当前没有新待答诉求；Done仅为处理方报告，未独立验证账实']
        expected['resume_conditions'] = ['用户补充仍有异常、纠正或新的明确请求时重新判断']
        state['missing_or_blocking'] = [{'description': expected['blocking_conditions'][0], 'evidence_ids': ['M3']}]
    changes = {
        1: ('investigation', '推仓后实际发送与前台sending状态不一致，需人工核对',
            '发送成功观察与前台状态矛盾尚未核验，权限仅是猜测',
            '人工明确接手发送与状态链路核对，或提供新的核查事实后重新判断'),
        14: ('investigation', '流程未开始却显示to be sent，需要核验并处理状态重置',
             '只提出bug需求，尚无接手排查或修复证据',
             '出现明确接手、排查计划或修复验证结果时重新判断'),
        19: ('authority', '新增退回仓库、迁移库位及确认是否加地区前缀',
             '仓库命名与迁移方案待业务及配置负责人决定，尚未接手',
             '负责人明确决定命名、接手配置或提出必要业务确认后重新判断'),
        83: ('prerequisite', '交付数量显示1，核实是否异常及是否与此前源库位有关',
             '缺实际发货数量与预期Delivered数量，尚不能确认存在何种差异',
             '用户补充实际与期望数量后重新判断'),
        116: ('investigation', 'UK SKU在EU销售单仍无法选择，需要核对清单准确性及配置限制',
              '有清单但准确性与SKU可选限制未核验，没有明确核查承诺',
              '人工接手核对清单有效性及SKU限制，或提供核查结果后重新判断'),
        117: ('investigation', '定位库存调整凭证来源单据，并核对valuation具体查找及账号可见性',
              '具体来源单据与账号可见性仍未核实，已有泛化指引不足以覆盖请求',
              '人工接手来源单据和valuation可见性核查，或提供核查结果后重新判断'),
    }
    if int(num) in changes:
        gap, request, blocker, resume = changes[int(num)]
        state.update({'gap_type': gap, 'main_problem_clarity': 'clear', 'main_request': request,
                      'missing_or_blocking': [{'description': blocker, 'evidence_ids': evidence_ids}]})
        expected['blocking_conditions'], expected['resume_conditions'] = [blocker], [resume]
    if int(num) == 83:
        expected['next_question'] = '这张单实际发货多少，预期Delivered应该显示多少？'
    if int(num) == 19:
        state['question_history'] = [{'question': '新增仓库编码是否需要地区前缀', 'status': 'pending',
                                     'evidence_ids': ['M3'], 'answer_evidence_ids': []}]
    if int(num) == 116:
        state['question_history'] = [
            {'question': 'SKU清单是否正确', 'status': 'partially_answered', 'evidence_ids': ['M4'], 'answer_evidence_ids': ['M6']},
            {'question': '是否有SKU清单', 'status': 'answered_before_asked', 'evidence_ids': ['M6'], 'answer_evidence_ids': ['M2']},
        ]
    if int(num) == 113:
        state['main_request'] = '服务单访问异常：已报编号临时处理，另一用户待定位，并等待组件修复与历史数据处理'
        expected['blocking_conditions'] = ['另一位用户未提供服务单编号；组件和历史数据处理仍待人工兑现']
        expected['resume_conditions'] = ['另一位用户提供自己的单号、首位用户报告仍不可访问，或人工返回组件与历史数据处理结果时重新判断']
        state['missing_or_blocking'] = [{'description': expected['blocking_conditions'][0], 'evidence_ids': ['M1', 'M2', 'M5']}]
    revised['review'] = {'status': 'ai_rechecked', 'reviewer': None, 'reviewed_at': None,
                         'source': 'current_assistant_case_by_case_first10_recheck', 'gold_eligible': False,
                         'criteria_version': criteria['version']}
    basis = {'criteria_version': criteria['version'], 'criterion_id': rule_id, 'criterion_title': rule['title'],
             'previous_action': old_expected['action'], 'rechecked_action': action,
             'action_changed': old_expected['action'] != action,
             'clarity_before': previous['state']['main_problem_clarity'], 'clarity_after': state['main_problem_clarity'],
             'gap_before': previous['state']['gap_type'], 'gap_after': state['gap_type'],
             'current_request': state['main_request'], 'classification_rationale': rationale,
             'human_wait_boundary': boundary,
             'waiting_for_before': old_expected['waiting_for'], 'waiting_for_after': expected['waiting_for'],
             'evidence': [{'message_id': mid, 'speaker': messages[mid]['speaker'], 'at': messages[mid]['at'],
                           'quote': messages[mid]['text'][:420], 'quote_truncated': len(messages[mid]['text']) > 420} for mid in evidence_ids],
             'review_status': 'ai_rechecked', 'gold_eligible': False,
             'decision_evidence_scope': 'frozen_first10_messages_only', 'historical_shadow_used_for_classification': False}
    return revised, basis


def basis_html(basis, rule):
    esc = lambda value: html.escape(str(value))
    badge = '改判建议' if basis['action_changed'] else '保留分类'
    result = '<section class="recheck-basis"><h3>逐条分类依据 · ' + badge + '</h3><p><b>原 → 复核：</b>' + esc(basis['previous_action'] + ' → ' + basis['rechecked_action']) + '</p><p><b>适用标准：</b>' + esc(rule['id'] + ' ' + rule['title']) + '</p><p>' + esc(rule['standard']) + '</p><p><b>本例为何符合：</b>' + esc(basis['classification_rationale']) + '</p><p><b>human / wait边界：</b>' + esc(basis['human_wait_boundary']) + '</p>'
    if basis['clarity_before'] != basis['clarity_after'] or basis['gap_before'] != basis['gap_after']:
        result += '<p><b>问题状态修订：</b>' + esc(basis['clarity_before'] + '/' + basis['gap_before'] + ' → ' + basis['clarity_after'] + '/' + basis['gap_after']) + '</p>'
    if basis['waiting_for_before'] != basis['waiting_for_after']:
        result += '<p><b>等待对象修订：</b>' + esc(str(basis['waiting_for_before']) + ' → ' + str(basis['waiting_for_after'])) + '</p>'
    result += '<details><summary>分类证据原句（仅前十分钟）</summary>'
    for evidence in basis['evidence']:
        result += '<p><b>' + esc(evidence['message_id'] + ' ' + evidence['speaker'] + ' ' + evidence['at']) + '</b></p><pre>' + esc(evidence['quote']) + ('\n（长消息摘录，完整内容见本条原消息）' if evidence['quote_truncated'] else '') + '</pre>'
    return result + '</details></section>'


def render_page(rows, criteria):
    # Extend the established comparison surface without changing its frozen v1
    # renderer or artifacts. Assert every insertion point to reject template drift.
    page = compare_shadow.comparison_page(rows)
    fragments = page.split('<article id="')
    assert len(fragments) == len(rows) + 1
    header = fragments[0]
    header = header.replace('<title>Shadow原分析与前十分钟动作对照</title>', '<title>120例分类复核：逐条依据与历史对照</title>')
    counts = collections.Counter(r['first10_candidate']['expected']['action'] for r in rows)
    changed = [r for r in rows if r['classification_recheck']['action_changed']]
    header += '<style>.recheck-basis{background:#eaf4ff;margin:18px 0;border:1px solid #b5cce8}.controls{position:sticky;top:0;z-index:1;background:#fff;padding:12px;border-bottom:1px solid #bbb;display:flex;gap:16px;flex-wrap:wrap}.changes a{margin-right:14px}article[hidden]{display:none}.count{font-weight:650}</style><h2>2026-10-23 逐条AI复核</h2><p class="count">' + html.escape('；'.join(action + ' ' + str(counts[action]) for action in ('answer', 'clarify', 'human', 'wait'))) + '；改判建议 ' + str(len(changed)) + ' 条。仍待人工审核，gold=0。</p><details><summary>本次分类标准</summary><dl>'
    for rule in criteria['rules']:
        header += '<dt>' + html.escape(rule['id'] + ' / ' + rule['action'] + ' / ' + rule['title']) + '</dt><dd>' + html.escape(rule['standard']) + '</dd>'
    header += '</dl></details><p class="changes">改判定位：' + ''.join('<a href="#' + r['id'] + '">' + r['id'] + ' ' + r['classification_recheck']['previous_action'] + '→' + r['classification_recheck']['rechecked_action'] + '</a>' for r in changed) + '</p><div class="controls"><label>分类 <select id="action-filter"><option value="">全部</option><option>human</option><option>wait</option><option>clarify</option><option>answer</option></select></label><label><input id="changed-filter" type="checkbox">仅看改判</label><label>编号 / Ticket <input id="case-filter" type="search"></label><span id="visible-count"></span></div>'
    result = [header]
    rules = {r['id']: r for r in criteria['rules']}
    for row, fragment in zip(rows, fragments[1:]):
        assert fragment.startswith(row['id'] + '"') and fragment.count('<div class="grid">') == 1
        basis = row['classification_recheck']
        fragment = fragment.replace('<div class="grid">', basis_html(basis, rules[basis['criterion_id']]) + '<div class="grid">', 1)
        attrs = ' data-action="' + basis['rechecked_action'] + '" data-changed="' + str(basis['action_changed']).lower() + '" data-search="' + row['id'] + ' ' + row['ticket'] + '"'
        fragment = fragment.replace(row['id'] + '"', row['id'] + '"' + attrs, 1)
        result.append('<article id="' + fragment)
    result.append('''<script>(()=>{const cards=[...document.querySelectorAll('article[data-action]')];const action=document.getElementById('action-filter');const changed=document.getElementById('changed-filter');const query=document.getElementById('case-filter');function filter(){let count=0;const term=query.value.trim().toLowerCase();for(const card of cards){card.hidden=!!((action.value&&card.dataset.action!==action.value)||(changed.checked&&card.dataset.changed!=='true')||(term&&!card.dataset.search.toLowerCase().includes(term)));if(!card.hidden)count++;}document.getElementById('visible-count').textContent=count+' / '+cards.length+'条';}for(const node of [action,changed,query])node.addEventListener('input',filter);document.querySelectorAll('.changes a').forEach(link=>link.addEventListener('click',()=>{action.value='';changed.checked=false;query.value='';filter();}));filter();})();</script>''')
    return ''.join(result)


def build(args):
    manifest = json.loads(MANIFEST.read_text())
    old_comparison_manifest = json.loads(COMPARISON_MANIFEST.read_text())
    compare_shadow.verify_frozen(BASE, manifest)
    verify_comparison(OLD_COMPARISON, old_comparison_manifest)
    cases = dataset.read_rows(BASE / 'cases.private.jsonl')
    labels = dataset.read_rows(BASE / 'labels.ai-draft.private.jsonl')
    criteria = json.loads(CRITERIA.read_text())
    notes = (args.out / 'recheck-notes.private.psv').read_text().splitlines()
    assert len(cases) == len(labels) == len(notes) == 120
    revised, bases = [], []
    # All decisions are assembled before historical references are even loaded.
    for case, prior, note in zip(cases, labels, notes):
        candidate, basis = make_recheck(case, prior, note, criteria)
        revised.append(candidate)
        bases.append(basis)
    dataset.write_rows(args.out / 'labels.ai-rechecked.private.jsonl', revised)
    dataset.write_rows(args.out / 'classification-basis.private.jsonl', [{'id': c['id'], **b} for c, b in zip(cases, bases)])
    old_rows = dataset.read_rows(OLD_COMPARISON / 'comparison.private.jsonl')
    assert [r['id'] for r in old_rows] == [r['id'] for r in cases]
    rows = []
    for old, case, prior, candidate, basis in zip(old_rows, cases, labels, revised, bases):
        assert old['first10_input'] == case['input'] and old['first10_candidate'] == prior
        row = copy.deepcopy(old)
        row.update({'previous_first10_candidate': prior, 'first10_candidate': candidate,
                    'classification_recheck': basis})
        rows.append(row)
    dataset.write_rows(args.out / 'comparison.private.jsonl', rows)
    dataset.write(args.out / 'comparison.private.html', render_page(rows, criteria))
    fields = ['id', 'ticket', 'split', 'previous_action', 'rechecked_action', 'action_changed',
              'criterion_id', 'criterion_title', 'current_request', 'classification_rationale', 'human_wait_boundary',
              'clarity_before', 'clarity_after', 'gap_before', 'gap_after', 'waiting_for_before', 'waiting_for_after',
              'evidence_json', 'blocking_conditions', 'resume_conditions', 'first10_messages',
              'original_intent', 'original_intent_summary', 'original_overall_summary',
              'rechecked_label_json', 'human_review_status', 'reviewer', 'reviewed_at', 'adjudication_notes']
    with (args.out / 'comparison.private.csv').open('x', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            b, expected = row['classification_recheck'], row['first10_candidate']['expected']
            value = {k: row[k] for k in ('id', 'ticket', 'split')}
            value.update({k: b[k] for k in fields if k in b})
            value.update({'evidence_json': dataset.canonical(b['evidence']),
                          'blocking_conditions': dataset.canonical(expected['blocking_conditions']),
                          'resume_conditions': dataset.canonical(expected['resume_conditions']),
                          'first10_messages': '\n\n'.join(m['id'] + ' ' + m['at'] + ' ' + m['speaker'] + '\n' + m['text'] for m in row['first10_input']['messages']),
                          'original_intent': row['historical_shadow_reference']['intent_type'],
                          'original_intent_summary': row['historical_shadow_reference']['intent_summary'],
                          'original_overall_summary': row['historical_shadow_reference']['overall_summary'],
                          'rechecked_label_json': dataset.canonical(row['first10_candidate']), 'human_review_status': 'pending'})
            writer.writerow(value)
    (args.out / 'comparison.private.csv').chmod(0o600)
    validate(rows, criteria, args.out)
    compare_shadow.verify_frozen(BASE, manifest)
    verify_comparison(OLD_COMPARISON, old_comparison_manifest)
    transitions = collections.Counter(b['previous_action'] + '->' + b['rechecked_action'] for b in bases)
    report = {'schema_version': 'shadow-first10-ai-recheck-v2', 'created_at': datetime.now(timezone.utc).isoformat(),
              'criteria_version': criteria['version'], 'cases': len(rows),
              'actions_before': dict(collections.Counter(c['expected']['action'] for c in labels)),
              'actions_after': dict(collections.Counter(c['expected']['action'] for c in revised)),
              'transitions': dict(transitions), 'action_changed_case_ids': [r['id'] for r in rows if r['classification_recheck']['action_changed']],
              'problem_state_changed_case_ids': [r['id'] for r in rows if r['classification_recheck']['clarity_before'] != r['classification_recheck']['clarity_after'] or r['classification_recheck']['gap_before'] != r['classification_recheck']['gap_after']],
              'waiting_target_changed_without_action_change': [r['id'] for r in rows if not r['classification_recheck']['action_changed'] and r['classification_recheck']['waiting_for_before'] != r['classification_recheck']['waiting_for_after']],
              'rules_coverage': dict(collections.Counter(b['criterion_id'] for b in bases)),
              'gold_cases': 0, 'external_model_calls': 0, 'historical_shadow_used_for_classification': False,
              'v1_artifacts_unchanged': True, 'previous_comparison_artifacts_unchanged': True,
              'criteria_sha256': dataset.sha(CRITERIA.read_bytes()), 'script_sha256': dataset.sha(Path(__file__).read_bytes()),
              'v1_manifest_sha256': dataset.sha(MANIFEST.read_bytes()), 'old_comparison_manifest_sha256': dataset.sha(COMPARISON_MANIFEST.read_bytes()),
              'files': {p.name: dataset.sha(p.read_bytes()) for p in sorted(args.out.iterdir()) if p.is_file()}}
    if args.report:
        with args.report.open('x') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
            f.write('\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'files'}, ensure_ascii=False))


def validate(rows, criteria, root):
    assert len(rows) == 120 and len({r['id'] for r in rows}) == 120
    rule_actions = {r['id']: r['action'] for r in criteria['rules']}
    for row in rows:
        basis, label = row['classification_recheck'], row['first10_candidate']
        expected = label['expected']
        messages = {m['id']: m for m in row['first10_input']['messages']}
        assert row['input_sha256'] == dataset.sha(dataset.canonical(row['first10_input']))
        assert expected['action'] == basis['rechecked_action'] == rule_actions[basis['criterion_id']]
        assert set(expected['evidence_ids']) <= messages.keys()
        assert expected['rationale'] == basis['classification_rationale']
        assert basis['historical_shadow_used_for_classification'] is False and label['review']['gold_eligible'] is False
        for evidence in basis['evidence']:
            assert evidence['quote'] and evidence['quote'] in messages[evidence['message_id']]['text']
        assert bool(expected['next_question']) == (expected['action'] == 'clarify')
        assert bool(expected['waiting_for']) == (expected['action'] == 'wait')
        assert bool(expected['answer_boundary']) == (expected['action'] == 'answer')
        assert expected['blocking_conditions'] and expected['resume_conditions']
        if basis['criterion_id'] == 'W04':
            assert expected['waiting_for'] == 'no_open_request'
        if expected['action'] == 'clarify':
            assert expected['clarification_kind'] == ('main_problem' if basis['criterion_id'] == 'Q01' else 'prerequisite')
        evidence_groups = [m['evidence_ids'] for m in label['state']['missing_or_blocking']]
        evidence_groups += [c['evidence_ids'] for c in label['state']['corrections_and_updates']]
        for question in label['state']['question_history']:
            evidence_groups.extend([question['evidence_ids'], question['answer_evidence_ids']])
        assert all(set(group) <= messages.keys() for group in evidence_groups)
    with (root / 'comparison.private.csv').open(encoding='utf-8-sig', newline='') as f:
        csv_rows = list(csv.DictReader(f))
    assert [r['id'] for r in csv_rows] == [r['id'] for r in rows]
    assert all(json.loads(line['rechecked_label_json']) == row['first10_candidate'] for line, row in zip(csv_rows, rows))
    assert all(line['human_review_status'] == 'pending' and not line['reviewer'] and not line['reviewed_at'] for line in csv_rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True, help='Private directory containing only authored recheck-notes.private.psv.')
    parser.add_argument('--report', type=Path, help='New safe count/hash report path.')
    args = parser.parse_args()
    args.out = args.out.resolve()
    if not args.out.is_relative_to(dataset.PRIVATE.resolve()) or args.out in (dataset.PRIVATE.resolve(), BASE.resolve(), OLD_COMPARISON.resolve()):
        raise SystemExit('Use a distinct directory under the existing private artifacts root.')
    assert sorted(p.name for p in args.out.iterdir()) == ['recheck-notes.private.psv'], 'Refuse to overwrite an existing recheck build'
    assert args.out.stat().st_mode & 0o777 == 0o700
    build(args)


if __name__ == '__main__':
    main()
