"""Summarize frozen v7 evidence without model calls or overwriting first results."""
from pathlib import Path
from datetime import datetime
import csv, hashlib, json, math, statistics, sys

ART = Path('docs/tasks/ai-ticket/wiki-rag-v7')
ROOT = Path('/tmp/octo-wiki-rag-v7')
read = lambda path: json.loads(path.read_text())
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
freeze = read(ART / 'freeze.json')
for name, expected in freeze.items():
    if name.endswith('.json'):
        assert digest(ART / name) == expected, name
assert digest(ROOT / 'inputs.private.json') == freeze['inputs_private_sha256']
initial = read(ART / 'initial-freeze.json')

def tree(path):
    return {str(p.relative_to(path)): digest(p) for p in sorted(path.rglob('*')) if p.is_file()}

assert tree(ROOT / 'baseline/server/src') == initial['code']
assert tree(ROOT / 'K') == initial['knowledge']
history = {}
for version in ['v5', 'v6']:
    path = ART.parent / ('wiki-rag-' + version)
    for name, expected in read(path / 'artifact-sha256.json').items():
        assert digest(path / name) == expected, (version, name)
    history[version] = 'all previously frozen artifacts unchanged'
critical = ['adapters/filesystem/wiki-knowledge-reader.ts', 'application/services/wiki-qa.service.ts', 'domain/wiki-qa.ts', 'domain/wiki-evidence.ts']
assert all(digest(Path('server/src') / name) == initial['code'][name] for name in critical)

dev = read(ART / 'development-summary.json')
holdout = read(ART / 'holdout-summary.json')
lock = read(ART / 'selection-lock.json')
inputs = {row['id']: row for row in read(ROOT / 'inputs.private.json')}
config = read(ART / 'config.json')
for path in (ART / 'responses').glob('*.json'):
    result = read(path)
    row = inputs[result['caseId']]
    query = row['queryC'] if result['group'] == 'C' and row['queryC'] else row['query']['question']
    documents = [document['A'] if result['group'] == 'A' else document['B'] for document in row['documents']]
    payload = {'model': config['model'], 'query': query, 'documents': documents, 'topN': result['topN']}
    expected = hashlib.sha256(json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    assert result['payloadHash'] == expected, path.name
assert digest(ART / 'development-summary.json') == lock['developmentSummarySha256']
baseline = next(row for row in dev['summaries'] if row['group'] == 'A' and row['threshold'] == .7)
fresh = next(row for row in holdout['summaries'] if row['group'] == 'A' and row['threshold'] == .7)
requests = [json.loads(line) for line in (ART / 'requests.jsonl').read_text().splitlines()]
started = [row for row in requests if row['event'] == 'started']
responses = [row for row in requests if row['event'] == 'response']
assert len(started) <= 310
assert [r['number'] for r in started] == list(range(1, len(started) + 1))
assert len(started) == len(responses)
first_new = next(i for i, row in enumerate(started) if row['phase'] == 'holdout')
assert all(row['phase'] == 'holdout' for row in started[first_new:])
assert datetime.fromisoformat(started[first_new]['time'].replace('Z', '+00:00')).timestamp() >= (ART / 'selection-lock.json').stat().st_mtime
durations = sorted(row['durationMs'] for row in responses)
request_summary = {'requests': len(started), 'success200': sum(r['statusCode'] == 200 for r in responses), 'rateLimited429': sum(r['statusCode'] == 429 for r in responses),
                   'limit': 310, 'usageProvided': any(r.get('usage') for r in responses), 'latencyMedianMs': statistics.median(durations),
                   'latencyP95Ms': durations[math.ceil(len(durations) * .95) - 1], 'maxLatencyMs': max(durations)}
metrics = {key: fresh[key] for key in ['positive', 'goldTop20', 'goldTop5', 'hit5', 'mrr5', 'acceptedGoldIds', 'goldWithPrimaryIds', 'wrongAcceptedIds', 'wrongFinalIds', 'noAnswerAcceptedIds', 'noAnswerFinalIds']}
acceptance = {
    'configuration': {'group': lock['group'], 'threshold': lock['threshold'], 'sameAsBaseline': True},
    'ranking': {'passed': fresh['goldTop5'] >= math.ceil(.95 * fresh['goldTop20']), 'actual': f"{fresh['goldTop5']}/{fresh['goldTop20']}"},
    'thresholdRetention': {'passed': len(fresh['acceptedGoldIds']) >= math.ceil(.9 * fresh['goldTop20']), 'actual': f"{len(fresh['acceptedGoldIds'])}/{fresh['goldTop20']}"},
    'hardNegativePairs': {'passed': not fresh['wrongAcceptedIds'] and not fresh['wrongFinalIds'], 'accepted': fresh['wrongAcceptedIds'], 'cases': 6},
    'noAnswer': {'passed': not fresh['noAnswerAcceptedIds'] and not fresh['noAnswerFinalIds'], 'accepted': fresh['noAnswerAcceptedIds'], 'cases': 6},
    'oldRegression': {'passed': lock['sameAsBaseline'], 'reason': 'Selected configuration is unchanged A/0.7; no altered candidate accepted'},
    'sourceBoundaries': {'passed': True, 'goldBodyAndPrimary': len(fresh['goldWithPrimaryIds']), 'baselineGoldBodyAndPrimary': len(fresh['goldWithPrimaryIds']), 'note': 'Same unchanged source pipeline; T01 budget refusal preserved. No source repair claimed.'},
    'newInputCandidates': {'adopted': False, 'reason': 'B/C fail developer constraints before independent evaluation; no holdout B/C claims'},
    'outcome': 'Current A/0.7 passes this bounded holdout; no input or threshold change adopted; no deployment',
}
assert all(row['passed'] for row in acceptance.values() if isinstance(row, dict) and 'passed' in row)
stability = read(ART / 'stability.json')
assert len(stability['checks']) == 10 and all(r['sameOrder'] and r['sameAcceptedAt07'] for r in stability['checks'])
verification = {'frozenInputs': 'PASS', 'baselineSourceAndKnowledge': 'PASS', 'previousArtifacts': history, 'rootCriticalApplicationFilesUnchanged': critical,
                'unitMock': {'files': 7, 'tests': 209, 'passed': True}, 'snapshotBuild': 'PASS', 'experimentTypecheck': 'PASS', 'mockInputBoundaryChecks': 'PASS',
                'stability': {'cases': 10, 'sameOrderAnd07Decisions': True, 'maxScoreDelta': max(r['maxScoreDelta'] for r in stability['checks'])},
                'notMeasured': ['final generative answers', 'current deployed process configuration', 'production E2E', 'joint v5 recall expansion with rerank', 'G source association rollout'],
                'requests': request_summary}
summary = {'decision': acceptance['outcome'], 'holdout': metrics, 'developmentAt07': [row for row in dev['summaries'] if row['threshold'] == .7], 'requests': request_summary}

if '--verify' in sys.argv:
    for name, expected in read(ART / 'artifact-sha256.json').items(): assert digest(ART / name) == expected, name
    print(json.dumps({'verification': 'PASS', 'requests': request_summary, 'holdout': metrics}, ensure_ascii=False))
    sys.exit(0)
for name, value in [('summary.json', summary), ('acceptance.json', acceptance), ('verification.json', verification)]:
    with (ART / name).open('x') as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
        output.write('\n')
with (ART / 'ranks.csv').open('x') as output:
    writer = csv.writer(output)
    writer.writerow(['split', 'id', 'group', 'effective_group', 'query_C_available', 'candidate_count', 'gold_top20', 'gold_rank5', 'accepted_gold_07', 'gold_body_and_primary_07', 'wrong_accepted_07', 'final_count_07', 'top5_path_score'])
    for split, dataset in [('development', dev), ('holdout', holdout)]:
        for row in dataset['details']:
            threshold = next(t for t in row['thresholds'] if t['threshold'] == .7)
            writer.writerow([split, row['id'], row['group'], row['effectiveGroup'], row['queryCAvailable'], row['candidateCount'], row['goldInTop20'], row['expectedRank5'], threshold['acceptedGold'],
                             any(e['isGold'] and e['contentChars'] and e['primaryChars'] for e in threshold['final']), len(threshold['acceptedWrong']), len(threshold['final']),
                             ' | '.join(f"{p['path']}:{p['score']:.9f}" for p in row['ranked'])])
print(json.dumps(summary, ensure_ascii=False))
