import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { hash } from './inputs-v7.mts';
import { decideThreshold } from './threshold-policy-v10.mts';

globalThis.fetch = async () => { throw new Error('Network disabled during live-result verification'); };
const out = resolve('docs/tasks/ai-ticket/wiki-rag-v10'); const root = '/tmp/octo-wiki-rag-v10';
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const initial = read(resolve(out, 'initial-freeze.json'));
function manifest(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (relative = '') => {
    for (const e of readdirSync(resolve(dir, relative), { withFileTypes: true })) {
      const name = relative ? relative + '/' + e.name : e.name;
      assert(!e.isSymbolicLink());
      if (e.isDirectory()) walk(name);
      else if (e.isFile()) result[name] = hash(readFileSync(resolve(dir, name)));
    }
  };
  walk(); return result;
}
assert.deepEqual(manifest('server/src'), initial.sharedApplicationBefore);
assert.deepEqual(manifest(resolve(root, 'baseline/server/src')), initial.baselineCode);
assert.deepEqual(manifest(resolve(root, 'K')), initial.knowledge);
assert.deepEqual(manifest(resolve(root, 'candidate/server/src')), read(resolve(out, 'candidate-revision-1.json')).candidateCode);
for (const [version, files] of Object.entries(initial.previousArtifacts)) assert.deepEqual(manifest(resolve('docs/tasks/ai-ticket', version)), files);
for (const [path, expected] of Object.entries(initial.privateInputs)) assert.equal(hash(readFileSync(path)), expected);
for (const [path, expected] of Object.entries(read(resolve(out, 'artifact-sha256.offline.json')).files)) assert.equal(hash(readFileSync(resolve(out, path))), expected);
const frozenLive = read(resolve(out, 'live-code-freeze-r1.json'));
assert.equal(hash(readFileSync(new URL('./live-v10.mts', import.meta.url))), frozenLive.liveSha256);
assert.equal(hash(readFileSync(new URL('./threshold-policy-v10.mts', import.meta.url))), frozenLive.policySha256);
for (const [name, expected] of Object.entries(frozenLive.artifacts)) assert.equal(hash(readFileSync(resolve(out, name))), expected);
const frozen = read(resolve(out, 'holdout-freeze.json'));
assert.equal(hash(readFileSync(resolve(out, 'holdout-cases.json'))), frozen.casesSha256);
assert.equal(hash(readFileSync(resolve(root, 'holdout-inputs.private.json'))), frozen.privateInputSha256);
assert.equal(hash(readFileSync(resolve(out, 'selection-lock.json'))), frozen.selectionSha256);
assert.equal(hash(readFileSync(resolve(out, 'stability.json'))), frozen.stabilitySha256);
for (const [name, expected] of Object.entries(frozen.code)) assert.equal(hash(readFileSync(new URL('./' + name, import.meta.url))), expected);
const stability = read(resolve(out, 'stability.json')); const holdout = read(resolve(out, 'holdout.json'));
assert(stability.passed && stability.cases === 10 && holdout.cases === 32);
const privateRows = read(resolve(root, 'holdout-inputs.private.json'));
const old = read('/tmp/octo-wiki-rag-v7/inputs.private.json'); const old8 = read('/tmp/octo-wiki-rag-v8-four-inputs.private.json');
const ledger = readFileSync(resolve(out, 'requests.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
const starts = ledger.filter(r => r.event === 'started'); const responses = ledger.filter(r => r.event === 'response');
assert.equal(starts.length, 42); assert.equal(responses.length, 42); assert(starts.length <= 50);
assert.deepEqual(starts.map(r => r.number), Array.from({ length: 42 }, (_, i) => i + 1));
assert.equal(ledger.filter(r => r.event === 'transport_failed').length, 0);
const model = read(resolve(out, 'config.json')).model;
let policyDecisions = 0;
for (const started of starts) {
  assert(responses.some(r => r.number === started.number && r.statusCode === 200 && r.caseId === started.caseId));
  let input: any;
  if (started.phase === 'holdout') input = privateRows.find((r: any) => r.id === started.caseId);
  else if (started.caseId.startsWith('E8-')) {
    const row = old8.find((r: any) => 'E8-' + r.id === started.caseId);
    input = { query: row.input, documents: row.documents, candidatePaths: read(resolve(out, 'development-normalized.json')).details.find((r: any) => r.id === started.caseId).candidatePaths };
  } else {
    const row = old.find((r: any) => r.id === started.caseId);
    input = { query: row.query, documents: row.documents.map((d: any) => d.A), candidatePaths: row.candidatePaths };
  }
  const payload = { model, query: input.query.question, documents: input.documents, top_n: 5, return_documents: false };
  assert.equal(hash(JSON.stringify(payload)), started.payloadSha256);
  const result = read(resolve(out, started.phase + '-' + started.caseId + '.json'));
  assert.equal(result.mode, 'rerank'); assert.equal(result.results.length, 5);
  const row = (started.phase === 'stability' ? stability : holdout).results.find((r: any) => r.id === started.caseId);
  const candidates = input.candidatePaths.map((path: string) => ({ knowledgeType: path.startsWith('docs/ontology/') ? 'ontology' : 'support_wiki' }));
  const pathAt = (index: number) => {
    const path: string = input.candidatePaths[index];
    return path.replace(/^docs\/(?:ontology|llm-wiki)\//, '');
  };
  for (const run of row.runs) {
    const decision = decideThreshold(result.results, candidates, run);
    assert.equal(run.reason, decision.reason); assert.equal(run.lowFallback, decision.lowFallback);
    assert.equal(run.observedGap, decision.gap);
    assert.deepEqual(run.selected, decision.selected.map(r => ({ path: pathAt(r.index), score: r.relevance_score })));
    assert(run.final.length <= 3);
    assert(run.final.every((e: any) => e.primaryChars <= 2400));
    if (decision.lowFallback) assert(run.final.every((e: any) => e.contentChars && e.primaryChars && e.applicability === 'historical_reference' && e.knowledgeType === 'support_wiki'));
    policyDecisions++;
  }
}
const firstHoldout = starts.find(r => r.phase === 'holdout');
assert(statSync(resolve(out, 'holdout-freeze.json')).mtimeMs <= Date.parse(firstHoldout.time));
assert(holdout.results.every((r: any) => JSON.stringify(r.runs.find((x: any) => x.strategy === 'A').final) === JSON.stringify(r.runs.find((x: any) => x.strategy === 'D').final)));
const cases = read(resolve(out, 'holdout-cases.json')).cases;
assert.equal(new Set(cases.map((c: any) => c.ticket)).size, 32);
const latencies = responses.map(r => r.durationMs).sort((a, b) => a - b);
const lowIds = read(resolve(out, 'holdout-summary.json')).lowTop1PositiveCoverage;
assert.equal(lowIds.observed, 3);
const verification = { status: 'PASS: evidence integrity and execution; quality decision remains NOT_ACCEPTED',
  requests: { total: 42, success200: 42, failures: 0, retries: 0, cap: 50, latencyMedianMs: latencies[Math.floor(latencies.length / 2)], latencyP95Ms: latencies[Math.ceil(latencies.length * .95) - 1] },
  stabilityCases: 10, independentCases: 32, recomputedPolicyDecisions: policyDecisions,
  inputsFrozenBeforeHoldoutScores: true, allWirePayloadHashesVerified: true,
  oldArtifactsAndSourceUnchanged: true, rawBudgetUnchanged: 2400, G: 'disabled',
  unitAndMockTests: '167 passed previously; candidate source unchanged', isolatedBuild: 'passed previously; candidate source unchanged',
  newScriptTypecheck: 'PASS', extractionAndAnswerModels: 'NOT CALLED', finalAnswerQuality: 'NOT TESTED', deployed: false };
writeFileSync(resolve(out, 'live-verification.json'), JSON.stringify(verification, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify(verification) + '\n');
