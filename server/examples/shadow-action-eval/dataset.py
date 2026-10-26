"""Offline first-ten-minute Shadow action dataset preparation. Standard library only.

Never calls a model, database or platform. Customer text is written only beneath
the existing gitignored eval artifacts root. Labels are reviewed separately.
"""
import argparse
import collections
import csv
from datetime import datetime, timedelta, timezone
import hashlib
import html
import json
from pathlib import Path
import re

REPO = Path(__file__).resolve().parents[3]
PRIVATE = REPO / 'evals/lark-ticket-ai/artifacts'
SOURCE = Path('/home/deploy/projects/odoo-eu-guide/docs/llm-wiki/raw/transcripts')
SEED = 'shadow-first10-v1'


def sha(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def stamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def field(text, key):
    match = re.search(r'^' + re.escape(key) + r':\s*([^\n]*)', text, re.M)
    return match[1].strip().strip('\"\'') if match else ''


def write(path, value):
    with path.open('x', encoding='utf-8') as f:
        f.write(value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    path.chmod(0o600)


def read_rows(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def write_rows(path, rows):
    write(path, ''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))


def redact(text):
    # The export is already prepared/redacted; remove remaining direct contacts,
    # mentions, URLs and platform IDs. Preserve business and error terminology.
    text = re.sub(r'https?://[^\s<>]+|lark://[^\s<>]+', '[链接已隐去]', text)
    text = re.sub(r'\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b', '[邮箱已隐去]', text)
    text = re.sub(r'\b(?:om_|ou_|on_)[A-Za-z0-9_]+\b', '[平台ID已隐去]', text)
    text = re.sub(r'\+\d[\d ()-]{7,}\d', '[电话已隐去]', text)
    # Free-text names cannot be distinguished safely from adjacent business
    # words with a capitalized-word regex. Keep them in this private artifact.
    text = re.sub(r'@_user_\d+', '@[成员]', text)
    return text.strip()


def parse(text):
    section = re.search(r'^## 线程消息[^\n]*\n(.*?)(?=^## |\Z)', text, re.M | re.S)
    if not section:
        return [], 'missing_thread'
    declared = re.search(r'[（(](\d+)\s*条', section[0].splitlines()[0])
    body = section[1]
    bullet = re.compile(r'^- \*\*\[([^\]]+)\]\s*(.*?)\*\*\(([^)]*)\):\s*', re.M)
    heading = re.compile(r'^### (\d{4}-\d\d-\d\dT\S+)\s+([^\n]+)\n', re.M)
    matches = list(bullet.finditer(body))
    format_name = 'bullet'
    if not matches:
        matches, format_name = list(heading.finditer(body)), 'heading'
    result = []
    try:
        for i, match in enumerate(matches):
            content = body[match.end():matches[i + 1].start() if i + 1 < len(matches) else len(body)].strip()
            artifact_flag = 'has_artifact: true' in content
            mid = field(content, '- message_id') if format_name == 'heading' else ''
            parent = field(content, '- reply_to') if format_name == 'heading' else ''
            if format_name == 'heading':
                content = re.sub(r'^- (?:message_id|sender_role|has_artifact|reply_to):[^\n]*\n?', '', content, flags=re.M).strip()
            at = stamp(match[1])
            if at.tzinfo is None:
                return [], 'naive_timestamp'
            result.append({'id': f'M{i + 1}', 'at': match[1], 'speaker': match[2].strip(),
                           'text': redact(content), '_source_id': mid, '_parent': parent,
                           'attachments_unavailable': artifact_flag or bool(re.search(r'\[图片\]|\[文件\]|\[视频\]|\[附件\]|\[富文本消息\]|image_key', content)),
                           'source_text_truncated': bool(re.search(r'\[截断\]|…\[截断\]|\[truncated\]', content, re.I))})
    except ValueError:
        return [], 'invalid_timestamp'
    if not result:
        return [], 'no_messages'
    if declared is None or int(declared[1]) != len(result):
        return [], 'message_count_mismatch'
    if any(stamp(a['at']) > stamp(b['at']) for a, b in zip(result, result[1:])):
        return [], 'nonchronological_messages'
    if any(not m['text'] for m in result):
        return [], 'empty_message'
    return result, None


def extract(source):
    variants = collections.defaultdict(list)
    for path in sorted(source.glob('ticket-*.md')):
        text = path.read_text()
        ticket = re.match(r'ticket-(\d+)', path.name)[1]
        variants[ticket].append((field(text, 'ingested'), field(text, 'source_updated_at'), path.name, path, text))
    excluded, pool = collections.Counter(), []
    for ticket, group in sorted(variants.items(), key=lambda p: int(p[0])):
        # Choose the latest export, never fall back to a stale complete variant.
        _, _, _, path, text = max(group)
        if field(text, 'history_complete') != 'true':
            excluded['history_not_complete'] += 1
            continue
        messages, error = parse(text)
        if error:
            excluded[error] += 1
            continue
        start = stamp(messages[0]['at'])
        end = start + timedelta(minutes=10)
        visible = [m for m in messages if stamp(m['at']) <= end]
        if sum(len(m['text']) for m in visible) > 18000:
            excluded['window_above_18000_chars'] += 1
            continue
        source_ids = {m['_source_id']: m['id'] for m in visible if m['_source_id']}
        for m in visible:
            parent = m.pop('_parent')
            m['reply_to'] = source_ids.get(parent, 'outside_window') if parent else None
            m.pop('_source_id')
        body = '\n'.join(m['text'] for m in visible)
        ticket_key = field(text, 'thread_id')
        if not ticket_key:
            excluded['missing_thread_identity'] += 1
            continue
        input_doc = {'window_start': messages[0]['at'], 'decision_at': end.isoformat().replace('+00:00', 'Z'),
                     'messages': visible, 'knowledge': [], 'evidence_scope': 'thread_only',
                     'history_complete_in_export': True, 'historical_edits_verified': False,
                     'speaker_business_roles': 'unknown', 'prior_agent_state': None}
        pool.append({'ticket': ticket, 'thread_hash': sha(ticket_key),
                     'source_path': str(path), 'source_sha256': sha(text),
                     'input_sha256': sha(canonical(input_doc)), 'input': input_doc,
                     'total_export_messages': len(messages), 'excluded_later_messages': len(messages) - len(visible),
                     'hints': {'correction': bool(re.search(r'不是.{0,30}(而是|是)|我[的说]意思|理解错|不对|更正|纠正|actually|I mean|not .{0,25}but ', body, re.I)),
                               'question': bool(re.search(r'[?？]|请问|能否|是否|可以.{0,20}吗', body)),
                               'multi': len(visible) >= 3, 'single': len(visible) == 1,
                               'artifact': any(m['attachments_unavailable'] for m in visible),
                               'english': len(re.findall(r'[a-zA-Z]', body)) > 2 * len(re.findall(r'[\u4e00-\u9fff]', body))}})
    unique, seen_threads, seen_content = [], set(), set()
    for row in pool:
        body_hash = sha(canonical([(m['speaker'], m['text']) for m in row['input']['messages']]))
        if row['thread_hash'] in seen_threads or body_hash in seen_content:
            excluded['duplicate_thread_or_text'] += 1
            continue
        seen_threads.add(row['thread_hash'])
        seen_content.add(body_hash)
        unique.append(row)
    return unique, {'source_files': sum(map(len, variants.values())), 'unique_tickets': len(variants),
                    'duplicate_snapshot_files': sum(len(g) - 1 for g in variants.values()),
                    'eligible_unique_windows': len(unique), 'excluded_tickets': dict(excluded)}


def prepare(args):
    if args.out.exists():
        raise SystemExit('Output already exists; use a fresh directory to preserve the first extraction.')
    args.out.mkdir(parents=True, mode=0o700)
    args.out.chmod(0o700)
    pool, profile = extract(args.source)
    chosen, seen = [], set()
    # Screening hints select variety; these are never action/quality labels.
    for key, limit in [('correction', 15), ('multi', 30), ('question', 20), ('single', 20), ('english', 15)]:
        candidates = sorted((r for r in pool if r['hints'][key] and r['thread_hash'] not in seen),
                            key=lambda r: sha(SEED + r['thread_hash']))
        for row in candidates[:limit]:
            row['screening_stratum'] = key
            chosen.append(row)
            seen.add(row['thread_hash'])
    for row in sorted(pool, key=lambda r: sha(SEED + r['thread_hash'])):
        if len(chosen) >= 100:
            break
        if row['thread_hash'] not in seen:
            row['screening_stratum'] = 'fill'
            chosen.append(row)
            seen.add(row['thread_hash'])
    chosen = chosen[:100]
    for i, row in enumerate(chosen):
        row['id'] = f'S10-{i + 1:03}'
        # Stable split by thread, before any action label or model prediction.
        row['split'] = 'review_holdout' if int(sha('split:' + row['thread_hash'])[:8], 16) % 5 == 0 else 'development'
    for ticket in args.extra_tickets.split(',') if args.extra_tickets else []:
        row = next(r for r in pool if r['ticket'] == ticket)
        if row['thread_hash'] in seen:
            raise ValueError('Supplement duplicates a selected thread')
        row['id'] = f'S10-{len(chosen) + 1:03}'
        row['screening_stratum'] = 'targeted_development_supplement'
        row['split'] = 'development'
        chosen.append(row)
        seen.add(row['thread_hash'])
    if args.selection_manifest:
        if args.extra_tickets:
            raise ValueError('Use either a frozen selection manifest or additional screening tickets.')
        frozen = json.loads(args.selection_manifest.read_text())['case_manifest']
        by_ticket = {r['ticket']: r for r in pool}
        chosen = []
        for record in frozen:
            row = by_ticket[record['ticket']]
            assert row['thread_hash'] == record['thread_hash'], 'Thread identity changed since selection'
            row.update({k: record[k] for k in ('id', 'split', 'screening_stratum')})
            chosen.append(row)
    write_rows(args.out / 'cases.private.jsonl', chosen)
    profile.update({'selected': len(chosen), 'selected_strata': dict(collections.Counter(r['screening_stratum'] for r in chosen)),
                    'split': dict(collections.Counter(r['split'] for r in chosen)), 'seed': SEED,
                    'source_root': str(args.source), 'created_at': datetime.now(timezone.utc).isoformat()})
    write(args.out / 'profile.json', profile)
    print(json.dumps(profile, ensure_ascii=False))


def assemble(args):
    cases = read_rows(args.out / 'cases.private.jsonl')
    states = json.loads((args.out / 'state-notes.private.json').read_text())
    answers = {
        13: '可以据线程排查说明：296条明细已逐行取消但表头状态未同步，导出未排除这些明细，造成与财报口径不一致。重新导出仅为后续计划，不能称已完成或审计已认可。',
        115: '刷新后目前恢复了，但仅凭这一结果不能确认筛选数据过多是原因；窗口中的错误是Component is destroyed。若再次出现或需要确认根因，仍需人工排查。',
        116: 'M2已列出SKU清单，可以先对照这份列表确认是否与原清单一致；列表是否准确、SKU为什么不可选还没有得到核实。',
        117: '根据M3，在valuation下用该凭证的reference搜索对应业务单据。当前账号是否可见valuation尚未确认；若不可见，由人工核验权限，不宣称已开通。',
    }
    wait_targets = {
        1: 'human_investigation', 2: 'requester', 8: 'no_open_request', 12: 'requester',
        14: 'human_investigation', 15: 'requester', 19: 'business_confirmation',
        21: 'business_confirmation', 22: 'requester', 24: 'business_confirmation',
        29: 'no_open_request', 37: 'requester', 43: 'requester', 44: 'requester', 45: 'human_investigation',
        46: 'requester', 63: 'business_confirmation', 87: 'requester', 88: 'requester',
        98: 'no_open_request', 107: 'no_open_request', 108: 'requester',
        109: 'business_confirmation', 110: 'requester', 111: 'business_confirmation',
        112: 'requester', 113: 'human_investigation', 114: 'requester',
        119: 'requester', 120: 'no_open_request',
    }
    labels = []
    for line in (args.out / 'label-notes.private.tsv').read_text().splitlines():
        num, action, clarity, gap, request, rationale, ids, blocker, resume, question = line.split('|')
        i = int(num)
        case = cases[i - 1]
        assert case['id'] == f'S10-{i:03}'
        state = states.get(str(i), {})
        questions, corrections = state.get('question_history', []), state.get('corrections', [])
        forbidden = ['使用十分钟之后的消息、事后Ticket字段、既有Shadow或Wiki补全当前事实',
                     '把截图占位符当成已读图片，或把假设和计划写成已确认结果']
        if any(q['status'] in ('pending', 'partially_answered') for q in questions):
            forbidden.append('在没有新事实或纠正时重复提出仍未回答的问题')
        if corrections:
            forbidden.append('沿用已被补充或纠正替代的旧理解，或重新询问已经明确的信息')
        if action == 'human':
            forbidden.append('只因缺信息就循环追问，或宣称人工操作和授权已经完成')
        if action == 'wait':
            forbidden.append('没有明确等待对象或恢复条件地无限等待；不能由已问问题推定已接单')
        labels.append({'id': case['id'], 'split': case['split'], 'state': {
            'main_request': request, 'main_problem_clarity': clarity, 'gap_type': gap,
            'question_history': questions, 'corrections_and_updates': corrections,
            'missing_or_blocking': [{'description': blocker, 'evidence_ids': ids.split(',')}],
        }, 'expected': {'action': action, 'rationale': rationale, 'evidence_ids': ids.split(','),
                        'blocking_conditions': [blocker], 'resume_conditions': [resume],
                        'next_question': None if question == '-' else question,
                        'waiting_for': wait_targets.get(i),
                        'clarification_kind': ('main_problem' if clarity == 'unclear' else 'prerequisite') if action == 'clarify' else None,
                        'answer_boundary': answers.get(i), 'must_not': forbidden},
                       'review': {'status': 'ai_draft', 'reviewer': None, 'reviewed_at': None,
                                  'source': 'current_assistant_window_only_annotation', 'gold_eligible': False}})
    write_rows(args.out / 'labels.ai-draft.private.jsonl', labels)
    write_rows(args.out / 'model-inputs.private.jsonl', [{'id': r['id'], 'input': r['input']} for r in cases])
    path = args.out / 'review.private.csv'
    fields = ['id', 'ticket', 'split', 'window_start', 'decision_at', 'messages', 'proposed_action',
              'main_problem_clarity', 'gap_type', 'proposed_label_json', 'review_status', 'reviewer',
              'reviewed_at', 'adjudicated_label_json', 'notes']
    with path.open('x', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for case, label in zip(cases, labels):
            writer.writerow({'id': case['id'], 'ticket': case['ticket'], 'split': case['split'],
                             'window_start': case['input']['window_start'], 'decision_at': case['input']['decision_at'],
                             'messages': '\n\n'.join(m['id'] + ' ' + m['at'] + ' ' + m['speaker'] + '\n' + m['text'] for m in case['input']['messages']),
                             'proposed_action': label['expected']['action'],
                             'main_problem_clarity': label['state']['main_problem_clarity'],
                             'gap_type': label['state']['gap_type'], 'proposed_label_json': canonical(label),
                             'review_status': 'pending'})
    path.chmod(0o600)
    cards = []
    for case, label in zip(cases, labels):
        messages = ''.join('<pre>' + html.escape(m['id'] + ' ' + m['at'] + ' ' + m['speaker'] + '\n' + m['text']) + '</pre>' for m in case['input']['messages'])
        cards.append('<article id="' + case['id'] + '"><h2>' + case['id'] + ' / Ticket ' + case['ticket'] + ' / ' + label['expected']['action'] + '</h2><p>' + html.escape(case['split'] + ' | ' + case['input']['window_start'] + ' → ' + case['input']['decision_at']) + '</p>' + messages + '<details><summary>AI候选标注（待人工复核）</summary><pre>' + html.escape(json.dumps(label, ensure_ascii=False, indent=2)) + '</pre></details></article>')
    write(args.out / 'review.private.html', '<!doctype html><html lang="zh"><meta charset="utf-8"><title>Shadow前十分钟120例候选复核</title><style>body{max-width:1100px;margin:32px auto;font:16px/1.6 system-ui;padding:0 20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f5f7;padding:16px;border-radius:8px}article{border-top:2px solid #ddd;margin:32px 0}summary{cursor:pointer}h1,h2{line-height:1.3}</style><h1>Shadow AI 前十分钟候选集</h1><p>仅本地复核。120条真实Ticket；所有标注均为AI草案，人工gold为0。消息创建时间窗口已校验，历史编辑无法复原。仅用聊天证据；不得引入后续结果。浏览器查找可定位ID，修改及签核用CSV。</p>' + ''.join(cards) + '</html>')
    print(json.dumps({'assembled': len(labels), 'gold': 0}))


def validate(args):
    cases = read_rows(args.out / 'cases.private.jsonl')
    labels = read_rows(args.out / 'labels.ai-draft.private.jsonl')
    inputs = read_rows(args.out / 'model-inputs.private.jsonl')
    assert 50 <= len(cases) <= 200
    assert len(cases) == len(labels) == len(inputs)
    assert len({r['id'] for r in cases}) == len(cases)
    assert len({r['ticket'] for r in cases}) == len(cases)
    assert len({r['thread_hash'] for r in cases}) == len(cases)
    assert [r['id'] for r in cases] == [r['id'] for r in labels] == [r['id'] for r in inputs]
    if args.frozen_manifest:
        frozen = json.loads(args.frozen_manifest.read_text())
        assert frozen['extractor_sha256'] == sha(Path(__file__).read_bytes()), 'Extractor changed since freeze'
        for name, checksum in frozen['hashes'].items():
            assert sha((args.out / name).read_bytes()) == checksum, 'Frozen artifact changed: ' + name
        assert [{k: r[k] for k in ('id', 'ticket', 'thread_hash', 'source_sha256', 'input_sha256', 'split', 'screening_stratum')} for r in cases] == frozen['case_manifest']
    profile = json.loads((args.out / 'profile.json').read_text())
    source_root = Path(profile['source_root'])
    fresh, fresh_profile = extract(source_root)
    current = {r['ticket']: r for r in fresh}
    assert fresh_profile['eligible_unique_windows'] == profile['eligible_unique_windows']
    actions, gaps, clarity, strata, splits = (collections.Counter() for _ in range(5))
    observations = collections.Counter()
    for case, label, exported in zip(cases, labels, inputs):
        doc, expected, state = case['input'], label['expected'], label['state']
        assert set(exported) == {'id', 'input'} and exported['input'] == doc
        assert set(doc) == {'window_start', 'decision_at', 'messages', 'knowledge', 'evidence_scope', 'history_complete_in_export', 'historical_edits_verified', 'speaker_business_roles', 'prior_agent_state'}
        assert sha(canonical(doc)) == case['input_sha256']
        assert current[case['ticket']]['source_sha256'] == case['source_sha256']
        assert current[case['ticket']]['input_sha256'] == case['input_sha256']
        assert doc['evidence_scope'] == 'thread_only' and doc['knowledge'] == []
        assert stamp(doc['decision_at']) - stamp(doc['window_start']) == timedelta(minutes=10)
        ids = {m['id'] for m in doc['messages']}
        assert all(stamp(doc['window_start']) <= stamp(m['at']) <= stamp(doc['decision_at']) for m in doc['messages'])
        assert all(set(m) == {'id', 'at', 'speaker', 'text', 'attachments_unavailable', 'source_text_truncated', 'reply_to'} for m in doc['messages'])
        assert all(m['reply_to'] in ids | {None, 'outside_window'} for m in doc['messages'])
        evidence_sets = [expected['evidence_ids']]
        for q in state['question_history']:
            evidence_sets.extend([q['evidence_ids'], q['answer_evidence_ids']])
        evidence_sets.extend(c['evidence_ids'] for c in state['corrections_and_updates'])
        evidence_sets.extend(m['evidence_ids'] for m in state['missing_or_blocking'])
        assert all(set(es) <= ids for es in evidence_sets)
        assert expected['evidence_ids'] and expected['rationale']
        assert expected['blocking_conditions'] and expected['resume_conditions']
        assert expected['action'] in {'answer', 'clarify', 'human', 'wait'}
        assert bool(expected['next_question']) == (expected['action'] == 'clarify')
        assert bool(expected['answer_boundary']) == (expected['action'] == 'answer')
        assert bool(expected['waiting_for']) == (expected['action'] == 'wait')
        assert (expected['clarification_kind'] is not None) == (expected['action'] == 'clarify')
        assert label['review']['status'] == 'ai_draft' and label['review']['gold_eligible'] is False
        actions[expected['action']] += 1
        gaps[state['gap_type']] += 1
        clarity[state['main_problem_clarity']] += 1
        strata[case['screening_stratum']] += 1
        splits[case['split']] += 1
        observations['messages'] += len(doc['messages'])
        observations['later_messages_excluded'] += case['excluded_later_messages']
        observations['with_unavailable_attachments'] += any(m['attachments_unavailable'] for m in doc['messages'])
        observations['with_source_text_truncation'] += any(m['source_text_truncated'] for m in doc['messages'])
        observations['with_question_history'] += bool(state['question_history'])
        observations['with_corrections_or_updates'] += bool(state['corrections_and_updates'])
        observations['pending_question_cases'] += any(q['status'] in ('pending', 'partially_answered') for q in state['question_history'])
    csv_rows = list(csv.DictReader((args.out / 'review.private.csv').open(encoding='utf-8-sig', newline='')))
    assert len(csv_rows) == len(cases) and all(r['review_status'] == 'pending' for r in csv_rows)
    assert [r['id'] for r in csv_rows] == [r['id'] for r in cases]
    assert all(json.loads(r['proposed_label_json']) == label for r, label in zip(csv_rows, labels))
    prior_ids = set()
    for pattern in ('wiki-rag-*/cases.json', 'wiki-rag-*/holdout-cases.json'):
        for path in (REPO / 'docs/tasks/ai-ticket').glob(pattern):
            data = json.loads(path.read_text())
            for row in data.get('cases', []) if isinstance(data, dict) else data:
                prior_ids.update(str(row[k]) for k in ('ticket', 'current_ticket') if str(row.get(k, '')).isdigit())
                prior_ids.update(str(v) for v in row.get('source_tickets', []) if str(v).isdigit())
                for value in [row.get('source', ''), *row.get('source_paths', [])]:
                    prior_ids.update(re.findall(r'ticket-(\d+)', str(value)))
    report = {'schema_version': 'shadow-first10-dataset-v1', 'validation': 'passed', 'cases': len(cases),
              'actions_ai_draft': dict(actions), 'gaps_ai_draft': dict(gaps), 'clarity_ai_draft': dict(clarity),
              'strata': dict(strata), 'split': dict(splits), 'observations': dict(observations),
              'earliest_window_start': min(r['input']['window_start'] for r in cases),
              'latest_window_start': max(r['input']['window_start'] for r in cases),
              'prior_rag_eval_ticket_overlap': sum(r['ticket'] in prior_ids for r in cases),
              'prior_rag_eval_holdout_overlap': sum(r['ticket'] in prior_ids and r['split'] == 'review_holdout' for r in cases),
              'holdout_actions_ai_draft': dict(collections.Counter(l['expected']['action'] for l in labels if l['split'] == 'review_holdout')),
              'gold_cases': 0, 'external_model_calls': 0, 'platform_writes': 0,
              'extractor_sha256': sha(Path(__file__).read_bytes()),
              'historical_edit_time_verified': False, 'historical_delivery_time_verified': False,
              'hashes': {p.name: sha(p.read_bytes()) for p in sorted(args.out.iterdir()) if p.is_file()},
              'case_manifest': [{k: r[k] for k in ('id', 'ticket', 'thread_hash', 'source_sha256', 'input_sha256', 'split', 'screening_stratum')} for r in cases]}
    if args.report:
        # This report contains only counts/IDs/hashes, never customer text.
        args.report.parent.mkdir(parents=True, exist_ok=True)
        with args.report.open('x') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
            f.write('\n')
    print(json.dumps({k: v for k, v in report.items() if k not in ('case_manifest', 'hashes')}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    prep = commands.add_parser('prepare')
    prep.add_argument('--source', type=Path, default=SOURCE)
    prep.add_argument('--out', type=Path, required=True)
    prep.add_argument('--extra-tickets', default='', help='Comma-separated reviewed IDs; development only, never held out.')
    prep.add_argument('--selection-manifest', type=Path, help='Replay exact IDs/order/splits from a previously frozen safe manifest.')
    assembly = commands.add_parser('assemble')
    assembly.add_argument('--out', type=Path, required=True)
    check = commands.add_parser('validate')
    check.add_argument('--out', type=Path, required=True)
    check.add_argument('--report', type=Path, help='New safe count/hash manifest path; never includes customer text.')
    check.add_argument('--frozen-manifest', type=Path, help='Verify artifact/code hashes against a previously frozen safe manifest.')
    args = parser.parse_args()
    args.out = args.out.resolve()
    if not args.out.is_relative_to(PRIVATE.resolve()) or args.out == PRIVATE.resolve():
        raise SystemExit('Customer artifacts must remain beneath the gitignored eval artifacts directory.')
    {'prepare': prepare, 'assemble': assemble, 'validate': validate}[args.command](args)


if __name__ == '__main__':
    main()
