import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { hash, originalDocument } from './inputs-v7.mts';

// Four new incidents only. v7 evidence remains immutable; no production changes.
process.env.LOG_LEVEL = 'silent'; process.env.WIKI_QA_RECALL_LIMIT = '20'; process.env.WIKI_QA_RERANK_MIN_SCORE = '0.7';
const phase = process.argv[2];
if (!['prepare', 'run'].includes(phase)) throw new Error('Use prepare or run');
const root = '/tmp/octo-wiki-rag-v7';
const artifacts = resolve('docs/tasks/ai-ticket/wiki-rag-v8-four-cases');
const privateFile = '/tmp/octo-wiki-rag-v8-four-inputs.private.json';
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const config = read(resolve('docs/tasks/ai-ticket/wiki-rag-v7/config.json'));
const originalFreeze = read(resolve('docs/tasks/ai-ticket/wiki-rag-v7/initial-freeze.json'));
for (const [name, expected] of Object.entries(originalFreeze.code)) {
  if (hash(readFileSync(resolve(root, 'baseline/server/src', name))) !== expected) throw new Error('Frozen source changed');
}
for (const [name, expected] of Object.entries(originalFreeze.knowledge)) {
  if (hash(readFileSync(resolve(root, 'K', name))) !== expected) throw new Error('Frozen knowledge changed');
}
const source = resolve(root, 'baseline/server/src');
const { createWikiKnowledgeReader } = await import(pathToFileURL(resolve(source, 'adapters/filesystem/wiki-knowledge-reader.ts')).href);
const { createWikiQaService } = await import(pathToFileURL(resolve(source, 'application/services/wiki-qa.service.ts')).href);
const { createWikiQaRerankClient } = await import(pathToFileURL(resolve(source, 'adapters/ai/wiki-qa-rerank-client.ts')).href);
const { wikiQuestionSchema } = await import(pathToFileURL(resolve(source, 'domain/wiki-qa.ts')).href);
const reader = createWikiKnowledgeReader({ workspaceDir: resolve(root, 'K') });
if (phase === 'prepare') {
  globalThis.fetch = async () => { throw new Error('Network disabled during preparation'); };
  if (existsSync(artifacts) || existsSync(privateFile)) throw new Error('Four-case experiment already exists; do not overwrite');
  const cases = [
    { id: 'P1', type: 'positive', ticket: 1969, question: 'Review Journal Items只选80条数据，五分钟还在loading，怎样排查凭证复核很慢？', keywords: ['review', 'journal items', 'loading', '复核'], objects: ['account.move.line'],
      expected: 'concepts/accounting/journal-review-latency-history.md', wrong: null, source: 'raw/transcripts/ticket-1969.2026-09-11-f120c91acc35.md', requestOrdinals: ['M1'], boundary: '40条仅建议；后续500条变快及提速报告不证明缩批根因或当前恢复' },
    { id: 'P2', type: 'positive', ticket: 718, question: 'How do I remove or delete a document from the Sign app in Odoo?', keywords: ['Sign', 'remove document', 'delete document'], objects: ['Sign'],
      expected: 'concepts/workforce/sign-document-archive-history.md', wrong: null, source: 'raw/transcripts/ticket-718.2026-09-11-953d80ac6ecc.md', requestOrdinals: ['M1'], boundary: '历史答复Archive，不证明永久删除、当前权限或签署记录处置' },
    { id: 'N1', type: 'negative_pair', ticket: 954, question: 'Sign中非流程相关人员是否可以查看待签合同？', keywords: ['Sign'], objects: ['Sign'],
      expected: 'concepts/workforce/employee-contract-sign-privacy-history.md', wrong: 'concepts/workforce/sign-document-archive-history.md', source: 'raw/transcripts/ticket-954.2026-09-11-5cd7e490ed78.md', requestOrdinals: ['M1', 'M3'], boundary: '合同读取权限与文档归档不同；历史角色说明未做服务端授权验证，不能输出永久白名单' },
    { id: 'N2', type: 'negative_pair', ticket: 1961, question: 'US复制凭证为什么把原来的Review时间也复制过来了？', keywords: ['review', 'journal'], objects: [],
      expected: 'concepts/accounting/journal-review-copy-history.md', wrong: 'concepts/accounting/journal-review-latency-history.md', source: 'raw/transcripts/ticket-1961.2026-09-11-78705682c139.md', requestOrdinals: ['M1', 'M2'], boundary: '复制／修改后审计字段继承，不是批量Review加载慢；原票日期描述矛盾、无当前审计验证' },
  ];
  const used = new Set<string>(['2223', '2238', '2237']);
  for (const version of ['v5', 'v6', 'v7']) for (const c of read(resolve(`docs/tasks/ai-ticket/wiki-rag-${version}/cases.json`)).cases) {
    for (const ticket of c.source_tickets ?? []) used.add(String(ticket));
    if (c.current_ticket) used.add(String(c.current_ticket));
  }
  mkdirSync(artifacts);
  const inputs: any[] = [];
  const publicCases: any[] = [];
  for (const c of cases) {
    if (used.has(String(c.ticket))) throw new Error('Repeated event: ' + c.ticket);
    const input = wikiQuestionSchema.parse({ question: c.question, keywords: c.keywords, objects: c.objects, environments: [] });
    const candidates = await reader.search(input);
    const rank20 = (path: string | null) => path ? candidates.findIndex((p: any) => p.path === path) + 1 || null : null;
    if (!rank20(c.expected) || (c.wrong && !rank20(c.wrong))) throw new Error('Expected/negative page not actually recalled: ' + c.id);
    const documents = candidates.map(originalDocument);
    const sourceText = readFileSync(resolve(root, 'K/docs/llm-wiki', c.source), 'utf8');
    if (!sourceText.includes('## 线程消息')) throw new Error('Original request missing');
    const expectedText = readFileSync(resolve(root, 'K/docs/llm-wiki', c.expected), 'utf8');
    if (!expectedText.includes(c.source)) throw new Error('Expected article does not cite current case');
    const sourceHashes = Object.fromEntries([c.source, c.expected, ...(c.wrong ? [c.wrong] : [])].map((p) => [p, hash(readFileSync(resolve(root, 'K/docs/llm-wiki', p)))]));
    publicCases.push({ ...c, input, inputOrigin: 'manual paraphrase of verified original current request; no reply or gold text inserted', rank20: { expected: rank20(c.expected), wrong: rank20(c.wrong) }, sourceHashes,
      candidatePaths: candidates.map((p: any) => p.sourcePath), querySha256: hash(input.question), documentSha256: documents.map(hash), documentChars: documents.map((d: string) => d.length) });
    inputs.push({ id: c.id, input, documents });
  }
  writeFileSync(resolve(artifacts, 'cases.json'), JSON.stringify(publicCases, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(privateFile, JSON.stringify(inputs), { flag: 'wx', mode: 0o600 });
  writeFileSync(resolve(artifacts, 'freeze.json'), JSON.stringify({ casesSha256: hash(readFileSync(resolve(artifacts, 'cases.json'))), privateInputSha256: hash(readFileSync(privateFile)), codeSha256: hash(readFileSync(new URL(import.meta.url))),
    v7InitialFreezeSha256: hash(readFileSync(resolve('docs/tasks/ai-ticket/wiki-rag-v7/initial-freeze.json'))), config: { mode: config.mode, model: config.model, url: config.url, minScore: 0.7, topN: 5, maxRequests: 6 }, labelsFrozenBeforeScores: true }, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify(publicCases.map((c) => ({ id: c.id, ticket: c.ticket, rank20: c.rank20 }))) + '\n');
} else {
  const frozen = read(resolve(artifacts, 'freeze.json'));
  if (hash(readFileSync(resolve(artifacts, 'cases.json'))) !== frozen.casesSha256 || hash(readFileSync(privateFile)) !== frozen.privateInputSha256 || hash(readFileSync(new URL(import.meta.url))) !== frozen.codeSha256) throw new Error('Frozen experiment changed');
  if (existsSync(resolve(artifacts, 'results.json'))) throw new Error('First result exists; do not repeat or overwrite');
  const require = createRequire(new URL('../../package.json', import.meta.url));
  const env = require('dotenv').parse(readFileSync(resolve('server/.env')));
  if (env.WIKI_QA_RERANK_MODE !== config.mode || env.WIKI_QA_RERANK_MODEL !== config.model || env.WIKI_QA_RERANK_URL !== config.url || Number(env.WIKI_QA_RERANK_MIN_SCORE || '.7') !== .7) throw new Error('Effective strategy changed');
  const ledger = resolve(artifacts, 'requests.jsonl');
  let count = existsSync(ledger) ? readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((r) => r.event === 'started').length : 0;
  const nativeFetch = globalThis.fetch;
  let active: any;
  const client = createWikiQaRerankClient({ env, diagnosticLog: () => {}, fetchImpl: async (url: any, options: any) => {
    if (++count > 6 || String(url) !== config.url) throw new Error('Request budget or endpoint mismatch');
    const start = Date.now(); appendFileSync(ledger, JSON.stringify({ event: 'started', number: count, ...active, time: new Date().toISOString() }) + '\n');
    const response = await nativeFetch(url, options);
    appendFileSync(ledger, JSON.stringify({ event: 'response', number: count, statusCode: response.status, durationMs: Date.now() - start }) + '\n'); return response;
  } });
  const cases = read(resolve(artifacts, 'cases.json'));
  const inputs = read(privateFile);
  const results: any[] = [];
  for (const c of cases) {
    const row = inputs.find((r: any) => r.id === c.id);
    const candidates = await reader.search(row.input);
    if (JSON.stringify(candidates.map((p: any) => p.sourcePath)) !== JSON.stringify(c.candidatePaths) || candidates.some((p: any, i: number) => hash(originalDocument(p)) !== c.documentSha256[i])) throw new Error('Recall changed');
    const request = async (topN: number) => {
      active = { caseId: c.id, topN, payloadSha256: hash(JSON.stringify({ query: row.input.question, documents: row.documents, topN })) };
      const file = resolve(artifacts, c.id + '-top' + topN + '.json');
      if (existsSync(file)) return read(file);
      const response = await client.rerank({ query: row.input.question, documents: row.documents, topN, prompt: '', actionRunId: 'v8-four-' + c.id + '-' + topN });
      if (response.mode !== 'rerank') throw new Error('Dedicated result expected');
      writeFileSync(file, JSON.stringify(response, null, 2) + '\n', { flag: 'wx' }); return response;
    };
    const actual = await request(5);
    const score = (path: string | null, response: any) => { const rank = path ? response.results.findIndex((r: any) => candidates[r.index].path === path) : -1; return rank < 0 ? null : { rank: rank + 1, score: response.results[rank].relevance_score }; };
    const diagnostic = c.wrong && !score(c.wrong, actual) ? await request(20) : null;
    const service = createWikiQaService({ reader: { search: async () => candidates, selectEvidence: reader.selectEvidence?.bind(reader) },
      client: { createJsonCompletion: async () => ({ model: 'frozen-extraction-not-called', content: JSON.stringify(row.input) }) },
      rerankClient: { rerank: async () => actual }, promptStore: { getByKey: async () => undefined }, extractLog: () => {}, answerLog: () => {} });
    const consumed = await service.retrieve({ ticketContext: row.input.question, actionRunId: 'v8-four-consume-' + c.id });
    const result = { id: c.id, ticket: c.ticket, type: c.type, rank20: c.rank20, expected: score(c.expected, actual), wrong: score(c.wrong, actual),
      wrongDiagnosticOnly: diagnostic ? score(c.wrong, diagnostic) : null, expectedAccepted: actual.results.some((r: any) => candidates[r.index].path === c.expected && r.relevance_score >= .7),
      wrongAccepted: actual.results.some((r: any) => candidates[r.index].path === c.wrong && r.relevance_score >= .7),
      top5: actual.results.map((r: any, index: number) => ({ rank: index + 1, path: candidates[r.index].path, score: r.relevance_score })),
      final: consumed.evidence.map((e: any) => ({ path: e.path, contentChars: e.content.length, primaryChars: e.sourceEvidence.reduce((n: number, s: any) => n + s.content.length, 0), sourcePaths: e.sourceEvidence.map((s: any) => s.path), applicability: e.applicability, limitations: e.limitations })) };
    results.push(result);
    process.stdout.write(JSON.stringify(result) + '\n');
  }
  writeFileSync(resolve(artifacts, 'results.json'), JSON.stringify({ model: config.model, minScore: .7, requests: count, sourceAssociation: 'unchanged baseline; G disabled', results }, null, 2) + '\n', { flag: 'wx' });
}
