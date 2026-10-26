"""Freeze an isolated, network-free v10 experiment. Never changes shared sources."""
import difflib
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / 'docs/tasks/ai-ticket/wiki-rag-v10'
ROOT = Path('/tmp/octo-wiki-rag-v10')
OLD = REPO / 'docs/tasks/ai-ticket/wiki-rag-v7'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def manifest(root):
    return {str(p.relative_to(root)): sha(p) for p in sorted(root.rglob('*')) if p.is_file() and not p.is_symlink()}


def write(path, data):
    with path.open('x') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')


if OUT.exists() or ROOT.exists():
    raise SystemExit('v10 already prepared; never overwrite frozen evidence')
initial = json.loads((OLD / 'initial-freeze.json').read_text())
old_root = Path('/tmp/octo-wiki-rag-v7')
assert manifest(old_root / 'baseline/server/src') == initial['code']
assert manifest(old_root / 'K') == initial['knowledge']
critical = ['application/services/wiki-qa.service.ts', 'adapters/filesystem/wiki-knowledge-reader.ts',
            'adapters/ai/wiki-qa-rerank-client.ts', 'domain/wiki-evidence.ts', 'domain/wiki-qa.ts']
assert all(sha(REPO / 'server/src' / p) == initial['code'][p] for p in critical)
ROOT.mkdir(mode=0o700)
OUT.mkdir()
for name in ['baseline', 'candidate']:
    dest = ROOT / name / 'server'
    shutil.copytree(old_root / 'baseline/server/src', dest / 'src')
    for f in ['package.json', 'tsconfig.json', 'vitest.config.ts']:
        shutil.copy2(REPO / 'server' / f, dest / f)
    (dest / 'node_modules').symlink_to(REPO / 'server/node_modules', target_is_directory=True)
shutil.copytree(old_root / 'K', ROOT / 'K')
helper = REPO / 'server/examples/wiki-retrieval-eval/threshold-policy-v10.mts'
target = ROOT / 'candidate/server/src/application/services/wiki-qa-threshold-policy.ts'
shutil.copy2(helper, target)
service = target.with_name('wiki-qa.service.ts')
old = service.read_text()
new = 'import { decideThreshold, hasPrimaryAndBody, type ThresholdPolicy, type Decision } from "./wiki-qa-threshold-policy.js";\n' + old
replacements = {
    '  answerLog?: WikiQaAnswerLog;': '  answerLog?: WikiQaAnswerLog;\n  thresholdPolicy?: ThresholdPolicy;',
    'candidates: WikiCandidate[] = []): Promise<T>': 'candidates: WikiCandidate[] = [], onDecision?: (decision: Decision) => void): Promise<T>',
    'const accepted = result.results.filter((item) => item.relevance_score >= minScore);':
        'const decision: Decision = deps.thresholdPolicy ? decideThreshold(result.results, candidates, deps.thresholdPolicy) : { strategy: "A", reason: "configured_baseline", lowFallback: false, selected: result.results.filter((item) => item.relevance_score >= minScore), s1: null, s2: null, gap: null };\n        onDecision?.(decision);\n        const accepted = decision.selected;',
    '    const ranked = await runStage("rerank",':
        '    let thresholdDecision: Decision | undefined;\n    const ranked = await runStage("rerank",',
    '}, wikiRankingSchema, input, rerankCandidates),':
        '}, wikiRankingSchema, input, rerankCandidates, (decision) => { thresholdDecision = decision; }),',
    '      const supported = evidence.filter((item) => supportsWikiQuestion':
        '      const supported = evidence.filter((item) => !thresholdDecision?.lowFallback || hasPrimaryAndBody(item))\n        .filter((item) => supportsWikiQuestion',
}
for before, after in replacements.items():
    assert new.count(before) == 1, before
    new = new.replace(before, after)
service.write_text(new)
diff = ''.join(difflib.unified_diff(old.splitlines(True), new.splitlines(True),
                                fromfile='a/server/src/application/services/wiki-qa.service.ts',
                                tofile='b/server/src/application/services/wiki-qa.service.ts'))
(OUT / 'candidate.patch').write_text(diff)
config = json.loads((OLD / 'config.json').read_text())
config.update(maxRequests=50, thresholdGrid={'floor': [.3, .4, .5], 'gap': [.1, .2, .3]},
              strategies=['A', 'B', 'C', 'D'], originalAssociationEnabled=False,
              phaseGate='development audit -> unique selection -> 10 stability -> 32 frozen holdout')
write(OUT / 'config.json', config)
write(OUT / 'initial-freeze.json', {
    'createdAt': datetime.now(timezone.utc).isoformat(),
    'baselineCode': manifest(ROOT / 'baseline/server/src'),
    'candidateCode': manifest(ROOT / 'candidate/server/src'),
    'knowledge': manifest(ROOT / 'K'),
    'sharedApplicationBefore': manifest(REPO / 'server/src'),
    'previousArtifacts': {v: manifest(REPO / 'docs/tasks/ai-ticket' / v)
                          for v in ['wiki-rag-v5', 'wiki-rag-v6', 'wiki-rag-v7', 'wiki-rag-v8-four-cases']},
    'privateInputs': {str(p): sha(p) for p in [old_root / 'inputs.private.json', Path('/tmp/octo-wiki-rag-v8-four-inputs.private.json')]},
    'policySha256': sha(helper), 'prepareSha256': sha(Path(__file__)),
    'configSha256': sha(OUT / 'config.json'), 'G': 'disabled', 'productionChanges': False,
})
print(json.dumps({'prepared': True, 'criticalCodeIdentical': True, 'sourceAssociationG': 'disabled',
                  'candidateChanges': ['isolated threshold selection', 'low fallback requires body and primary'],
                  'networkCalls': 0}))
