"""Create a frozen v13 baseline/candidate. Only /tmp and new experiment artifacts are written."""
import difflib
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / 'docs/tasks/ai-ticket/wiki-rag-v13'
ROOT = Path('/tmp/octo-wiki-rag-v13')
OLD = REPO / 'docs/tasks/ai-ticket/wiki-rag-v10'
OLD_ROOT = Path('/tmp/octo-wiki-rag-v10')


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def manifest(p):
    return {str(f.relative_to(p)): sha(f) for f in sorted(p.rglob('*')) if f.is_file() and not f.is_symlink()}


def write(p, x):
    with p.open('x') as f:
        json.dump(x, f, ensure_ascii=False, indent=2)
        f.write('\n')


if ROOT.exists() or OUT.exists():
    raise SystemExit('Never overwrite a v13 freeze')
old = json.loads((OLD / 'initial-freeze.json').read_text())
assert manifest(OLD_ROOT / 'baseline/server/src') == old['baselineCode']
assert manifest(OLD_ROOT / 'K') == old['knowledge']
assert manifest(REPO / 'server/src') == old['sharedApplicationBefore']
for name, expected in json.loads((OLD / 'artifact-sha256.live.json').read_text())['files'].items():
    assert sha(OLD / name) == expected, name
ROOT.mkdir(mode=0o700)
OUT.mkdir()
for name in ['baseline', 'candidate']:
    dest = ROOT / name / 'server'
    shutil.copytree(OLD_ROOT / 'baseline/server/src', dest / 'src')
    for f in ['package.json', 'tsconfig.json', 'vitest.config.ts']:
        shutil.copy2(REPO / 'server' / f, dest / f)
    (dest / 'node_modules').symlink_to(REPO / 'server/node_modules', target_is_directory=True)
shutil.copytree(OLD_ROOT / 'K', ROOT / 'K')
candidate = ROOT / 'candidate/server/src'
changes = []


def change(name, replacements):
    p = candidate / name
    before = p.read_text()
    after = before
    for a, b in replacements:
        assert after.count(a) == 1, (name, a)
        after = after.replace(a, b)
    p.write_text(after)
    changes.append(''.join(difflib.unified_diff(before.splitlines(True), after.splitlines(True),
                   fromfile='a/server/src/' + name, tofile='b/server/src/' + name)))


shutil.copy2(REPO / 'server/examples/wiki-retrieval-eval/primary-budget-v13.mts', candidate / 'domain/wiki-primary-budget.ts')
change('domain/wiki-qa.ts', [('evidenceIds: string[]; signal?: AbortSignal }): WikiSourceEvidence[];',
                            'evidenceIds: string[]; signal?: AbortSignal; maxChars?: number }): WikiSourceEvidence[];')])
change('adapters/filesystem/wiki-knowledge-reader.ts', [
    ('selectEvidence({ candidate, question, evidenceIds, signal })',
     'selectEvidence({ candidate, question, evidenceIds, signal, maxChars = 2400 })'),
    ('let remaining = 2400;', 'let remaining = maxChars;')])
change('application/services/wiki-qa.service.ts', [
    ('import { compactWikiAnswerContext', 'import { allocatePrimaryBudget } from "../../domain/wiki-primary-budget.js";\nimport { compactWikiAnswerContext'),
    ('  answerLog?: WikiQaAnswerLog;', '  answerLog?: WikiQaAnswerLog;\n  rawBudget?: { page: number; total: number };'),
    ('      const supported = evidence.filter', '      let supported = evidence.filter'),
    ('      wikiLogger.info({ actionRunId: input.actionRunId, layer: "server", stage: "server.wiki_qa.evidence", selected: evidence.length, supported: supported.length }',
     '''      if (deps.rawBudget && reader.selectEvidence) {
        // Extend only the baseline's already selected <=3 pages. Ranking and page selection are unchanged.
        const plans = supported.map((item) => {
          const candidate = rerankCandidates.find(c => (c.sourcePath ?? c.path) === item.path)!;
          const match = ranked.matches.find(m => m.candidateId === candidate.id)!;
          return { key: item.path, existing: item.sourceEvidence, units: reader.selectEvidence!({
            candidate, question: extracted, evidenceIds: match.evidenceIds, signal: input.signal, maxChars: Number.MAX_SAFE_INTEGER,
          }) };
        });
        const allocation = allocatePrimaryBudget(plans, deps.rawBudget);
        supported = supported.map((item) => {
          const candidate = rerankCandidates.find(c => (c.sourcePath ?? c.path) === item.path)!;
          const match = ranked.matches.find(m => m.candidateId === candidate.id)!;
          const sources = allocation.pages.find(p => p.key === item.path)!.sources;
          const omittedEvidence = sources.length < match.evidenceIds.length;
          const historical = candidate.historicalOnly || !match.conditionsMatched || !sources.length || omittedEvidence || sources.some(s => !s.complete);
          return { ...item, sourceEvidence: sources,
            content: scopedWikiContent(candidate.content, sources.map(s => s.path), candidate.knowledgeType === "ontology"),
            applicability: historical ? "historical_reference" : match.applicability,
            limitations: [...new Set([...candidate.limitations, ...match.limitations,
              ...(!match.conditionsMatched ? ["当前材料尚未确认处理路径的关键前提"] : []),
              ...(omittedEvidence ? ["部分来源未找到相关原文片段或完整上下文超出摘录预算，未作为本轮支持证据"] : []),
              ...(!sources.length ? ["未找到支撑当前判断的原始证据"] : [])])],
          };
        });
      }
      wikiLogger.info({ actionRunId: input.actionRunId, layer: "server", stage: "server.wiki_qa.evidence", selected: evidence.length, supported: supported.length }''')])
(OUT / 'candidate.patch').write_text(''.join(changes))
write(OUT / 'config.json', {
    'version': 13, 'model': 'BAAI/bge-reranker-v2-m3', 'url': 'https://api.siliconflow.cn/v1/rerank',
    'threshold': 0.7, 'recallLimit': 20, 'topN': 5, 'finalLimit': 3,
    'A': {'page': 2400, 'total': 7200}, 'B': {'page': 4800, 'total': 7200},
    'allocationCohort': 'baseline final <=3 pages; reserve all baseline units before extending in rerank order',
    'maxRequests': 40, 'holdoutCases': 32, 'answerCalls': 0, 'judgeCalls': 0,
    'G': 'disabled', 'rawSentToModel': False, 'retune': False,
})
write(OUT / 'initial-freeze.json', {
    'createdAt': datetime.now(timezone.utc).isoformat(), 'authorization': 'user confirmed v13 isolated rerank and raw budget only; no answers; G disabled',
    'baselineCode': manifest(ROOT / 'baseline/server/src'), 'candidateCode': manifest(candidate),
    'knowledge': manifest(ROOT / 'K'), 'sharedApplicationBefore': manifest(REPO / 'server/src'),
    'previousArtifacts': {v: manifest(REPO / 'docs/tasks/ai-ticket' / v) for v in
                          ['wiki-rag-v5', 'wiki-rag-v6', 'wiki-rag-v7', 'wiki-rag-v8-four-cases', 'wiki-rag-v10']},
    'privateInputs': {str(p): sha(p) for p in [Path('/tmp/octo-wiki-rag-v7/inputs.private.json'),
        Path('/tmp/octo-wiki-rag-v8-four-inputs.private.json'), OLD_ROOT / 'holdout-inputs.private.json']},
    'helperSha256': sha(REPO / 'server/examples/wiki-retrieval-eval/primary-budget-v13.mts'),
    'prepareSha256': sha(Path(__file__)), 'configSha256': sha(OUT / 'config.json'),
    'G': 'disabled', 'productionChanges': False,
})
print(json.dumps({'prepared': True, 'sharedApplicationIdentical': True, 'priorArtifactsIntact': True, 'networkCalls': 0,
                  'allocationCohort': 'baseline final pages only', 'G': 'disabled'}))
