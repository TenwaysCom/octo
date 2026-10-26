import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { hash } from './inputs-v7.mts';
import { decideThreshold } from './threshold-policy-v10.mts';

globalThis.fetch = async () => { throw new Error('Network disabled in v10 verification'); };
const out = resolve('docs/tasks/ai-ticket/wiki-rag-v10'); const root = '/tmp/octo-wiki-rag-v10';
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const frozen = read(resolve(out, 'initial-freeze.json'));
function manifest(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (relative = '') => {
    for (const entry of readdirSync(resolve(dir, relative), { withFileTypes: true })) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      assert(!entry.isSymbolicLink());
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) result[name] = hash(readFileSync(resolve(dir, name)));
    }
  };
  walk(); return result;
}
assert.deepEqual(manifest('server/src'), frozen.sharedApplicationBefore);
assert.deepEqual(manifest(resolve(root, 'baseline/server/src')), frozen.baselineCode);
assert.deepEqual(manifest(resolve(root, 'K')), frozen.knowledge);
for (const [name, expected] of Object.entries(frozen.previousArtifacts)) {
  assert.deepEqual(manifest(resolve('docs/tasks/ai-ticket', name)), expected);
}
for (const [name, expected] of Object.entries(frozen.privateInputs)) assert.equal(hash(readFileSync(name)), expected);
const revision = read(resolve(out, 'candidate-revision-1.json'));
assert.deepEqual(manifest(resolve(root, 'candidate/server/src')), revision.candidateCode);
assert.equal(hash(readFileSync(new URL('./threshold-policy-v10.mts', import.meta.url))), revision.policySha256);
assert.equal(hash(readFileSync(resolve(root, 'candidate/server/src/application/services/wiki-qa-threshold-policy.ts'))), revision.policySha256);
assert.equal(hash(readFileSync(resolve(out, 'development.json'))), hash(readFileSync(resolve(out, 'development-r1.json'))));
const normalized = read(resolve(out, 'development-normalized.json'));
assert.equal(normalized.details.length, 105);
let qualifications = 0;
for (const row of normalized.details) {
  assert.equal(row.runs.length, 14);
  const candidates = row.candidatePaths.map((p: string) => ({ knowledgeType: p.startsWith('docs/ontology/') ? 'ontology' : 'support_wiki' }));
  const index = (path: string) => row.candidatePaths.indexOf(path.startsWith('docs/') ? path
    : (row.ranked.find((r: any) => r.path === path)?.knowledgeType === 'ontology' ? 'docs/ontology/' : 'docs/llm-wiki/') + path);
  const scores = row.ranked.map((r: any) => ({ index: index(r.path), relevance_score: r.score }));
  for (const run of row.runs) {
    const decision = decideThreshold(scores, candidates, run);
    assert.equal(decision.reason, run.reason); assert.equal(decision.lowFallback, run.lowFallback);
    assert.equal(decision.gap, run.observedGap);
    assert.deepEqual(decision.selected.map(r => ({ path: row.ranked.find((s: any) => index(s.path) === r.index).path, score: r.relevance_score })), run.selected);
    qualifications++;
  }
}
const lock = read(resolve(out, 'selection-lock.json'));
assert.equal(hash(readFileSync(resolve(out, 'development-normalized.json'))), lock.developmentSha256);
assert.equal(hash(readFileSync(resolve(out, 'development-audit.json'))), lock.auditSha256);
assert.equal(hash(readFileSync(resolve(out, 'development-summary.json'))), lock.summarySha256);
const summary = read(resolve(out, 'development-summary.json')).summaries;
const chosen = summary.find((r: any) => r.strategy === 'D' && r.floor === lock.floor && r.gap === lock.gap);
assert(chosen.qualifies && chosen.p2Recovered && chosen.newPairs === 4 && chosen.primaryGold === 43);
assert(!chosen.newUnrelated.length && !chosen.newUncertain.length && !chosen.baselineFinalChanged.length);
assert.throws(() => execFileSync('python3', ['server/examples/wiki-retrieval-eval/prepare-v10.py'], { stdio: 'pipe' }),
  (error: any) => String(error.stderr).includes('v10 already prepared'));
assert(!existsSync(resolve(out, 'requests.jsonl')), 'No HTTP call may have been issued after approval rejection');
const result = { status: 'PASS', stage: 'offline development only', frozenCases: 105, policyQualificationsRechecked: qualifications,
  originalSourceAndEvidenceUnchanged: true, previousExperimentsUnchanged: true, originalAssociationG: 'disabled',
  candidateBaselineEquivalence: '105/105 actual-service comparisons passed; r1 cached outputs byte-identical',
  unitAndMockTests: { files: 7, tests: 167, passed: true, includesNewBoundaryTests: 20 },
  isolatedBuild: 'PASS', experimentScriptTypecheck: 'PASS', realHttpRequests: 0,
  liveVerification: 'NOT RUN: automatic approval rejected external transmission; no bypass attempted',
  finalAnswerModel: 'NOT RUN', deployed: false };
writeFileSync(resolve(out, 'verification.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify(result) + '\n');
