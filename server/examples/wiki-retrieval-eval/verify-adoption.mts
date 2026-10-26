// Adoption regression only: no new cases, policy tuning, models or answers.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createWikiKnowledgeReader } from '../../src/adapters/filesystem/wiki-knowledge-reader.js';

globalThis.fetch = async () => { throw new Error('ADOPTION_NETWORK_FORBIDDEN'); };
process.env.LOG_LEVEL = 'silent'; process.env.WIKI_QA_RECALL_LIMIT = '20';
const root = '/tmp/octo-wiki-rag-v5';
const dir = resolve('docs/tasks/ai-ticket/wiki-rag-v5');
const out = resolve('docs/tasks/ai-ticket/wiki-rag-adoption');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const f = read(resolve(dir, 'freeze.json')), cf = read(resolve(dir, 'candidate-freeze.json'));
if (hash(readFileSync(resolve(dir, 'cases.json'))) !== f.cases_sha256) throw new Error('CASES_CHANGED');
for (const name of ['adapters/filesystem/wiki-knowledge-reader.ts', 'domain/wiki-evidence.ts']) {
  if (hash(readFileSync(resolve('server/src', name))) !== cf.candidate_code[name]) throw new Error('NOT_FROZEN_V5_RECALL_CODE:' + name);
}
const { createWikiKnowledgeReader: frozenReader } = await import(pathToFileURL(resolve(root, 'candidate/server/src/adapters/filesystem/wiki-knowledge-reader.ts')).href);
const cases = read(resolve(dir, 'cases.json')).cases;
const previous = JSON.parse(gunzipSync(readFileSync(resolve(dir, 'verification-run.json.gz'))).toString());
const details: any[] = [];
let primaryChecks = 0;
for (const [arm, knowledge] of [['B', 'K0'], ['D', 'K1']]) {
  const workspaceDir = resolve(root, knowledge);
  const expectedManifest = knowledge === 'K0' ? f.K0 : cf.K1;
  for (const [name, expected] of Object.entries(expectedManifest)) {
    if (hash(readFileSync(resolve(workspaceDir, name))) !== expected) throw new Error('KNOWLEDGE_FREEZE_CHANGED:' + name);
  }
  const app = createWikiKnowledgeReader({ workspaceDir });
  const reference = frozenReader({ workspaceDir });
  for (const c of cases) {
    const actual = await app.search(c.input), expected = await reference.search(c.input);
    if (!isDeepStrictEqual(actual, expected)) throw new Error('READER_DIFF:' + arm + ':' + c.id);
    const recorded = previous.results.find((r: any) => r.group === arm && r.id === c.id);
    if (!isDeepStrictEqual(actual.map(p => p.path), recorded.candidates.map((p: any) => p.path))) throw new Error('FIRST_RECORDED_RANKS_CHANGED');
    for (const [i, p] of actual.entries()) {
      if (hash(p.content) !== recorded.candidates[i].contentSha256) throw new Error('RECORDED_BODY_CHANGED');
      const args = { question: c.input, evidenceIds: p.sourceEvidence.map(s => s.id) };
      const sources = app.selectEvidence!({ candidate: p, ...args });
      const previousSources = reference.selectEvidence({ candidate: expected[i], ...args });
      if (!isDeepStrictEqual(sources, previousSources)) throw new Error('PRIMARY_SELECTION_CHANGED');
      primaryChecks++;
    }
    details.push({ arm, id: c.id, split: c.split,
      positive: c.expected_pages.length > 0, hit20: c.expected_pages.some((path: string) => actual.some(p => p.path === path)),
      candidatePaths: actual.map(p => p.path),
      expectedRanks: Object.fromEntries(c.expected_pages.map((path: string) => [path, actual.findIndex(p => p.path === path) + 1 || null])),
      identicalToFrozenCandidate: true });
  }
}
const summary = ['regression', 'development', 'independent'].map(split => ({ split,
  arms: Object.fromEntries(['B', 'D'].map(arm => {
    const rows = details.filter(r => r.split === split && r.arm === arm && r.positive);
    return [arm, { positive: rows.length, hit20: rows.filter(r => r.hit20).length }];
  })) }));
writeFileSync(resolve(out, 'regression.json'), JSON.stringify({ passed: true, cases: cases.length,
  readerRuns: details.length, primaryChecks, sourceCodeEquivalentToV5: true, summary, details,
  realRerankRequests: 0, answerCalls: 0, judgeCalls: 0, G: 'disabled',
  limits: 'Frozen recall regression only. Changed candidate inputs are not replayed against old rerank scores.' }, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify({ passed: true, cases: cases.length, readerRuns: details.length, primaryChecks, summary }) + '\n');
