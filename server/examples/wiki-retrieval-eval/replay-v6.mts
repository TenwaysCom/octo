import { readFile, readdir, writeFile, access } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// Offline only. Every AI/store dependency is injected below.
globalThis.fetch = async () => { throw new Error('Network is disabled in this replay'); };
process.env.LOG_LEVEL = 'silent';
process.env.WIKI_QA_RECALL_LIMIT = '20';
process.env.WIKI_QA_RERANK_MIN_SCORE = '0.7';
const [experimentRoot, artifactDir, outputName = 'first-run.json', candidateManifestName = 'code-freeze.json', mode = 'all'] = process.argv.slice(2);
if (!experimentRoot || !artifactDir || /[/\\]/.test(outputName)) throw new Error('Usage: replay.mts EXPERIMENT_ROOT ARTIFACT_DIR [NEW_OUTPUT_NAME] [CANDIDATE_MANIFEST]');
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
const caseData = JSON.parse(caseText);
const cases = caseData.cases.filter((c: any) => mode !== 'dev' || c.split !== 'independent');
const candidateFrozen = JSON.parse(await readFile(resolve(artifacts, candidateManifestName), 'utf8'));
async function verify() {
  for (const [label, path, expected] of [
    ['K1', 'K1', frozen.K1], ['K2', 'K2', frozen.K2],
    ['baseline', 'baseline/server/src', frozen.baseline_code],
    ...Object.entries(candidateFrozen).map(([name, hashes]) => [name, name + '/server/src', hashes]),
  ] as const) equalFiles(await manifest(resolve(experimentRoot, path)), expected as Record<string, string>, String(label));
}
await verify();
// Compressed original results are equally immutable.
try {
  await access(resolve(artifacts, outputName + '.gz'));
  throw new Error('Compressed result already exists; choose a new output name');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
// Reserve a new result file before any case runs. Never overwrite first-run evidence.
await writeFile(resolve(artifacts, outputName), JSON.stringify({ state: 'running', startedAt: new Date().toISOString() }) + '\n', { flag: 'wx' });
const results: any[] = [];
for (const [group, code, knowledge] of [['reference', 'baseline', 'K1'], ['A', 'baseline', 'K2'], ['B', 'R', 'K2'], ['C', 'G', 'K2'], ['D', 'RG', 'K2']]) {
  const sourceRoot = resolve(experimentRoot, code, 'server/src');
  const { createWikiKnowledgeReader } = await import(pathToFileURL(resolve(sourceRoot, 'adapters/filesystem/wiki-knowledge-reader.ts')).href);
  const { createWikiQaService } = await import(pathToFileURL(resolve(sourceRoot, 'application/services/wiki-qa.service.ts')).href);
  const { wikiQuestionSchema } = await import(pathToFileURL(resolve(sourceRoot, 'domain/wiki-qa.ts')).href);
  const { wikiQueryTerms, wikiMatchCount } = await import(pathToFileURL(resolve(sourceRoot, 'domain/wiki-evidence.ts')).href);
  const associationEvents: any[] = [];
  const reader = createWikiKnowledgeReader({ workspaceDir: resolve(experimentRoot, knowledge), onEvidenceAssociation: (event: any) => associationEvents.push(event) });
  const baselineModule = await import(pathToFileURL(resolve(experimentRoot, 'baseline/server/src/adapters/filesystem/wiki-knowledge-reader.ts')).href);
  const controlReader = baselineModule.createWikiKnowledgeReader({ workspaceDir: resolve(experimentRoot, knowledge) });
  for (const c of cases) {
    associationEvents.length = 0;
    const input = wikiQuestionSchema.parse(c.input);
    const queryTerms = wikiQueryTerms([input.question, ...input.keywords, ...input.objects].join(' '));
    const candidates = await reader.search(input);
    const expected = new Set(c.expected_pages);
    const selectedIndices = candidates.flatMap((p: any, index: number) => expected.has(p.path) && p.knowledgeType === 'support_wiki' ? [index] : []).slice(0, 5);
    // The expected label is used only AFTER actual retrieval, to probe what the
    // existing service does IF that candidate is selected. This is not rerank quality.
    const service = createWikiQaService({
      reader: { search: async () => candidates, selectEvidence: reader.selectEvidence?.bind(reader), assessRelevance: reader.assessRelevance?.bind(reader) },
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
        relevance: reader.assessRelevance?.(input, p) ?? null,
        contentChars: p.content.length, contentSha256: hash(p.content), limitations: p.limitations, historicalOnly: p.historicalOnly,
        previewSourceCount: p.sourceEvidence.length, selectedPrimaryCount: sources.length,
        primaryChars: sources.reduce((sum: number, s: any) => sum + s.content.length, 0),
        primaryPaths: sources.map((s: any) => s.path),
        conditionalMockConsumption: expected.has(p.path) ? { selected: true, retained: Boolean(final), knowledgeChars: final?.content.length ?? 0,
          primaryCount: final?.sourceEvidence.length ?? 0, applicability: final?.applicability ?? null,
          outcome: !final ? 'filtered_by_existing_relevance_check' : !final.sourceEvidence.length ? 'historical_reference_without_selected_primary' : !final.content ? 'retained_primary_but_scoped_knowledge_empty' : 'knowledge_and_primary_retained' } : null,
      });
    }
    const wrongPairResults = [];
    for (const wrongPath of c.wrong_pages ?? []) {
      const canonical = 'docs/llm-wiki/' + wrongPath;
      const controlCandidates = await controlReader.search(input);
      let wrong = controlCandidates.find((p: any) => p.sourcePath === canonical);
      if (!wrong) {
        const source = await readFile(resolve(experimentRoot, knowledge, canonical), 'utf8');
        const titleRaw = source.match(/^title: (.*)$/m)?.[1] ?? wrongPath;
        let title = titleRaw; try { title = JSON.parse(titleRaw); } catch {}
        wrong = { id: 'forced-wrong', path: wrongPath, sourcePath: canonical, knowledgeType: 'support_wiki', title,
          content: '', status: 'draft', environments: [], sourceEvidence: [], limitations: ['forced wrong-pair probe; not actual retrieval'], historicalOnly: true };
      }
      const probe = createWikiQaService({
        reader: { search: async () => [wrong], selectEvidence: controlReader.selectEvidence?.bind(controlReader), assessRelevance: reader.assessRelevance?.bind(reader) },
        client: { createJsonCompletion: async () => ({ model: 'frozen-extraction', content: JSON.stringify(input) }) },
        rerankClient: { rerank: async () => ({ mode: 'rerank', model: 'forced-wrong-pair-MOCK', results: [{ index: 0, relevance_score: 1 }] }) },
        promptStore: { getByKey: async () => undefined }, extractLog: () => {}, answerLog: () => {},
      });
      const forced = await probe.retrieve({ ticketContext: input.question, actionRunId: `forced-${group}-${c.id}` });
      wrongPairResults.push({ path: wrongPath, actualRank: candidates.findIndex((p: any) => p.sourcePath === canonical) + 1 || null,
        eligibility: reader.assessRelevance?.(input, wrong) ?? null, forcedRetained: forced.evidence.length > 0,
        source: controlCandidates.some((p: any) => p.sourcePath === canonical) ? 'actual_control_candidate' : 'unretrieved_metadata_probe' });
    }
    const expectedEligibility = Object.fromEntries(c.expected_pages.map((path: string) => [path,
      reader.assessRelevance?.(input, { path, knowledgeType: 'support_wiki' }) ?? { reason: 'legacy_reader_not_instrumented' }]));
    results.push({ expectedEligibility, wrongPairResults, associationEvents: [...associationEvents], group, id: c.id, split: c.split, effectiveInput: input, expectedRanks: ranks,
      hit20: c.expected_pages.length ? Object.values(ranks).some((rank) => rank !== null) : null,
      candidateCount: candidates.length, candidates: ranked,
      realRerankTop5: 'unmeasured', answerQuality: 'unmeasured', mock: 'conditional expected-selection diagnostic only; never an actual model result' });
  }
}
await verify();
const summaries = ['old_regression', 'old_development', 'old_independent', 'independent'].map((split) => ({ split,
  groups: Object.fromEntries(['reference', 'A', 'B', 'C', 'D'].map((group) => {
    const rows = results.filter((r) => r.split === split && r.group === group);
    const positive = rows.filter((r) => r.hit20 !== null);
    return [group, { total: rows.length, positive: positive.length, hit20: positive.filter((r) => r.hit20).length,
      expectedPageCoverage: positive.reduce((n, r) => n + Object.values(r.expectedRanks).filter((v) => v !== null).length, 0),
      expectedPageTotal: positive.reduce((n, r) => n + Object.keys(r.expectedRanks).length, 0) }];
  })) }));
await writeFile(resolve(artifacts, outputName), JSON.stringify({ state: 'completed', completedAt: new Date().toISOString(), casesSha256: hash(caseText),
  mode, replaySha256: hash(await readFile(new URL(import.meta.url))), config: frozen.config, summaries, results }, null, 2) + '\n');
process.stdout.write(JSON.stringify(summaries, null, 2) + '\n');
