import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { originalDocument, describedDocument, hash, DOCUMENT_BUDGET } from './inputs-v7.mts';
import { createWikiQaRerankClient } from '../../src/adapters/ai/wiki-qa-rerank-client.js';
import { createWikiQaService } from '../../src/application/services/wiki-qa.service.js';
import { createWikiKnowledgeReader } from '../../src/adapters/filesystem/wiki-knowledge-reader.js';

// No real network: verify the relevance experiment cannot send its unused prompt.
const calls: any[] = [];
const client = createWikiQaRerankClient({
  env: { WIKI_QA_RERANK_MODE: 'rerank', WIKI_QA_RERANK_MODEL: 'fixture-model', WIKI_QA_RERANK_URL: 'https://example.test/rerank' },
  fetchImpl: async (_url, options) => { calls.push(JSON.parse(String(options?.body))); return new Response(JSON.stringify({ results: [{ index: 0, relevance_score: 0.7 }] })); },
  diagnosticLog: () => {},
});
await client.rerank({ query: 'current issue', documents: ['frozen article'], topN: 1, prompt: 'UNUSED PRIVATE PROMPT', actionRunId: 'v7-mock-protocol' });
assert.deepEqual(Object.keys(calls[0]).sort(), ['documents', 'model', 'query', 'return_documents', 'top_n']);
assert(!JSON.stringify(calls).includes('UNUSED PRIVATE PROMPT'));

const candidate = { title: 'Invoice failure', environments: [], content: '# Failure\nUseful [source](raw/transcripts/a.md)', status: 'draft', historicalOnly: true, limitations: ['原因未确认'] };
assert.equal(originalDocument(candidate), JSON.stringify({ title: candidate.title, environments: [], content: '# Failure\nUseful source' }));
const match = (text: string, terms: string[]) => terms.filter((term) => text.includes(term)).length;
const page = '---\nsummary: 历史说明，不证明本票同因\n---\n# Invoice failure\nUseful invoice issue.\n\n## 前提与限制\n仅历史参考，未解决。\n\n## 无关大段\n' + 'x'.repeat(5000);
const prepared = describedDocument(candidate, page, ['invoice'], match);
assert(prepared.document.includes('仅历史参考，未解决。'));
assert(prepared.document.includes('历史说明，不证明本票同因'));
assert(!prepared.document.includes('x'.repeat(100)));
assert(prepared.document.length <= DOCUMENT_BUDGET);
const refused = describedDocument(candidate, '# Invoice\nissue\n\n## 前提与限制\n' + 'x'.repeat(5000), ['Invoice'], match);
assert.equal((refused.diagnostics as any).reason, 'guard_budget_refusal');
assert(!refused.document.includes('x'.repeat(100)));

const artifacts = resolve('docs/tasks/ai-ticket/wiki-rag-v7');
const frozen = JSON.parse(readFileSync(resolve(artifacts, 'freeze.json'), 'utf8'));
for (const [name, expected] of Object.entries(frozen)) if (name.endsWith('.json')) assert.equal(hash(readFileSync(resolve(artifacts, name))), expected);
const rows = JSON.parse(readFileSync('/tmp/octo-wiki-rag-v7/inputs.private.json', 'utf8'));
const known = rows.find((row: any) => row.id === 'D01');
let productionRequest: any;
const service = createWikiQaService({
  reader: createWikiKnowledgeReader({ workspaceDir: '/tmp/octo-wiki-rag-v7/K' }),
  client: { createJsonCompletion: async () => ({ model: 'frozen-extraction', content: JSON.stringify(known.query) }) },
  rerankClient: { rerank: async (input) => { productionRequest = input; return { mode: 'rerank', model: 'mock-no-network', results: [] }; } },
  promptStore: { getByKey: async () => undefined }, extractLog: () => {}, answerLog: () => {},
});
await service.retrieve({ ticketContext: known.query.question, actionRunId: 'v7-mock-actual-service-input' });
assert.equal(productionRequest.query, known.query.question);
assert.deepEqual(productionRequest.documents, known.documents.map((document: any) => document.A));
assert.equal(productionRequest.topN, 5);
assert.equal(hash(readFileSync('/tmp/octo-wiki-rag-v7/inputs.private.json')), frozen.inputs_private_sha256);
assert.throws(() => execFileSync(process.execPath, ['--import', './server/node_modules/tsx/dist/loader.mjs', 'server/examples/wiki-retrieval-eval/prepare-v7.mts'], { stdio: 'pipe', env: { ...process.env, LOG_LEVEL: 'silent' } }),
  (error: any) => error.status === 1 && String(error.stderr).includes('Frozen v7 inputs already exist'));
assert.equal(hash(readFileSync('/tmp/octo-wiki-rag-v7/inputs.private.json')), frozen.inputs_private_sha256);
assert.equal(rows.filter((row: any) => row.split === 'holdout').length, 24);
for (const row of rows) {
  for (const document of row.documents) {
    assert(document.A.length <= DOCUMENT_BUDGET && document.B.length <= DOCUMENT_BUDGET);
    assert(!document.A.includes('raw/transcripts/') && !document.B.includes('raw/transcripts/'));
  }
  if (row.queryC) assert(row.queryC.length <= 2000);
}
process.stdout.write(JSON.stringify({ checks: 'PASS', mockProtocol: 'dedicated request does not contain prompt; A matches actual service request', boundaries: ['whole guards retained', 'oversized guards refused', 'frozen input hashes', 'frozen preparation refuses overwrite', 'all document/query budgets'], realModelCalls: 0 }) + '\n');
