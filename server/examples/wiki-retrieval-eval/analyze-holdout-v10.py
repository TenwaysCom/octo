"""Analyze the first fixed holdout without retuning or calling any model."""
import hashlib
import json
from pathlib import Path

OUT = Path('docs/tasks/ai-ticket/wiki-rag-v10')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
frozen = read(OUT / 'holdout-freeze.json')
assert sha(OUT / 'holdout-cases.json') == frozen['casesSha256']
assert sha(OUT / 'selection-lock.json') == frozen['selectionSha256']
cases = {c['id']: c for c in read(OUT / 'holdout-cases.json')['cases']}
rows = read(OUT / 'holdout.json')['results']
run = lambda r, strategy: next(x for x in r['runs'] if x['strategy'] == strategy)
primary_gold = lambda r, s: any(e['path'] in cases[r['id']]['expectedPages'] and e['contentChars'] and e['primaryChars'] for e in run(r, s)['final'])
body_gold = lambda r, s: any(e['path'] in cases[r['id']]['expectedPages'] and e['contentChars'] for e in run(r, s)['final'])
is_gold_top1 = lambda r: r['ranked'][0]['path'] in cases[r['id']]['expectedPages']
positives = [r for r in rows if cases[r['id']]['type'] == 'positive']
low_positives = [r for r in positives if is_gold_top1(r) and r['ranked'][0]['score'] < .7]
negative_pairs = [r for r in rows if cases[r['id']]['type'] == 'negative_pair']
no_answer = [r for r in rows if cases[r['id']]['type'] == 'no_answer']
competitive = [r for r in negative_pairs + no_answer if .3 <= r['ranked'][0]['score'] < .7
               and (cases[r['id']]['type'] == 'no_answer' or r['ranked'][0]['path'] in cases[r['id']]['wrongPages'])]
summaries = []
for strategy in 'ABCD':
    summaries.append({'strategy': strategy, 'positives': 16,
        'goldRecall20': sum(cases[r['id']]['expectedRank20'] is not None for r in positives),
        'goldTop5': sum(any(s['path'] in cases[r['id']]['expectedPages'] for s in r['ranked']) for r in positives),
        'goldSelected': sum(any(s['path'] in cases[r['id']]['expectedPages'] for s in run(r, strategy)['selected']) for r in positives),
        'goldBody': sum(body_gold(r, strategy) for r in positives),
        'goldWithPrimary': sum(primary_gold(r, strategy) for r in positives),
        'newGoldWithPrimary': [r['id'] for r in positives if primary_gold(r, strategy) and not primary_gold(r, 'A')],
        'lowTop1PositiveCases': [r['id'] for r in low_positives],
        'lowTop1PrimaryKept': [r['id'] for r in low_positives if primary_gold(r, strategy)],
        'specifiedWrongTop5': [r['id'] for r in negative_pairs if any(s['path'] in cases[r['id']]['wrongPages'] for s in r['ranked'])],
        'specifiedWrongFinal': [r['id'] for r in negative_pairs if any(e['path'] in cases[r['id']]['wrongPages'] for e in run(r, strategy)['final'])],
        'noAnswerNonempty': [r['id'] for r in no_answer if run(r, strategy)['final']],
        'noAnswerWithBody': [r['id'] for r in no_answer if any(e['contentChars'] for e in run(r, strategy)['final'])],
        'newFinalPairsVersusA': [r['id'] + '|' + e['path'] for r in rows for e in run(r, strategy)['final'] if e['path'] not in [a['path'] for a in run(r, 'A')['final']]],
    })
unsupported = []
for r in no_answer:
    actual = run(r, 'D')
    if not actual['final']:
        continue
    unsupported.append({'id': r['id'], 'frozenReason': cases[r['id']]['boundary'], 's1': actual['s1'],
        'branch': actual['reason'], 'alsoInBaselineA': run(r, 'A')['final'] == actual['final'],
        'classification': 'No support for the frozen requested fact; general modeling/historical context is not current data/configuration evidence.',
        'notAnObservedFinalAnswerError': True,
        'cards': [{k: e[k] for k in ['path', 'contentChars', 'primaryChars', 'sourcePaths']} for e in actual['final']]})


def write(name, data):
    with (OUT / name).open('x') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')


write('holdout-summary.json', {'summaries': summaries, 'competitiveNegativeTop1': [r['id'] for r in competitive],
    'competitiveSupportWikiTop1': [r['id'] for r in competitive if not r['ranked'][0]['path'].startswith(('objects/', 'processes/', 'rules/'))],
    'lowTop1PositiveCoverage': {'observed': len(low_positives), 'required': 4},
    'negativeCoverage': {'observedScoreBand': len(competitive), 'required': 4},
    'rulesRetunedAfterHoldout': False, 'G': 'disabled'})
write('holdout-support-audit.json', {'frozenLabelsUnchanged': True, 'unsupportedAsRequestedAnswer': unsupported,
    'newFinalContextsFromD': [], 'DVersusAExactlyEqual': all(run(r, 'D')['final'] == run(r, 'A')['final'] for r in rows),
    'answerModelCalled': False, 'evaluationBoundary': 'Knowledge context admission, not generated answer correctness.'})
write('acceptance.json', {'decision': 'NOT_ACCEPTED', 'development': 'PASS', 'stability': 'PASS_10_OF_10',
    'independentPositiveGain': 'NOT_PROVEN: 8/16 body+primary for A and D, no new valid body+primary rescue',
    'lowPositiveCoverage': 'INSUFFICIENT: 3 cases, required >=4; D effective retention 0/3',
    'competitiveNegativeCoverage': 'INSUFFICIENT: 1 score-band wrong top1, required >=4; it is Ontology, not a rescuable SupportWiki',
    'specifiedWrongPairs': 'PASS: 0/8 admitted by D; only one specified wrong page reached formal Top5',
    'noAnswerContexts': 'FAIL: 5/8 nonempty; all already present in A high-score path, one title-only; 4/8 contain body',
    'newErroneousContextsFromD': 0, 'oldAndNewBaselinePayloadPreserved': True,
    'nextAction': 'Do not apply/deploy; do not retune or replace cases. Separate answerability/source sufficiency from relevance in a future proposal.',
    'G': 'disabled', 'httpRequests': 42, 'httpCap': 50, 'retries': 0})
print(json.dumps({'summaries': summaries, 'competitiveNegativeTop1': [r['id'] for r in competitive], 'decision': 'NOT_ACCEPTED'}, ensure_ascii=False))
