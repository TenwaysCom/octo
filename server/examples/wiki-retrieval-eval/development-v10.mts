import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash, originalDocument } from './inputs-v7.mts';
import { decideThreshold, type ThresholdPolicy } from './threshold-policy-v10.mts';

// Cached scores only. Raw evidence is kept in a private /tmp file, never the report.
globalThis.fetch = async () => { throw new Error('Network disabled in v10 development'); };
process.env.LOG_LEVEL = 'silent'; process.env.WIKI_QA_RECALL_LIMIT = '20'; process.env.WIKI_QA_RERANK_MIN_SCORE = '.7';
const root = '/tmp/octo-wiki-rag-v10';
const out = resolve('docs/tasks/ai-ticket/wiki-rag-v10');
const old = resolve('docs/tasks/ai-ticket/wiki-rag-v7');
const v8 = resolve('docs/tasks/ai-ticket/wiki-rag-v8-four-cases');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const config = read(resolve(out, 'config.json'));
const revision = process.argv[2] ?? '';
if (revision && revision !== 'r1') throw new Error('Only documented r1 development correction is allowed');
const frozen = read(resolve(out, revision ? 'candidate-revision-1.json' : 'initial-freeze.json'));
const suffix = revision ? '-' + revision : '';
if (existsSync(resolve(out, 'development' + suffix + '.json'))) throw new Error('Do not overwrite development evidence');
if (hash(readFileSync(new URL('./threshold-policy-v10.mts', import.meta.url))) !== frozen.policySha256) throw new Error('Policy changed after freeze');
for (const [name, expected] of Object.entries(frozen.candidateCode)) {
  if (hash(readFileSync(resolve(root, 'candidate/server/src', name))) !== expected) throw new Error('Candidate changed: ' + name);
}
const { createWikiKnowledgeReader } = await import(pathToFileURL(resolve(root, 'baseline/server/src/adapters/filesystem/wiki-knowledge-reader.ts')).href);
const { createWikiQaService: baselineService } = await import(pathToFileURL(resolve(root, 'baseline/server/src/application/services/wiki-qa.service.ts')).href);
const { createWikiQaService: candidateService } = await import(pathToFileURL(resolve(root, 'candidate/server/src/application/services/wiki-qa.service.ts')).href);
const reader = createWikiKnowledgeReader({ workspaceDir: resolve(root, 'K') });
const inputs = read('/tmp/octo-wiki-rag-v7/inputs.private.json');
const inputs8 = read('/tmp/octo-wiki-rag-v8-four-inputs.private.json');
const cases = read(resolve(old, 'cases.json')).cases.map((c: any) => ({ ...c, origin: 'v7' }));
cases.push(...read(resolve(v8, 'cases.json')).map((c: any) => ({ ...c, id: 'E8-' + c.id, origin: 'v8', expected_pages: c.expected ? [c.expected] : [], wrong_pages: c.wrong ? [c.wrong] : [] })));
const policies: ThresholdPolicy[] = [{ strategy: 'A', floor: .4, gap: .2 }, { strategy: 'C', floor: .4, gap: .2 },
  ...[.3, .4, .5].map(floor => ({ strategy: 'B' as const, floor, gap: .2 })),
  ...[.3, .4, .5].flatMap(floor => [.1, .2, .3].map(gap => ({ strategy: 'D' as const, floor, gap })))];
const details: any[] = []; const audit: any[] = [];
const normalize = (path: string) => path.replace(/^docs\/llm-wiki\//, '');
const safeFinal = (e: any) => ({ path: normalize(e.path), knowledgeType: e.knowledgeType, title: e.title,
  contentChars: e.content.length, contentSha256: hash(e.content), primaryChars: e.sourceEvidence.reduce((n: number, s: any) => n + s.content.length, 0),
  sourcePaths: e.sourceEvidence.map((s: any) => s.path), primarySha256: e.sourceEvidence.map((s: any) => hash(s.content)),
  applicability: e.applicability, limitations: e.limitations });
for (const c of cases) {
  const sourceInput = c.origin === 'v7' ? inputs.find((i: any) => i.id === c.id) : inputs8.find((i: any) => 'E8-' + i.id === c.id);
  const query = sourceInput.query ?? sourceInput.input;
  const documents = c.origin === 'v7' ? sourceInput.documents.map((d: any) => d.A) : sourceInput.documents;
  const candidates = await reader.search(query);
  const expectedPaths = sourceInput.candidatePaths ?? c.candidatePaths;
  if (JSON.stringify(candidates.map((p: any) => p.sourcePath)) !== JSON.stringify(expectedPaths)) throw new Error('Recall changed ' + c.id);
  if (candidates.some((p: any, i: number) => originalDocument(p) !== documents[i])) throw new Error('Model input changed ' + c.id);
  const payloadHash = hash(JSON.stringify({ model: config.model, query: query.question, documents, topN: 5 }));
  const cached = !candidates.length ? { results: [], state: 'completed' } : c.origin === 'v7'
    ? read(resolve(old, 'responses', payloadHash + '.json')) : read(resolve(v8, c.id.replace('E8-', '') + '-top5.json'));
  if (cached.state && cached.state !== 'completed') throw new Error('Failed cached request ' + c.id);
  const scores = cached.results;
  const make = (policy?: ThresholdPolicy) => (policy ? candidateService : baselineService)({
    ...(policy ? { thresholdPolicy: policy } : {}),
    reader: { search: async () => candidates, selectEvidence: reader.selectEvidence?.bind(reader) },
    client: { createJsonCompletion: async () => ({ model: 'frozen-extraction-not-called', content: JSON.stringify(query) }) },
    rerankClient: { rerank: async (input: any) => {
      if (input.query !== query.question || JSON.stringify(input.documents) !== JSON.stringify(documents) || input.topN !== Math.min(5, candidates.length)) throw new Error('Actual service model input differs');
      return { mode: 'rerank', model: config.model, results: scores };
    } },
    promptStore: { getByKey: async () => undefined }, extractLog: () => {}, answerLog: () => {},
  });
  const baseline = await make().retrieve({ ticketContext: query.question, actionRunId: 'v10-baseline-' + c.id });
  const runs: any[] = [];
  for (const policy of policies) {
    const decision = decideThreshold(scores, candidates, policy);
    const result = await make(policy).retrieve({ ticketContext: query.question, actionRunId: 'v10-development-' + c.id });
    if (policy.strategy === 'A' && JSON.stringify(result) !== JSON.stringify(baseline)) throw new Error('Baseline service equivalence failed ' + c.id);
    const final = result.evidence.map(safeFinal);
    const added = result.evidence.filter((e: any) => !baseline.evidence.some((b: any) => b.path === e.path));
    for (const e of added) {
      const key = c.id + '|' + normalize(e.path);
      let item = audit.find((a: any) => a.key === key);
      if (!item) {
        item = { key, id: c.id, type: c.type, query, path: normalize(e.path), title: e.title,
          knownGold: c.expected_pages.includes(normalize(e.path)), knownWrong: (c.wrong_pages ?? []).includes(normalize(e.path)),
          boundary: c.boundary, fullEvidence: e, policies: [] };
        audit.push(item);
      }
      item.policies.push(policy);
    }
    runs.push({ ...policy, ...decision, observedGap: decision.gap, gap: policy.gap, selected: decision.selected.map((r: any) => ({ path: candidates[r.index].path, score: r.relevance_score })), final,
      acceptedGold: decision.selected.some((r: any) => c.expected_pages.includes(candidates[r.index].path)),
      finalGold: final.some((e: any) => c.expected_pages.includes(e.path)),
      primaryGold: final.some((e: any) => c.expected_pages.includes(e.path) && e.contentChars && e.primaryChars),
      explicitWrongFinal: final.filter((e: any) => (c.wrong_pages ?? []).includes(e.path)).map((e: any) => e.path),
      addedPaths: added.map((e: any) => normalize(e.path)) });
  }
  details.push({ id: c.id, origin: c.origin, type: c.type, positive: c.expected_pages.length > 0,
    expectedPages: c.expected_pages, wrongPages: c.wrong_pages, question: query.question,
    candidatePaths: candidates.map((p: any) => p.sourcePath), payloadHash,
    ranked: scores.map((r: any, i: number) => ({ rank: i + 1, path: candidates[r.index].path, knowledgeType: candidates[r.index].knowledgeType, score: r.relevance_score })),
    runs });
}
writeFileSync(resolve(root, 'development' + suffix + '-audit.private.json'), JSON.stringify(audit, null, 2), { flag: 'wx', mode: 0o600 });
writeFileSync(resolve(out, 'development' + suffix + '.json'), JSON.stringify({ phase: 'development', cases: cases.length, networkRequests: 0,
  originalAssociationEnabled: false, baselineEquivalence: 'all 105 cases passed', details }, null, 2) + '\n', { flag: 'wx' });
writeFileSync(resolve(out, 'audit-index' + suffix + '.json'), JSON.stringify(audit.map(({ fullEvidence, query, ...rest }) => ({ ...rest, question: query.question,
  contentChars: fullEvidence.content.length, primaryChars: fullEvidence.sourceEvidence.reduce((n: number, s: any) => n + s.content.length, 0),
  sourcePaths: fullEvidence.sourceEvidence.map((s: any) => s.path), contentSha256: hash(fullEvidence.content) })), null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify({ cases: details.length, policies: policies.length, newPairsToAudit: audit.length,
  dPairs: audit.filter(a => a.policies.some((p: any) => p.strategy === 'D')).map(({ key, knownGold, knownWrong }) => ({ key, knownGold, knownWrong })), networkRequests: 0 }) + '\n');
