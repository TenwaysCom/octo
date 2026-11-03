"""Join frozen first-ten-minute candidates with historical Shadow references.

Read-only sources; never changes the v1 dataset, calls models or queries a DB.
Historical analyses belong only in this private comparison surface, not input.
"""
import argparse
import collections
import csv
from datetime import datetime, timezone
import html
import json
from pathlib import Path
import re

import dataset


def section(text, heading, level=3):
    prefix = '#' * level
    match = re.search(r'^' + prefix + ' ' + re.escape(heading) + r'[^\n]*\n(.*?)(?=^' + prefix + r' |\Z)', text, re.M | re.S)
    return match[1].strip() if match else None


def bullet(text, key):
    match = re.search(r'^- ' + re.escape(key) + r':[ \t]*([^\n]*)', text or '', re.M)
    value = match[1].strip().strip('`') if match else None
    return None if value in (None, '', '(空)', '（空）') else dataset.redact(value)


def historical_shadow(text):
    body = section(text, 'Shadow AI', 2)
    common = {'reference_only': True, 'usable_as_model_input': False, 'usable_as_gold': False,
              'input_window_alignment': 'unverified_may_include_later_messages',
              'standalone_question_field': None,
              'question_display_sources': ['intent.summary', 'summary']}
    if body is None:
        return {**common, 'availability': 'missing', 'missing_reason': 'no_shadow_analysis_section_in_frozen_export',
                'intent_type': None, 'intent_subtype': None, 'intent_confidence': None,
                'intent_summary': None, 'keywords': None, 'overall_summary': None,
                'analyzed_at': None, 'prompt_key_and_version': None, 'analysis_snapshot_version': None,
                'analysis_status': None}
    intent = section(body, 'Intent') or ''
    pair = re.search(r'^- intentType / intentSubtype:[ \t]*`([^`]+)`[ \t]*/[ \t]*`([^`]+)`', intent, re.M)
    summary = section(body, '分析总览')
    metadata = section(body, '元数据') or ''
    return {**common, 'availability': 'available', 'missing_reason': None,
            'intent_type': pair[1] if pair else None, 'intent_subtype': pair[2] if pair else None,
            'intent_confidence': bullet(intent, 'confidence'), 'intent_summary': bullet(intent, 'summary'),
            'keywords': bullet(intent, 'keywords'), 'overall_summary': dataset.redact(summary) if summary else None,
            'analyzed_at': bullet(metadata, 'analyzedAt'),
            'prompt_key_and_version': bullet(metadata, 'promptKey / promptVersion'),
            'analysis_snapshot_version': bullet(metadata, 'snapshotVersion'),
            'analysis_status': bullet(metadata, 'status')}


def verify_frozen(base, manifest):
    assert dataset.sha(Path(dataset.__file__).read_bytes()) == manifest['extractor_sha256'], 'Frozen extractor changed'
    for name, expected in manifest['hashes'].items():
        assert Path(name).name == name, 'Artifact name must not contain a path'
        assert dataset.sha((base / name).read_bytes()) == expected, 'Frozen v1 artifact changed: ' + name


def collect(base, manifest):
    verify_frozen(base, manifest)
    cases = dataset.read_rows(base / 'cases.private.jsonl')
    labels = dataset.read_rows(base / 'labels.ai-draft.private.jsonl')
    assert [r['id'] for r in cases] == [r['id'] for r in labels] == [r['id'] for r in manifest['case_manifest']]
    source_root = Path(json.loads((base / 'profile.json').read_text())['source_root']).resolve()
    result = []
    for case, label, frozen in zip(cases, labels, manifest['case_manifest']):
        assert all(case[key] == frozen[key] for key in frozen), 'Case identity or provenance changed'
        source = Path(case['source_path']).resolve()
        assert source.is_relative_to(source_root), 'Source must remain in the original export root'
        content = source.read_text()
        assert dataset.sha(content) == case['source_sha256'], 'Original source changed for ' + case['id']
        result.append({'id': case['id'], 'ticket': case['ticket'], 'split': case['split'],
                       'input_sha256': case['input_sha256'], 'source_sha256': case['source_sha256'],
                       'first10_input': case['input'], 'first10_candidate': label,
                       'historical_shadow_reference': historical_shadow(content)})
    verify_frozen(base, manifest)
    return result


def comparison_page(rows):
    esc = lambda value: html.escape(str(value))
    cards = []
    for row in rows:
        original, candidate = row['historical_shadow_reference'], row['first10_candidate']
        state, expected, doc = candidate['state'], candidate['expected'], row['first10_input']
        if original['availability'] == 'missing':
            reference = '<p>本地冻结导出没有原Shadow分析，不补造原意图或问题总结。</p>'
        else:
            reference = '<details class="history"><summary>展开原分析（可能含后续信息）</summary><dl>'
            for title, key in [('原意图（intentType / intentSubtype）', 'intent_type'),
                               ('原意图子类', 'intent_subtype'), ('原意图置信度', 'intent_confidence'),
                               ('原诉求描述（intent.summary）', 'intent_summary'),
                               ('原问题 / 分析总结（summary，可能含处理结果）', 'overall_summary'),
                               ('原关键词', 'keywords'), ('原分析时间', 'analyzed_at'),
                               ('原提示版本', 'prompt_key_and_version'), ('原分析快照版本', 'analysis_snapshot_version')]:
                reference += '<dt>' + title + '</dt><dd>' + esc(original[key] if original[key] is not None else '导出未提供') + '</dd>'
            reference += '</dl><p class="muted">原分析的输入窗口未确认，原置信度不是本次动作置信度；没有独立question字段。</p></details>'
        current = '<p><b>当前诉求：</b>' + esc(state['main_request']) + '</p><p><b>候选动作：</b>' + esc(expected['action']) + '</p><p>' + esc(expected['rationale']) + '</p><p><b>消息证据：</b>' + esc(', '.join(expected['evidence_ids'])) + '</p><p><b>阻塞：</b>' + esc('；'.join(expected['blocking_conditions'])) + '</p><p><b>恢复：</b>' + esc('；'.join(expected['resume_conditions'])) + '</p>'
        if expected['next_question']:
            current += '<p><b>必要追问：</b>' + esc(expected['next_question']) + '</p>'
        if expected['answer_boundary']:
            current += '<p><b>有限回答边界：</b>' + esc(expected['answer_boundary']) + '</p>'
        current += '<details><summary>完整本次候选标签（含问答/纠正状态）</summary><pre>' + esc(json.dumps(candidate, ensure_ascii=False, indent=2)) + '</pre></details>'
        messages = ''.join('<pre>' + esc(m['id'] + ' ' + m['at'] + ' ' + m['speaker'] + '\n' + m['text']) + '</pre>' for m in doc['messages'])
        cards.append('<article id="' + esc(row['id']) + '"><h2>' + esc(row['id'] + ' / Ticket ' + row['ticket'] + ' / ' + row['split']) + '</h2><p class="muted">窗口：' + esc(doc['window_start'] + ' → ' + doc['decision_at']) + '</p><div class="grid"><section><h3>前十分钟：本次AI候选</h3>' + current + '</section><section class="historical"><h3>历史Shadow：仅供对照</h3>' + reference + '</section></div><details><summary>前十分钟原消息（' + str(len(doc['messages'])) + '条）</summary>' + messages + '</details></article>')
    return '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shadow原分析与前十分钟动作对照</title><style>body{max-width:1400px;margin:32px auto;padding:0 20px;font:16px/1.65 system-ui;color:#18212b;background:#fff}h1,h2,h3{line-height:1.3}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}section{padding:20px;background:#f4f6f9;border-radius:10px;min-width:0}.historical{background:#fff5e5}article{border-top:2px solid #dce1e8;padding-top:16px;margin-top:32px}pre,dd{white-space:pre-wrap;overflow-wrap:anywhere}pre{padding:12px;background:#f4f6f9}dt{font-weight:650;margin-top:16px}dd{margin-left:0}summary{cursor:pointer;font-weight:600}.muted{color:#566273}.warning{padding:18px;background:#fff0cd;border-left:5px solid #a76400}@media(max-width:850px){.grid{grid-template-columns:1fr}body{padding:0 12px}section{padding:14px}}</style><h1>原Shadow意图 / 问题总结 × 前十分钟动作</h1><p>' + str(len(rows)) + '条Ticket；浏览器查找可定位S10编号或Ticket号。所有本次标签均为AI草案，人工gold为0。</p><p class="warning">历史Shadow可能使用十分钟后的消息或处理结果，默认折叠。它不是本次模型输入或标准答案；如需独立标注，请先读十分钟消息并完成判断，再展开历史参考。原数据没有独立question字段，展示intent.summary及summary，不生成伪造的旧问题字段。</p>' + ''.join(cards) + '</html>'


def build(args):
    manifest = json.loads(args.manifest.read_text())
    rows = collect(args.base, manifest)
    if args.out.exists():
        raise SystemExit('Comparison directory already exists; use a fresh output directory.')
    args.out.mkdir(parents=True, mode=0o700)
    args.out.chmod(0o700)
    dataset.write_rows(args.out / 'comparison.private.jsonl', rows)
    dataset.write(args.out / 'comparison.private.html', comparison_page(rows))
    csv_path = args.out / 'comparison.private.csv'
    fields = ['id', 'ticket', 'split', 'window_start', 'decision_at', 'first10_request', 'first10_action',
              'first10_rationale', 'first10_evidence_ids', 'first10_blocking_conditions', 'first10_resume_conditions',
              'original_availability', 'original_intent_type', 'original_intent_subtype', 'original_intent_confidence',
              'original_intent_summary', 'original_overall_summary', 'original_keywords', 'original_analyzed_at',
              'original_prompt_key_and_version', 'original_analysis_snapshot_version', 'comparison_boundary',
              'first10_messages', 'first10_candidate_json']
    with csv_path.open('x', newline='', encoding='utf-8-sig') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            doc, candidate, old = row['first10_input'], row['first10_candidate'], row['historical_shadow_reference']
            expected = candidate['expected']
            line = {k: row[k] for k in ('id', 'ticket', 'split')}
            line.update({'window_start': doc['window_start'], 'decision_at': doc['decision_at'],
                         'first10_request': candidate['state']['main_request'], 'first10_action': expected['action'],
                         'first10_rationale': expected['rationale'], 'first10_evidence_ids': json.dumps(expected['evidence_ids']),
                         'first10_blocking_conditions': json.dumps(expected['blocking_conditions'], ensure_ascii=False),
                         'first10_resume_conditions': json.dumps(expected['resume_conditions'], ensure_ascii=False),
                         'comparison_boundary': 'historical_reference_only; input_window_unverified; not_gold; not_model_input',
                         'first10_messages': '\n\n'.join(m['id'] + ' ' + m['at'] + ' ' + m['speaker'] + '\n' + m['text'] for m in doc['messages']),
                         'first10_candidate_json': dataset.canonical(candidate)})
            for key in ('availability', 'intent_type', 'intent_subtype', 'intent_confidence', 'intent_summary', 'overall_summary',
                        'keywords', 'analyzed_at', 'prompt_key_and_version', 'analysis_snapshot_version'):
                line['original_' + key] = old[key]
            writer.writerow(line)
    csv_path.chmod(0o600)
    exported = list(csv.DictReader(csv_path.open(encoding='utf-8-sig', newline='')))
    assert [r['id'] for r in exported] == [r['id'] for r in rows]
    assert all(json.loads(r['first10_candidate_json']) == source['first10_candidate'] for r, source in zip(exported, rows))
    verify_frozen(args.base, manifest)
    coverage = collections.Counter(r['historical_shadow_reference']['availability'] for r in rows)
    report = {'schema_version': 'shadow-first10-comparison-v1', 'generated_at': datetime.now(timezone.utc).isoformat(),
              'cases': len(rows), 'original_coverage': dict(coverage), 'v1_artifacts_unchanged': True,
              'missing_original_case_ids': [r['id'] for r in rows if r['historical_shadow_reference']['availability'] == 'missing'],
              'available_without_intent_summary': sum(r['historical_shadow_reference']['availability'] == 'available' and not r['historical_shadow_reference']['intent_summary'] for r in rows),
              'available_without_overall_summary': sum(r['historical_shadow_reference']['availability'] == 'available' and not r['historical_shadow_reference']['overall_summary'] for r in rows),
              'historical_input_alignment': 'unverified_may_include_later_messages',
              'standalone_question_field_exists': False, 'displayed_question_fields': ['intent.summary', 'summary'],
              'external_model_calls': 0, 'platform_writes': 0, 'gold_cases': 0,
              'v1_manifest_sha256': dataset.sha(args.manifest.read_bytes()),
              'comparison_script_sha256': dataset.sha(Path(__file__).read_bytes()),
              'files': {p.name: dataset.sha(p.read_bytes()) for p in sorted(args.out.iterdir())}}
    if args.report:
        with args.report.open('x') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
            f.write('\n')
    print(json.dumps(report, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, default=dataset.PRIVATE / 'shadow-first10-v1')
    parser.add_argument('--manifest', type=Path, default=dataset.REPO / 'docs/tasks/ai-ticket/shadow-first10-v1/verification.json')
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--report', type=Path, help='New safe count/hash report path; no customer text.')
    args = parser.parse_args()
    args.base, args.out = args.base.resolve(), args.out.resolve()
    if not args.base.is_relative_to(dataset.PRIVATE.resolve()) or not args.out.is_relative_to(dataset.PRIVATE.resolve()) or args.out == dataset.PRIVATE.resolve():
        raise SystemExit('All customer artifacts must remain beneath the existing private eval artifacts root.')
    build(args)


if __name__ == '__main__':
    main()
