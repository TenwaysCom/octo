import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { hash } from './inputs-v7.mts';

// The only network-enabled v7 entrypoint. No extraction/answer/database calls.
process.env.LOG_LEVEL = 'silent';
const root = '/tmp/octo-wiki-rag-v7';
const artifacts = resolve('docs/tasks/ai-ticket/wiki-rag-v7');
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const phase = process.argv[2];
if (!['pilot', 'development', 'holdout', 'stability', 'retry'].includes(phase)) throw new Error('Expected pilot/development/holdout/stability/retry');
const frozen = read(resolve(artifacts, 'freeze.json'));
for (const [name, expected] of Object.entries(frozen)) {
  if (name.endsWith('.json') && hash(readFileSync(resolve(artifacts, name))) !== expected) throw new Error('Frozen input changed: ' + name);
}
const initial = read(resolve(artifacts, 'initial-freeze.json'));
function verifyTree(directory: string, expected: Record<string, string>) {
  const actual: Record<string, string> = {};
  function walk(relative = '') {
    for (const entry of readdirSync(resolve(directory, relative), { withFileTypes: true })) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink()) throw new Error('Unexpected snapshot symlink');
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) actual[name] = hash(readFileSync(resolve(directory, name)));
    }
  }
  walk();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    if (Object.keys(actual).length !== Object.keys(expected).length || Object.entries(expected).some(([name, value]) => actual[name] !== value)) throw new Error('Frozen source or knowledge changed');
  }
}
verifyTree(resolve(root, 'baseline/server/src'), initial.code);
verifyTree(resolve(root, 'K'), initial.knowledge);
if (hash(readFileSync(resolve(root, 'inputs.private.json'))) !== frozen.inputs_private_sha256) throw new Error('Prepared private inputs changed');
const require = createRequire(new URL('../../package.json', import.meta.url));
const env = require('dotenv').parse(readFileSync(resolve('server/.env')));
const config = read(resolve(artifacts, 'config.json'));
for (const [key, value] of Object.entries({ WIKI_QA_RERANK_MODE: config.mode, WIKI_QA_RERANK_MODEL: config.model, WIKI_QA_RERANK_URL: config.url })) {
  if (env[key] !== value) throw new Error('Effective configuration changed: ' + key);
}
if (!env.WIKI_QA_RERANK_API_KEY?.trim()) throw new Error('Configured rerank key is absent');
const { createWikiQaRerankClient } = await import(pathToFileURL(resolve(root, 'baseline/server/src/adapters/ai/wiki-qa-rerank-client.ts')).href);
const rows = read(resolve(root, 'inputs.private.json'));
const cacheDir = resolve(artifacts, 'responses'); mkdirSync(cacheDir, { recursive: true });
const ledger = resolve(artifacts, 'requests.jsonl');
let count = existsSync(ledger) ? readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean).map((x) => JSON.parse(x)).filter((x) => x.event === 'started').length : 0;
let forbiddenFailure = false;
const nativeFetch = globalThis.fetch;
let activeRequest: any;
// Calls are sequential so a request and its ledger record cannot be mismatched.
const fetchImpl: typeof fetch = async (url, options) => {
  if (forbiddenFailure) throw new Error('Earlier authentication or configuration failure; stopping');
  if (count >= config.maxRequests) throw new Error('Authorized request budget exhausted');
  if (String(url) !== config.url || options?.method !== 'POST') throw new Error('Unexpected network destination');
  const payload = JSON.parse(String(options.body));
  if (payload.model !== config.model || payload.return_documents !== false || payload.documents.length > 20) throw new Error('Unexpected model request');
  count += 1;
  appendFileSync(ledger, JSON.stringify({ event: 'started', number: count, time: new Date().toISOString(), phase, ...activeRequest, model: config.model, documents: payload.documents.length }) + '\n');
  const start = Date.now();
  try {
    const response = await nativeFetch(url, options);
    if ([401, 402, 403].includes(response.status)) forbiddenFailure = true;
    let usage;
    try { usage = (await response.clone().json()).usage; } catch { /* No response body is logged. */ }
    appendFileSync(ledger, JSON.stringify({ event: 'response', number: count, phase, durationMs: Date.now() - start, statusCode: response.status, retryAfter: response.headers.get('retry-after'), usage }) + '\n');
    return response;
  } catch (error) {
    appendFileSync(ledger, JSON.stringify({ event: 'transport_failed', number: count, phase, durationMs: Date.now() - start, code: (error as any).code ?? 'TRANSPORT_FAILED' }) + '\n');
    throw error;
  }
};
const client = createWikiQaRerankClient({ env, fetchImpl, diagnosticLog: () => {} });
async function run(row: any, group: string, topN: number, repeat = '') {
  if (!row.documents.length) return;
  const query = group === 'C' && row.queryC ? row.queryC : row.query.question;
  const documents = row.documents.map((d: any) => group === 'A' ? d.A : d.B);
  const payloadHash = hash(JSON.stringify({ model: config.model, query, documents, topN }));
  const file = resolve(cacheDir, payloadHash + (repeat ? '-' + repeat : '') + '.json');
  if (existsSync(file)) {
    const cached = read(file);
    if (cached.state === 'completed') return;
    const retryFile = resolve(cacheDir, payloadHash + '-retry-1.json');
    if (!repeat && existsSync(retryFile) && read(retryFile).state === 'completed') return;
    throw new Error('Preserved failed request requires an explicit inspected retry');
  }
  activeRequest = { caseId: row.id, group, payloadHash, topN, repeat: repeat || undefined };
  const start = Date.now();
  let record;
  try {
    const result = await client.rerank({ query, documents, topN, prompt: '', actionRunId: `v7-${phase}-${row.id}-${group}-${topN}-${repeat}` });
    if (result.mode !== 'rerank') throw new Error('Unexpected general completion');
    record = { ...activeRequest, state: 'completed', model: result.model, results: result.results, durationMs: Date.now() - start,
      querySha256: hash(query), queryChars: query.length, documentSha256: documents.map(hash), documentChars: documents.map((d: string) => d.length),
      candidatePaths: row.candidatePaths, queryCAvailable: Boolean(row.queryC) };
  } catch (error) {
    record = { ...activeRequest, state: 'failed', errorCode: (error as any).code ?? 'EXPERIMENT_FAILED', durationMs: Date.now() - start };
  }
  writeFileSync(file, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify({ phase, count, caseId: row.id, group, topN, state: record.state, durationMs: record.durationMs, errorCode: record.errorCode }) + '\n');
  if (record.state !== 'completed') throw new Error('Model request failed; no automatic retry. Inspect safe result before continuing.');
}
if (phase === 'retry') {
  const [caseId, group] = process.argv.slice(3);
  if (!caseId || !['A', 'B', 'C'].includes(group)) throw new Error('Retry requires case ID and group');
  const row = rows.find((r: any) => r.id === caseId);
  if (!row || row.split !== 'development') throw new Error('Explicit retry is limited to a failed development request');
  const topN = read(resolve(artifacts, 'pilot-decision.json')).mainTopN;
  const query = group === 'C' && row.queryC ? row.queryC : row.query.question;
  const documents = row.documents.map((d: any) => group === 'A' ? d.A : d.B);
  const payloadHash = hash(JSON.stringify({ model: config.model, query, documents, topN }));
  const original = read(resolve(cacheDir, payloadHash + '.json'));
  if (original.state !== 'failed') throw new Error('Only a failed original request can be retried');
  await run(row, group, topN, 'retry-1');
} else if (phase === 'pilot') {
  for (const id of ['D02', 'Q31']) for (const topN of [20, 5]) await run(rows.find((r: any) => r.id === id), 'A', topN);
} else if (phase === 'development') {
  const pilot = read(resolve(artifacts, 'pilot-decision.json'));
  for (const row of rows.filter((r: any) => r.split === 'development')) {
    for (const group of ['A', 'B', 'C']) {
      if (group === 'C' && !row.queryC) continue;
      await run(row, group, pilot.mainTopN);
    }
  }
} else if (phase === 'stability') {
  const pilot = read(resolve(artifacts, 'pilot-decision.json'));
  const locked = read(resolve(artifacts, 'selection-lock.json'));
  for (const id of ['Q02', 'Q18', 'Q21', 'Q31', 'Q32', 'Q34', 'D01', 'D02', 'D04', 'H12']) {
    const row = rows.find((r: any) => r.id === id);
    for (const group of [...new Set(['A', locked.group])]) await run(row, group === 'C' && !row.queryC ? 'B' : group, pilot.mainTopN, 'stability-1');
  }
} else {
  const locked = read(resolve(artifacts, 'selection-lock.json'));
  if (hash(readFileSync(resolve(artifacts, 'development-summary.json'))) !== locked.developmentSummarySha256) throw new Error('Development selection evidence changed');
  const pilot = read(resolve(artifacts, 'pilot-decision.json'));
  for (const row of rows.filter((r: any) => r.split === 'holdout')) {
    await run(row, 'A', pilot.mainTopN);
    await run(row, locked.group === 'C' && !row.queryC ? 'B' : locked.group, pilot.mainTopN);
  }
}
process.stdout.write(JSON.stringify({ phase, state: 'completed', requestsSoFar: count }) + '\n');
