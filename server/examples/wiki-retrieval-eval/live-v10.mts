import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { hash, originalDocument } from './inputs-v7.mts';
import { decideThreshold, type ThresholdPolicy } from './threshold-policy-v10.mts';

// Only live rerank calls. No extraction, answer model, database, or shared writes.
process.env.LOG_LEVEL = 'silent'; process.env.WIKI_QA_RECALL_LIMIT = '20'; process.env.WIKI_QA_RERANK_MIN_SCORE = '.7';
const phase = process.argv[2];
if (!['stability', 'holdout'].includes(phase)) throw new Error('Expected stability/holdout');
const out = resolve('docs/tasks/ai-ticket/wiki-rag-v10'); const root = '/tmp/octo-wiki-rag-v10';
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const config = read(resolve(out, 'config.json')); const lock = read(resolve(out, 'selection-lock.json'));
const frozen = read(resolve(out, 'live-code-freeze-r1.json'));
if (hash(readFileSync(new URL(import.meta.url))) !== frozen.liveSha256
  || hash(readFileSync(new URL('./threshold-policy-v10.mts', import.meta.url))) !== frozen.policySha256) throw new Error('Live code changed after freeze');
for (const [file, expected] of Object.entries(frozen.artifacts)) {
  if (hash(readFileSync(resolve(out, file))) !== expected) throw new Error('Locked artifact changed: ' + file);
}
const revision = read(resolve(out, 'candidate-revision-1.json'));
for (const [file, expected] of Object.entries(revision.candidateCode)) {
  if (hash(readFileSync(resolve(root, 'candidate/server/src', file))) !== expected) throw new Error('Candidate changed');
}
if (phase === 'holdout' && (!existsSync(resolve(out, 'stability.json')) || !read(resolve(out, 'stability.json')).passed)) throw new Error('Stable selection is required before holdout');
if (existsSync(resolve(out, phase + '.json'))) throw new Error('First phase result already exists');
const { createWikiKnowledgeReader } = await import(pathToFileURL(resolve(root, 'baseline/server/src/adapters/filesystem/wiki-knowledge-reader.ts')).href);
const { createWikiQaService } = await import(pathToFileURL(resolve(root, 'candidate/server/src/application/services/wiki-qa.service.ts')).href);
const { createWikiQaRerankClient } = await import(pathToFileURL(resolve(root, 'baseline/server/src/adapters/ai/wiki-qa-rerank-client.ts')).href);
const reader = createWikiKnowledgeReader({ workspaceDir: resolve(root, 'K') });
const require = createRequire(new URL('../../package.json', import.meta.url));
const env = require('dotenv').parse(readFileSync(resolve('server/.env')));
for (const [key, expected] of Object.entries({ WIKI_QA_RERANK_MODE: config.mode, WIKI_QA_RERANK_MODEL: config.model, WIKI_QA_RERANK_URL: config.url })) {
  if (env[key]?.trim() !== expected) throw new Error('Effective model configuration changed: ' + key);
}
if (Number(env.WIKI_QA_RERANK_MIN_SCORE || '.7') !== .7 || Number(env.WIKI_QA_RERANK_TIMEOUT_MS || '125000') !== config.timeoutMs) throw new Error('Effective threshold/timeout changed');
const ledger = resolve(out, 'requests.jsonl');
let count = existsSync(ledger) ? readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(r => r.event === 'started').length : 0;
const nativeFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Only the explicitly bounded rerank transport is allowed'); };
let active: any;
const client = createWikiQaRerankClient({ env, diagnosticLog: () => {}, fetchImpl: async (url: any, options: any) => {
  if (String(url) !== config.url || count >= 50) throw new Error('Endpoint or total HTTP budget violation');
  const body = JSON.parse(options.body);
  if (body.model !== config.model || body.top_n !== 5 || hash(JSON.stringify(body.documents)) !== active.documentsSha256 || hash(body.query) !== active.querySha256) throw new Error('Actual wire payload differs');
  const number = ++count; const start = Date.now();
  appendFileSync(ledger, JSON.stringify({ event: 'started', number, phase, caseId: active.id, time: new Date().toISOString(), payloadSha256: hash(options.body), documents: body.documents.length }) + '\n');
  try {
    const response = await nativeFetch(url, options);
    appendFileSync(ledger, JSON.stringify({ event: 'response', number, phase, caseId: active.id, statusCode: response.status, durationMs: Date.now() - start, retryAfter: response.headers.get('retry-after') }) + '\n');
    return response;
  } catch {
    appendFileSync(ledger, JSON.stringify({ event: 'transport_failed', number, phase, caseId: active.id, durationMs: Date.now() - start }) + '\n');
    throw new Error('Bounded rerank transport failed');
  }
} });
const oldInputs = read('/tmp/octo-wiki-rag-v7/inputs.private.json');
const oldInputs8 = read('/tmp/octo-wiki-rag-v8-four-inputs.private.json');
const oldCases8 = read(resolve('docs/tasks/ai-ticket/wiki-rag-v8-four-cases/cases.json'));
const development = read(resolve(out, 'development-normalized.json')).details;
const cases: any[] = phase === 'stability' ? lock.stabilityCases.map((id: string) => {
  const row = development.find((r: any) => r.id === id);
  const input = id.startsWith('E8-') ? oldInputs8.find((r: any) => 'E8-' + r.id === id) : oldInputs.find((r: any) => r.id === id);
  return { id, query: input.query ?? input.input, documents: id.startsWith('E8-') ? input.documents : input.documents.map((d: any) => d.A),
    candidatePaths: input.candidatePaths ?? oldCases8.find((c: any) => 'E8-' + c.id === id).candidatePaths, old: row };
}) : read(resolve(root, 'holdout-inputs.private.json'));
const policies: ThresholdPolicy[] = [
  { strategy: 'A', floor: lock.floor, gap: lock.gap }, { strategy: 'B', floor: lock.floor, gap: lock.gap },
  { strategy: 'C', floor: lock.floor, gap: lock.gap }, { strategy: 'D', floor: lock.floor, gap: lock.gap },
];
const finalSummary = (e: any) => ({ path: e.path.replace(/^docs\/llm-wiki\//, ''), knowledgeType: e.knowledgeType,
  contentChars: e.content.length, contentSha256: hash(e.content), primaryChars: e.sourceEvidence.reduce((n: number, s: any) => n + s.content.length, 0),
  primarySha256: e.sourceEvidence.map((s: any) => hash(s.content)), sourcePaths: e.sourceEvidence.map((s: any) => s.path), applicability: e.applicability });
const results: any[] = [];
for (const row of cases) {
  const candidates = await reader.search(row.query);
  if (JSON.stringify(candidates.map((p: any) => p.sourcePath)) !== JSON.stringify(row.candidatePaths)
    || candidates.some((p: any, i: number) => originalDocument(p) !== row.documents[i])) throw new Error('Frozen recall/input changed');
  active = { id: row.id, querySha256: hash(row.query.question), documentsSha256: hash(JSON.stringify(row.documents)) };
  const file = resolve(out, phase + '-' + row.id + '.json');
  let response: any;
  if (existsSync(file)) {
    response = read(file);
    if (response.failed) throw new Error('Preserved failed request: explicit inspection required; no automatic retry');
  } else {
    try {
      response = await client.rerank({ query: row.query.question, documents: row.documents, topN: 5, prompt: '', actionRunId: 'v10-' + phase + '-' + row.id });
      if (response.mode !== 'rerank') throw new Error('Dedicated result required');
      writeFileSync(file, JSON.stringify(response, null, 2) + '\n', { flag: 'wx' });
    } catch (error) {
      writeFileSync(file, JSON.stringify({ failed: true, errorCode: (error as any).code ?? 'EXPERIMENT_MODEL_FAILED' }) + '\n', { flag: 'wx' });
      throw new Error('Request failed and was preserved; no automatic retry');
    }
  }
  const runs: any[] = [];
  const privateFinal: any[] = [];
  for (const policy of policies) {
    const decision = decideThreshold(response.results, candidates, policy);
    const service = createWikiQaService({ thresholdPolicy: policy,
      reader: { search: async () => candidates, selectEvidence: reader.selectEvidence?.bind(reader) },
      client: { createJsonCompletion: async () => ({ model: 'frozen-extraction-not-called', content: JSON.stringify(row.query) }) },
      rerankClient: { rerank: async () => response }, promptStore: { getByKey: async () => undefined }, extractLog: () => {}, answerLog: () => {} });
    const result = await service.retrieve({ ticketContext: row.query.question, actionRunId: 'v10-consume-' + phase + '-' + row.id + '-' + policy.strategy });
    runs.push({ ...policy, reason: decision.reason, lowFallback: decision.lowFallback, s1: decision.s1, s2: decision.s2, observedGap: decision.gap,
      selected: decision.selected.map(r => ({ path: candidates[r.index].path, score: r.relevance_score })), final: result.evidence.map(finalSummary) });
    privateFinal.push({ strategy: policy.strategy, evidence: result.evidence });
  }
  writeFileSync(resolve(root, phase + '-' + row.id + '-evidence.private.json'), JSON.stringify(privateFinal), { flag: 'wx', mode: 0o600 });
  let comparison: any;
  if (phase === 'stability') {
    const old = row.old.runs.find((r: any) => r.strategy === 'D' && r.floor === lock.floor && r.gap === lock.gap);
    const actual = runs.find(r => r.strategy === 'D');
    const oldFinal = old.final.map(({ title, limitations, ...rest }: any) => rest);
    comparison = { top1Changed: row.old.ranked[0]?.path !== candidates[response.results[0]?.index]?.path,
      eligibilityChanged: old.lowFallback !== actual.lowFallback || JSON.stringify(old.selected.map((r: any) => r.path)) !== JSON.stringify(actual.selected.map((r: any) => r.path)),
      finalChanged: !isDeepStrictEqual(oldFinal, actual.final), oldReason: old.reason, newReason: actual.reason,
      oldTopScore: row.old.ranked[0]?.score, newTopScore: response.results[0]?.relevance_score,
      oldTop1: row.old.ranked[0]?.path, newTop1: candidates[response.results[0]?.index]?.path };
  }
  results.push({ id: row.id, ranked: response.results.map((r: any, i: number) => ({ rank: i + 1, path: candidates[r.index].path, score: r.relevance_score })), runs, comparison });
  process.stdout.write(JSON.stringify({ phase, id: row.id, requestsSoFar: count, comparison }) + '\n');
}
const passed = phase === 'stability' ? results.every(r => !r.comparison.top1Changed && !r.comparison.eligibilityChanged && !r.comparison.finalChanged) : undefined;
writeFileSync(resolve(out, phase + '.json'), JSON.stringify({ phase, cases: results.length, passed, totalRequests: count, originalAssociationEnabled: false, results }, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify({ phase, passed, totalRequests: count, next: phase === 'stability' && !passed ? 'STOP before holdout; no retuning' : 'phase completed' }) + '\n');
