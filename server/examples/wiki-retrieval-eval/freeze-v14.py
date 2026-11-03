"""Freeze the prepared isolated v14 candidate and manually reviewed source labels.

No retrieval replay, network request, shared code or knowledge mutation.
"""
import difflib
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
ROOT = Path('/tmp/octo-wiki-rag-v14')
OUT = REPO / 'docs/tasks/ai-ticket/wiki-rag-v14'
OLD = REPO / 'docs/tasks/ai-ticket'


def read(p):
    return json.loads(p.read_text())


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def manifest(p):
    return {str(f.relative_to(p)): sha(f) for f in sorted(p.rglob('*')) if f.is_file() and not f.is_symlink()}


def write(p, value, private=False):
    if p.exists():
        assert read(p) == value, 'Refuse to change previously prepared input: ' + str(p)
        return
    with p.open('x') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write('\n')
    if private:
        p.chmod(0o600)


assert not (OUT / 'initial-freeze.json').exists(), 'Never overwrite a completed freeze'
assert (OUT / 'policy.json').exists(), 'Export the reviewed policy before freezing'
previous = read(OLD / 'wiki-rag-v13/initial-freeze.json')
assert manifest(REPO / 'server/src') == previous['sharedApplicationBefore']
assert manifest(ROOT / 'K') == previous['knowledge']
assert manifest(ROOT / 'baseline/server/src') == previous['baselineCode']
for name, files in previous['previousArtifacts'].items():
    assert manifest(OLD / name) == files, name
for name, value in read(OLD / 'wiki-rag-v13/artifact-sha256.json')['files'].items():
    assert sha(OLD / 'wiki-rag-v13' / name) == value, name

v7 = read(Path('/tmp/octo-wiki-rag-v7/inputs.private.json'))
v8 = read(Path('/tmp/octo-wiki-rag-v8-four-inputs.private.json'))
v10 = read(Path('/tmp/octo-wiki-rag-v10/holdout-inputs.private.json'))
rows = []
for c in read(OLD / 'wiki-rag-v10/development-r1.json')['details']:
    item = next(x for x in (v7 if c['origin'] == 'v7' else v8) if
                (x['id'] if c['origin'] == 'v7' else 'E8-' + x['id']) == c['id'])
    response = {'results': []} if not c['candidatePaths'] else read(
        OLD / 'wiki-rag-v7/responses' / (c['payloadHash'] + '.json') if c['origin'] == 'v7' else
        OLD / 'wiki-rag-v8-four-cases' / (c['id'][3:] + '-top5.json'))
    rows.append({
        'id': c['id'], 'origin': c['origin'], 'type': c['type'], 'query': item.get('query', item.get('input')),
        'documents': [x['A'] for x in item['documents']] if c['origin'] == 'v7' else item['documents'],
        'candidatePaths': c['candidatePaths'], 'expectedPages': c['expectedPages'], 'wrongPages': c['wrongPages'],
        'scores': response['results'], 'previousFinal': next(x for x in c['runs'] if x['strategy'] == 'A')['final'],
    })
for c in read(OLD / 'wiki-rag-v10/holdout-cases.json')['cases']:
    item = next(x for x in v10 if x['id'] == c['id'])
    report = next(x for x in read(OLD / 'wiki-rag-v10/holdout.json')['results'] if x['id'] == c['id'])
    rows.append(item | {'origin': 'v10', 'type': c['type'], 'expectedPages': c['expectedPages'],
                       'wrongPages': c['wrongPages'], 'scores': read(OLD / 'wiki-rag-v10' / ('holdout-' + c['id'] + '.json'))['results'],
                       'previousFinal': next(x for x in report['runs'] if x['strategy'] == 'A')['final']})
assert len(rows) == 137
write(ROOT / 'old-inputs.private.json', rows, private=True)

changes = []
baseline = ROOT / 'baseline/server/src'
candidate = ROOT / 'candidate/server/src'
for p in sorted(candidate.rglob('*')):
    if not p.is_file():
        continue
    name = p.relative_to(candidate)
    before = (baseline / name).read_text() if (baseline / name).exists() else ''
    after = p.read_text()
    if before != after:
        changes.extend(difflib.unified_diff(before.splitlines(True), after.splitlines(True),
                       fromfile='a/server/src/' + str(name) if (baseline / name).exists() else '/dev/null',
                       tofile='b/server/src/' + str(name)))
(OUT / 'candidate-full.patch').write_text(''.join(changes))
write(OUT / 'config.json', {
    'version': 14, 'model': 'BAAI/bge-reranker-v2-m3', 'threshold': 0.7, 'recallLimit': 20,
    'topN': 5, 'finalLimit': 3, 'A': {'page': 2400}, 'B': {'page': 4800, 'total': 7200},
    'C': {'page': 4800, 'total': 7200, 'incrementOnly': True, 'subsetOfB': True, 'refill': False},
    'maxHttpRequests': 40, 'newCases': 32, 'answerCalls': 0, 'judgeCalls': 0, 'G': 'disabled',
    'rawSentToModel': False, 'oldGateBeforeNewCases': True, 'retuneAfterFreeze': False,
})
write(OUT / 'initial-freeze.json', {
    'createdAt': datetime.now(timezone.utc).isoformat(), 'beforeCandidateReplay': True,
    'labelsSha256': sha(OUT / 'source-labels.json'), 'policySha256': sha(OUT / 'policy.json'),
    'oldInputsSha256': sha(ROOT / 'old-inputs.private.json'),
    'baselineCode': manifest(baseline), 'candidateCode': manifest(candidate),
    'knowledge': manifest(ROOT / 'K'), 'sharedApplicationBefore': manifest(REPO / 'server/src'),
    'experimentCode': {name: sha(REPO / 'server/examples/wiki-retrieval-eval' / name) for name in
                       ['primary-focus-v14.mts', 'primary-focus-v14.test.ts', 'replay-v14.mts', 'freeze-v14.py']},
    'previousArtifacts': {name: manifest(OLD / name) for name in
                          [*previous['previousArtifacts'], 'wiki-rag-v13']},
    'G': 'disabled', 'productionChanges': False, 'new32Prepared': False,
})
print(json.dumps({'frozen': True, 'cases': len(rows), 'sourceLabels': 32, 'modelCalls': 0, 'G': 'disabled'}))
