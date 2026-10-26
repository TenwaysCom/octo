import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// Offline only. Every AI/store dependency is injected below.
globalThis.fetch = async () => { throw new Error('Network is disabled in this replay'); };
process.env.LOG_LEVEL = 'silent';
process.env.WIKI_QA_RECALL_LIMIT = '20';
process.env.WIKI_QA_RERANK_MIN_SCORE = '0.7';
const [experimentRoot, artifactDir, outputName = 'first-run.json'] = process.argv.slice(2);
if (!experimentRoot || !artifactDir || /[/\\]/.test(outputName)) throw new Error('Usage: replay.mts EXPERIMENT_ROOT ARTIFACT_DIR [NEW_OUTPUT_NAME]');
const artifacts = resolve(artifactDir);
const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
async function manifest(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = resolve(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unexpected snapshot symlink: ${file}`);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) files[relative(root, file)] = hash(await readFile(file));
    }
  }
  await walk(root);
  return files;
}
function equalFiles(actual: Record<string, string>, expected: Record<string, string>, label: string) {
  if (Object.keys(actual).length !== Object.keys(expected).length || Object.entries(expected).some(([p, h]) => actual[p] !== h)) throw new Error(`${label} differs from the frozen manifest`);
}
const frozen = JSON.parse(await readFile(resolve(artifacts, 'freeze.json'), 'utf8'));
const caseText = await readFile(resolve(artifacts, 'cases.json'), 'utf8');
if (hash(caseText) !== frozen.cases_sha256) throw new Error('Frozen cases changed');
const { cases } = JSON.parse(caseText);
const candidateFrozen = JSON.parse(await readFile(resolve(artifacts, 'candidate-freeze.json'), 'utf8'));
async function verify() {
  for (const [label, path, expected] of [
    ['K0', 'K0', frozen.K0], ['K1', 'K1', candidateFrozen.K1],
    ['baseline', 'baseline/server/src', frozen.baseline_code],
    ['candidate', 'candidate/server/src', candidateFrozen.candidate_code],
  ] as const) equalFiles(await manifest(resolve(experimentRoot, path)), expected, label);
}
await verify();
// Reserve a new result file before any case runs. Never overwrite first-run evidence.
await writeFile(resolve(artifacts, outputName), JSON.stringify({ state: 'running', startedAt: new Date().toISOString() }) + '\n', { flag: 'wx' });
const results: any[] = [];
for (const [group, code, knowledge] of [['A', 'baseline', 'K0'], ['B', 'candidate', 'K0'], ['C', 'baseline', 'K1'], ['D', 'candidate', 'K1']]) {
  const sourceRoot = resolve(experimentRoot, code, 'server/src');
  const { createWikiKnowledgeReader } = await import(pathToFileURL(resolve(sourceRoot, 'adapters/filesystem/wiki-knowledge-reader.ts')).href);
  const { createWikiQaService } = await import(pathToFileURL(resolve(sourceRoot, 'application/services/wiki-qa.service.ts')).href);
  const { wikiQuestionSchema } = await import(pathToFileURL(resolve(sourceRoot, 'domain/wiki-qa.ts')).href);
  const { wikiQueryTerms, wikiMatchCount } = await import(pathToFileURL(resolve(sourceRoot, 'domain/wiki-evidence.ts')).href);
  const reader = createWikiKnowledgeReader({ workspaceDir: resolve(experimentRoot, knowledge) });
  for (const c of cases) {
    const input = wikiQuestionSchema.parse(c.input);
    const queryTerms = wikiQueryTerms([input.question, ...input.keywords, ...input.objects].join(' '));
    const candidates = await reader.search(input);
    const expected = new Set(c.expected_pages);
    const selectedIndices = candidates.flatMap((p: any, index: number) => expected.has(p.path) && p.knowledgeType === 'support_wiki' ? [index] : []).slice(0, 5);
    // The expected label is used only AFTER actual retrieval, to probe what the
    // existing service does IF that candidate is selected. This is not rerank quality.
    const service = createWikiQaService({
      reader: { search: async () => candidates, selectEvidence: reader.selectEvidence?.bind(reader) },
      client: { createJsonCompletion: async () => ({ model: 'frozen-extraction', content: JSON.stringify(input) }) },
      rerankClient: { rerank: async () => ({ mode: 'rerank', model: 'forced-gold-selection-MOCK', results: selectedIndices.map((index: number) => ({ index, relevance_score: 1 })) }) },
      promptStore: { getByKey: async () => undefined }, extractLog: () => {}, answerLog: () => {},
    });
    const consumed = await service.retrieve({ ticketContext: input.question, actionRunId: `offline-${group}-${c.id}` });
    const ranks: Record<string, number | null> = {};
    for (const p of c.expected_pages) { const i = candidates.findIndex((x: any) => x.path === p && x.knowledgeType === 'support_wiki'); ranks[p] = i < 0 ? null : i + 1; }
    const ranked = [];
    for (let i = 0; i < candidates.length; i++) {
      const p = candidates[i];
      const path = resolve(experimentRoot, knowledge, p.sourcePath);
      const text = await readFile(path, 'utf8');
      const header = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
      // Field diagnostics show lexical hits, not an independently invented rank score.
      const field = (key: string) => header.match(new RegExp(`^${key}:[^\\n]*(?:\\n[ \\t]*-[^\\n]*)*`, 'm'))?.[0] ?? '';
      const matched = (s: string) => queryTerms.filter((t: string) => wikiMatchCount(s, [t]) > 0);
      const sources = reader.selectEvidence({ candidate: p, question: input, evidenceIds: p.sourceEvidence.map((s: any) => s.id) });
      const final = consumed.evidence.find((e: any) => e.path === p.sourcePath);
      ranked.push({ rank: i + 1, path: p.path, sourcePath: p.sourcePath, knowledgeType: p.knowledgeType,
        matchedFields: { title: matched(field('title')), objects: matched(field('objects')), processes: matched(field('processes')),
          search_terms: matched(field('search_terms')), summary: matched(field('summary')), selectedBody: matched(p.content) },
        contentChars: p.content.length, contentSha256: hash(p.content), limitations: p.limitations, historicalOnly: p.historicalOnly,
        previewSourceCount: p.sourceEvidence.length, selectedPrimaryCount: sources.length,
        primaryChars: sources.reduce((sum: number, s: any) => sum + s.content.length, 0),
        primaryPaths: sources.map((s: any) => s.path),
        conditionalMockConsumption: expected.has(p.path) ? { selected: true, retained: Boolean(final), knowledgeChars: final?.content.length ?? 0,
          primaryCount: final?.sourceEvidence.length ?? 0, applicability: final?.applicability ?? null,
          outcome: !final ? 'filtered_by_existing_relevance_check' : !final.sourceEvidence.length ? 'historical_reference_without_selected_primary' : !final.content ? 'retained_primary_but_scoped_knowledge_empty' : 'knowledge_and_primary_retained' } : null,
      });
    }
    results.push({ group, id: c.id, split: c.split, effectiveInput: input, expectedRanks: ranks,
      hit20: c.expected_pages.length ? Object.values(ranks).some((rank) => rank !== null) : null,
      candidateCount: candidates.length, candidates: ranked,
      realRerankTop5: 'unmeasured', answerQuality: 'unmeasured', mock: 'conditional expected-selection diagnostic only; never an actual model result' });
  }
}
await verify();
const summaries = ['regression', 'development', 'independent'].map((split) => ({ split,
  groups: Object.fromEntries(['A', 'B', 'C', 'D'].map((group) => {
    const rows = results.filter((r) => r.split === split && r.group === group);
    const positive = rows.filter((r) => r.hit20 !== null);
    return [group, { total: rows.length, positive: positive.length, hit20: positive.filter((r) => r.hit20).length,
      expectedPageCoverage: positive.reduce((n, r) => n + Object.values(r.expectedRanks).filter((v) => v !== null).length, 0),
      expectedPageTotal: positive.reduce((n, r) => n + Object.keys(r.expectedRanks).length, 0) }];
  })) }));
await writeFile(resolve(artifacts, outputName), JSON.stringify({ state: 'completed', completedAt: new Date().toISOString(), casesSha256: hash(caseText),
  replaySha256: hash(await readFile(new URL(import.meta.url))), config: frozen.config, summaries, results }, null, 2) + '\n');
process.stdout.write(JSON.stringify(summaries, null, 2) + '\n');
