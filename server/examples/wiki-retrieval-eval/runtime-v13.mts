import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { hash, originalDocument } from './inputs-v7.mts';
import { allocatePrimaryBudget } from './primary-budget-v13.mts';

export const root = '/tmp/octo-wiki-rag-v13';
export const out = resolve('docs/tasks/ai-ticket/wiki-rag-v13');
export const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
export const normalize = (p: string) => p.replace(/^docs\/llm-wiki\//, '');
process.env.LOG_LEVEL = 'silent'; process.env.WIKI_QA_RECALL_LIMIT = '20'; process.env.WIKI_QA_RERANK_MIN_SCORE = '.7';
const baseline = resolve(root, 'baseline/server/src'); const candidate = resolve(root, 'candidate/server/src');
const { createWikiKnowledgeReader: createA } = await import(pathToFileURL(resolve(baseline, 'adapters/filesystem/wiki-knowledge-reader.ts')).href);
const { createWikiKnowledgeReader: createB } = await import(pathToFileURL(resolve(candidate, 'adapters/filesystem/wiki-knowledge-reader.ts')).href);
const { createWikiQaService: serviceA } = await import(pathToFileURL(resolve(baseline, 'application/services/wiki-qa.service.ts')).href);
const { createWikiQaService: serviceB } = await import(pathToFileURL(resolve(candidate, 'application/services/wiki-qa.service.ts')).href);
export const readerA = createA({ workspaceDir: resolve(root, 'K') });
export const readerB = createB({ workspaceDir: resolve(root, 'K') });
export const safeFinal = (e: any) => ({ path: normalize(e.path), knowledgeType: e.knowledgeType, title: e.title,
  contentChars: e.content.length, contentSha256: hash(e.content),
  primaryChars: e.sourceEvidence.reduce((n: number, s: any) => n + s.content.length, 0),
  sourcePaths: e.sourceEvidence.map((s: any) => s.path), primarySha256: e.sourceEvidence.map((s: any) => hash(s.content)),
  applicability: e.applicability, limitations: e.limitations });

export function assertFreeze() {
  const f = read(resolve(out, 'initial-freeze.json'));
  for (const [folder, files] of [[baseline, f.baselineCode], [candidate, f.candidateCode], [resolve(root, 'K'), f.knowledge]] as const) {
    for (const [name, expected] of Object.entries(files)) if (hash(readFileSync(resolve(folder, name))) !== expected) throw new Error('Freeze changed: ' + folder + '/' + name);
  }
  if (hash(readFileSync(new URL('./primary-budget-v13.mts', import.meta.url))) !== f.helperSha256) throw new Error('Budget policy changed');
}

export async function evaluate(row: any, scores: any[], index: number) {
  const ca = await readerA.search(row.query); const cb = await readerB.search(row.query);
  if (!isDeepStrictEqual(ca, cb)) throw new Error('Reader recall differs ' + row.id);
  if (!isDeepStrictEqual(ca.map((p: any) => p.sourcePath), row.candidatePaths)) throw new Error('Frozen recall changed ' + row.id);
  const documents = ca.map(originalDocument);
  if (!isDeepStrictEqual(documents, row.documents)) throw new Error('Frozen rerank documents changed ' + row.id);
  if (scores.length > 5 || new Set(scores.map(r => r.index)).size !== scores.length
    || scores.some(r => !Number.isInteger(r.index) || r.index < 0 || r.index >= ca.length || !Number.isFinite(r.relevance_score))) throw new Error('Invalid frozen score response');
  const times: Record<string, number> = {}; const results: Record<string, any> = {}; const modelInputs: string[] = [];
  for (const arm of index % 2 ? ['B', 'A'] : ['A', 'B']) {
    const candidates = arm === 'A' ? ca : cb; const reader = arm === 'A' ? readerA : readerB;
    let extractStubs = 0, rerankStubs = 0; let evidenceStarted = 0;
    const service = (arm === 'A' ? serviceA : serviceB)({
      ...(arm === 'B' ? { rawBudget: { page: 4800, total: 7200 } } : {}),
      reader: { search: async () => candidates, selectEvidence: reader.selectEvidence.bind(reader) },
      client: { createJsonCompletion: async () => {
        if (++extractStubs !== 1) throw new Error('Answer/judge forbidden');
        return { model: 'frozen-query-stub-no-model', content: JSON.stringify(row.query) };
      } },
      rerankClient: { rerank: async (input: any) => {
        rerankStubs++;
        if (input.query !== row.query.question || !isDeepStrictEqual(input.documents, documents) || input.topN !== Math.min(5, candidates.length)) throw new Error('Actual rerank wire input differs');
        modelInputs.push(JSON.stringify({ model: 'BAAI/bge-reranker-v2-m3', query: input.query, documents: input.documents, top_n: input.topN, return_documents: false }));
        return { mode: 'rerank', model: 'BAAI/bge-reranker-v2-m3', results: scores };
      } },
      promptStore: { getByKey: async () => undefined }, extractLog: () => {}, answerLog: () => { throw new Error('Answer forbidden'); },
    });
    results[arm] = await service.retrieve({ ticketContext: row.query.question, actionRunId: 'v13-' + arm + '-' + row.id,
      onProgress: (e: any) => {
        if (e.phase === 'answer') throw new Error('Answer forbidden');
        if (e.phase === 'evidence' && e.status === 'started') evidenceStarted = performance.now();
        if (e.phase === 'evidence' && e.status === 'completed') times[arm] = performance.now() - evidenceStarted;
      } });
    if (extractStubs !== 1 || rerankStubs !== Number(Boolean(candidates.length))) throw new Error('Unexpected call count');
    if (!candidates.length) times[arm] = 0;
  }
  if (modelInputs.length && (modelInputs.length !== 2 || modelInputs[0] !== modelInputs[1])) throw new Error('A/B rerank payload differs');
  const a = results.A.evidence, b = results.B.evidence;
  if (!isDeepStrictEqual(a.map((e: any) => e.path), b.map((e: any) => e.path))) throw new Error('Page selection changed');
  if (row.previousFinal) {
    const actual = a.map(safeFinal);
    if (actual.length !== row.previousFinal.length) throw new Error('Previous baseline length changed ' + row.id);
    row.previousFinal.forEach((f: any, i: number) => {
      for (const [k, v] of Object.entries(f)) if (!isDeepStrictEqual(actual[i][k], v)) throw new Error('Previous A changed ' + row.id + ':' + k);
    });
  }
  const plans = a.map((e: any) => {
    const c = cb.find((p: any) => p.sourcePath === e.path || p.path === e.path)!;
    return { key: e.path, existing: e.sourceEvidence, units: readerB.selectEvidence({ candidate: c, question: row.query,
      evidenceIds: c.sourceEvidence.map((s: any) => s.id), maxChars: Number.MAX_SAFE_INTEGER }) };
  });
  const allocation = allocatePrimaryBudget(plans, { page: 4800, total: 7200 });
  for (const e of b) {
    const original = a.find((old: any) => old.path === e.path)!;
    for (const s of original.sourceEvidence) if (!e.sourceEvidence.some((u: any) => isDeepStrictEqual(u, s))) throw new Error('Baseline evidence lost');
    for (const line of original.content.split('\n').filter(Boolean)) if (!e.content.includes(line)) throw new Error('Baseline body lost');
    if (!isDeepStrictEqual(e.sourceEvidence, allocation.pages.find(p => p.key === e.path)!.sources)) throw new Error('Service allocation differs');
    if (safeFinal(e).primaryChars > 4800 || e.applicability !== original.applicability) throw new Error('Page limit/applicability changed');
    const c = cb.find((p: any) => p.sourcePath === e.path || p.path === e.path)!;
    if (e.sourceEvidence.some((s: any) => !c.sourceEvidence.some((u: any) => u.id === s.id && u.path === s.path))) throw new Error('Source association changed / G forbidden');
  }
  if (b.reduce((n: number, e: any) => n + safeFinal(e).primaryChars, 0) > 7200) throw new Error('Total budget exceeded');
  const runs = ['A', 'B'].map(arm => ({ arm, final: results[arm].evidence.map(safeFinal),
    targetBodyAndPrimary: results[arm].evidence.some((e: any) => row.expectedPages.includes(normalize(e.path)) && e.content && e.sourceEvidence.some((s: any) => s.content)),
    explicitWrong: results[arm].evidence.filter((e: any) => row.wrongPages.includes(normalize(e.path))).map((e: any) => normalize(e.path)),
    evidenceMs: times[arm] }));
  const added = b.filter((e: any, i: number) => safeFinal(e).contentSha256 !== safeFinal(a[i]).contentSha256
    || !isDeepStrictEqual(safeFinal(e).primarySha256, safeFinal(a[i]).primarySha256));
  const ranked = scores.map((r: any, i: number) => ({ rank: i + 1, path: ca[r.index].path,
    knowledgeType: ca[r.index].knowledgeType, score: r.relevance_score, qualified: r.relevance_score >= .7 }));
  return { report: { id: row.id, origin: row.origin, type: row.type, question: row.query.question,
    expectedPages: row.expectedPages, wrongPages: row.wrongPages, candidatePaths: row.candidatePaths,
    wireSha256: modelInputs.length ? hash(modelInputs[0]) : null, ranked,
    targets: row.expectedPages.map((p: string) => ({ path: p, recallRank: ca.findIndex((c: any) => c.path === p) + 1 || null,
      rerank: ranked.find((r: any) => r.path === p) ?? null })), runs, allocation: { reserved: allocation.reserved, used: allocation.used, decisions: allocation.decisions },
    changedPages: added.map((e: any) => normalize(e.path)), baselineExact: true, sourceAssociationUnchanged: true },
    audit: added.map((e: any) => ({ id: row.id, type: row.type, question: row.query.question, expectedPages: row.expectedPages,
      wrongPages: row.wrongPages, baseline: a.find((v: any) => v.path === e.path), candidate: e })),
    privateResults: { id: row.id, query: row.query, A: results.A, B: results.B } };
}
