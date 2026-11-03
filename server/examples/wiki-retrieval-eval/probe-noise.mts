import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Conditional filter probe: deliberately select an already reviewed wrong-topic
// candidate after retrieval. It measures filtering behavior, never model accuracy.
globalThis.fetch = async () => { throw new Error('Offline probe'); };
process.env.LOG_LEVEL = 'silent';
process.env.WIKI_QA_RECALL_LIMIT = '20';
process.env.WIKI_QA_RERANK_MIN_SCORE = '0.7';
const [experimentRoot, artifactDir] = process.argv.slice(2);
if (!experimentRoot || !artifactDir) throw new Error('Usage: probe-noise.mts EXPERIMENT_ROOT ARTIFACT_DIR');
const root = resolve(artifactDir);
const { cases } = JSON.parse(await readFile(resolve(root, 'cases.json'), 'utf8'));
const { new_candidates_on_boundary_cases: probes } = JSON.parse(await readFile(resolve(root, 'changes.json'), 'utf8'));
const modulePath = (path: string) => pathToFileURL(resolve(experimentRoot, 'candidate/server/src', path)).href;
const { createWikiKnowledgeReader } = await import(modulePath('adapters/filesystem/wiki-knowledge-reader.ts'));
const { createWikiQaService } = await import(modulePath('application/services/wiki-qa.service.ts'));
const { wikiQuestionSchema } = await import(modulePath('domain/wiki-qa.ts'));
const results = [];
for (const probe of probes) {
  const c = cases.find((item: any) => item.id === probe.id);
  const input = wikiQuestionSchema.parse(c.input);
  const reader = createWikiKnowledgeReader({ workspaceDir: resolve(experimentRoot, 'K1') });
  const candidates = await reader.search(input);
  const index = candidates.findIndex((p: any) => p.sourcePath === probe.path);
  if (index < 0) throw new Error('Reviewed candidate is missing');
  const service = createWikiQaService({ reader: { search: async () => candidates, selectEvidence: reader.selectEvidence?.bind(reader) },
    client: { createJsonCompletion: async () => ({ model: 'frozen', content: JSON.stringify(input) }) },
    rerankClient: { rerank: async () => ({ mode: 'rerank', model: 'forced-noise-MOCK', results: [{ index, relevance_score: 1 }] }) },
    promptStore: { getByKey: async () => undefined }, extractLog: () => {}, answerLog: () => {} });
  const result = await service.retrieve({ ticketContext: input.question, actionRunId: `noise-${c.id}` });
  const e = result.evidence.find((p: any) => p.path === probe.path);
  results.push({ id: c.id, path: probe.path, mockScore: 1, retained: Boolean(e), knowledgeChars: e?.content.length ?? 0,
    primaryCount: e?.sourceEvidence.length ?? 0, applicability: e?.applicability ?? null,
    interpretation: 'Conditional survival if a wrong-topic candidate is selected; no actual model score or answer was measured.' });
}
await writeFile(resolve(root, 'noise-filter-probe.json'), JSON.stringify(results, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify(results, null, 2) + '\n');
