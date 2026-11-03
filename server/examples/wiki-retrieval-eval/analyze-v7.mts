import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash } from './inputs-v7.mts';

// Uses real cached BGE scores with the unchanged production evidence pipeline.
// Extraction is frozen; there are no network requests or answer generation.
globalThis.fetch = async () => { throw new Error('Network disabled during score analysis'); };
process.env.LOG_LEVEL = 'silent'; process.env.WIKI_QA_RECALL_LIMIT = '20';
const phase = process.argv[2];
if (!['development', 'holdout'].includes(phase)) throw new Error('Expected development/holdout');
const root = '/tmp/octo-wiki-rag-v7';
const artifacts = resolve('docs/tasks/ai-ticket/wiki-rag-v7');
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const config = read(resolve(artifacts, 'config.json'));
const cases = read(resolve(artifacts, 'cases.json')).cases;
const inputs = read(resolve(root, 'inputs.private.json'));
const prompts = read(resolve(artifacts, 'effective-prompts.json')).prompts;
const topN = read(resolve(artifacts, 'pilot-decision.json')).mainTopN;
const sourceRoot = resolve(root, 'baseline/server/src');
const { createWikiKnowledgeReader } = await import(pathToFileURL(resolve(sourceRoot, 'adapters/filesystem/wiki-knowledge-reader.ts')).href);
const { createWikiQaService } = await import(pathToFileURL(resolve(sourceRoot, 'application/services/wiki-qa.service.ts')).href);
const reader = createWikiKnowledgeReader({ workspaceDir: resolve(root, 'K') });
const selection = phase === 'holdout' ? read(resolve(artifacts, 'selection-lock.json')) : null;
const details: any[] = [];
for (const c of cases.filter((c: any) => c.split === phase)) {
  const row = inputs.find((r: any) => r.id === c.id);
  const candidates = await reader.search(row.query);
  if (JSON.stringify(candidates.map((p: any) => p.sourcePath)) !== JSON.stringify(row.candidatePaths)) throw new Error('Frozen Top20 differs: ' + c.id);
  if (candidates.some((p: any, i: number) => hash(p.content) !== row.documents[i].originalContentHash)) throw new Error('Frozen candidate contents differ');
  const groups: string[] = phase === 'development' ? ['A', 'B', 'C'] : [...new Set(['A', selection.group])];
  for (const group of groups) {
    const effective = group === 'C' && !row.queryC ? 'B' : group;
    const query = effective === 'C' ? row.queryC : row.query.question;
    const documents = row.documents.map((d: any) => effective === 'A' ? d.A : d.B);
    const payloadHash = hash(JSON.stringify({ model: config.model, query, documents, topN }));
    let cached = candidates.length ? read(resolve(artifacts, 'responses', payloadHash + '.json')) : { state: 'completed', results: [] };
    if (cached.state === 'failed' && existsSync(resolve(artifacts, 'responses', payloadHash + '-retry-1.json'))) cached = read(resolve(artifacts, 'responses', payloadHash + '-retry-1.json'));
    if (cached.state !== 'completed') throw new Error('Cached model request failed: ' + c.id + ' ' + group);
    const ranked = cached.results.slice(0, 5);
    const expected = new Set(c.expected_pages);
    const wrong = new Set(c.wrong_pages ?? []);
    const rank = ranked.findIndex((r: any) => expected.has(candidates[r.index].path)) + 1 || null;
    const thresholds = phase === 'development' ? config.thresholdGrid : [...new Set([0.7, selection.threshold])];
    const consumed = [];
    for (const threshold of thresholds) {
      process.env.WIKI_QA_RERANK_MIN_SCORE = String(threshold);
      const service = createWikiQaService({
        reader: { search: async () => candidates, selectEvidence: reader.selectEvidence?.bind(reader) },
        client: { createJsonCompletion: async () => ({ model: 'frozen-extraction-not-called', content: JSON.stringify(row.query) }) },
        rerankClient: { rerank: async () => ({ mode: 'rerank', model: cached.model ?? config.model, results: ranked }) },
        promptStore: { getByKey: async (key: string) => Object.values(prompts).find((p: any) => p.key === key) },
        extractLog: () => {}, answerLog: () => {},
      });
      const result = await service.retrieve({ ticketContext: row.query.question, actionRunId: `v7-offline-consume-${c.id}-${group}-${threshold}` });
      const accepted = ranked.filter((r: any) => r.relevance_score >= threshold).map((r: any) => candidates[r.index].path);
      consumed.push({ threshold, accepted, acceptedGold: accepted.some((p: string) => expected.has(p)),
        acceptedWrong: accepted.filter((p: string) => wrong.has(p)),
        final: result.evidence.map((e: any) => ({ path: e.path, knowledgeType: e.knowledgeType, contentChars: e.content.length, contentSha256: hash(e.content),
          sourcePaths: e.sourceEvidence.map((s: any) => s.path), primaryChars: e.sourceEvidence.reduce((n: number, s: any) => n + s.content.length, 0),
          primaryOrdinals: e.sourceEvidence.map((s: any) => s.content.match(/^[MP]\d+$/gm) ?? []), applicability: e.applicability, limitations: e.limitations,
          isGold: expected.has(e.path.replace(/^docs\/llm-wiki\//, '')), isExplicitWrong: wrong.has(e.path.replace(/^docs\/llm-wiki\//, '')) })) });
    }
    details.push({ id: c.id, group, effectiveGroup: effective, queryCAvailable: Boolean(row.queryC), type: c.type,
      expectedPages: c.expected_pages, wrongPages: c.wrong_pages, positive: c.expected_pages.length > 0,
      goldInTop20: candidates.some((p: any) => expected.has(p.path)), candidateCount: candidates.length,
      expectedRank5: rank, rr5: rank ? 1 / rank : 0,
      ranked: ranked.map((r: any, index: number) => ({ rank: index + 1, path: candidates[r.index].path, knowledgeType: candidates[r.index].knowledgeType, score: r.relevance_score,
        isGold: expected.has(candidates[r.index].path), isExplicitWrong: wrong.has(candidates[r.index].path) })), thresholds: consumed });
  }
}
const summaries: any[] = [];
const groups: string[] = [...new Set(details.map((r) => r.group))];
for (const group of groups) {
  const rows = details.filter((r) => r.group === group);
  const positive = rows.filter((r) => r.positive);
  const eligible = positive.filter((r) => r.goldInTop20);
  const thresholds: number[] = phase === 'development' ? config.thresholdGrid : [...new Set([0.7, selection.threshold])];
  for (const threshold of thresholds) {
    const get = (r: any) => r.thresholds.find((x: any) => x.threshold === threshold);
    const noAnswer = rows.filter((r) => phase === 'holdout' ? r.type === 'no_answer' : /^H(?:07|08|09|10|11|12)$/.test(r.id));
    const wrongRows = rows.filter((r) => r.wrongPages?.length);
    summaries.push({ group, threshold, cases: rows.length, queryCAvailable: rows.filter((r) => r.queryCAvailable).length,
      positive: positive.length, goldTop20: eligible.length, goldTop5: eligible.filter((r) => r.expectedRank5).length,
      hit5: eligible.length ? eligible.filter((r) => r.expectedRank5).length / eligible.length : 0,
      mrr5: eligible.length ? eligible.reduce((n, r) => n + r.rr5, 0) / eligible.length : 0,
      acceptedGoldIds: positive.filter((r) => get(r).acceptedGold).map((r) => r.id),
      goldWithPrimaryIds: positive.filter((r) => get(r).final.some((e: any) => e.isGold && e.contentChars && e.primaryChars)).map((r) => r.id),
      wrongAcceptedIds: wrongRows.filter((r) => get(r).acceptedWrong.length).map((r) => r.id),
      wrongFinalIds: wrongRows.filter((r) => get(r).final.some((e: any) => e.isExplicitWrong)).map((r) => r.id),
      noAnswer: noAnswer.length, noAnswerAcceptedIds: noAnswer.filter((r) => get(r).accepted.length).map((r) => r.id),
      noAnswerFinalIds: noAnswer.filter((r) => get(r).final.length).map((r) => r.id),
      finalNonempty: rows.filter((r) => get(r).final.length).length,
    });
  }
}
const output = { phase, complete: true, model: config.model, topN, sourceAssociation: 'unchanged production baseline; G disabled', summaries, details };
const file = resolve(artifacts, phase + '-summary.json');
if (existsSync(file)) throw new Error('Summary already exists; do not overwrite first evidence');
writeFileSync(file, JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify(summaries.map((r) => ({ group: r.group, threshold: r.threshold, goldTop20: r.goldTop20, goldTop5: r.goldTop5, acceptedGold: r.acceptedGoldIds.length, primaryGold: r.goldWithPrimaryIds.length, wrongAccepted: r.wrongAcceptedIds.length, noAnswerAccepted: r.noAnswerAcceptedIds.length }))) + '\n');
