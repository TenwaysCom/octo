import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash, originalDocument } from './inputs-v7.mts';

globalThis.fetch = async () => { throw new Error('Network disabled during holdout preparation'); };
process.env.LOG_LEVEL = 'silent'; process.env.WIKI_QA_RECALL_LIMIT = '20';
const out = resolve('docs/tasks/ai-ticket/wiki-rag-v10'); const root = '/tmp/octo-wiki-rag-v10';
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
if (!read(resolve(out, 'stability.json')).passed) throw new Error('Stability must pass before holdout preparation');
if (existsSync(resolve(out, 'holdout-freeze.json'))) throw new Error('Holdout already frozen');
const { createWikiKnowledgeReader } = await import(pathToFileURL(resolve(root, 'baseline/server/src/adapters/filesystem/wiki-knowledge-reader.ts')).href);
const { wikiQuestionSchema } = await import(pathToFileURL(resolve(root, 'baseline/server/src/domain/wiki-qa.ts')).href);
const { redactSupportText } = await import(pathToFileURL(resolve(root, 'baseline/server/src/domain/support-ticket-analysis.ts')).href);
const reader = createWikiKnowledgeReader({ workspaceDir: resolve(root, 'K') });
const seeds = read(resolve('server/examples/wiki-retrieval-eval/holdout-v10-seeds.json')).cases;
const used = new Set<string>();
for (const v of ['v5', 'v6', 'v7']) for (const c of read(resolve('docs/tasks/ai-ticket/wiki-rag-' + v + '/cases.json')).cases) {
  for (const t of c.source_tickets ?? []) used.add(String(t));
  if (c.current_ticket) used.add(String(c.current_ticket));
}
for (const c of read(resolve('docs/tasks/ai-ticket/wiki-rag-v8-four-cases/cases.json'))) used.add(String(c.ticket));
if (new Set(seeds.map((c: any) => c.ticket)).size !== 32) throw new Error('New incidents must be distinct');
const draft: any[] = []; const privateRows: any[] = [];
const base = resolve(root, 'K/docs/llm-wiki');
const rawFiles = readdirSync(resolve(base, 'raw/transcripts'));
for (const c of seeds) {
  if (used.has(String(c.ticket))) throw new Error('Previously used source incident: ' + c.ticket);
  const sourceName = rawFiles.find(name => name === 'ticket-' + c.ticket + '.md')
    ?? rawFiles.find(name => name.startsWith('ticket-' + c.ticket + '.') && name.endsWith('.md'));
  if (!sourceName) throw new Error('Missing actual source: ' + c.ticket);
  const source = 'raw/transcripts/' + sourceName;
  const input = wikiQuestionSchema.parse({ question: redactSupportText(c.question), keywords: c.keywords.map(redactSupportText), objects: [], environments: [] });
  const candidates = await reader.search(input);
  const documents = candidates.map(originalDocument);
  const rank = c.expected ? candidates.findIndex((p: any) => p.path === c.expected) + 1 || null : null;
  const raw = readFileSync(resolve(base, source), 'utf8');
  const expectedSourceLinked = c.expected ? readFileSync(resolve(base, c.expected), 'utf8').includes('ticket-' + c.ticket) : null;
  draft.push({ ...c, input, source, sourceSha256: hash(raw), expectedSourceLinked, expectedRank20: rank,
    candidatePaths: candidates.map((p: any) => p.sourcePath), querySha256: hash(input.question), documentSha256: documents.map(hash),
    candidates: candidates.map((p: any, i: number) => ({ rank: i + 1, path: p.path, sourcePath: p.sourcePath, title: p.title, knowledgeType: p.knowledgeType,
      contentChars: p.content.length, sourcePaths: p.sourceEvidence.map((s: any) => s.path) })) });
  privateRows.push({ id: c.id, query: input, documents, candidatePaths: candidates.map((p: any) => p.sourcePath),
    auditCandidates: candidates.map((p: any) => ({ path: p.path, sourcePath: p.sourcePath, title: p.title, content: p.content, sourceEvidence: p.sourceEvidence })) });
}
writeFileSync(resolve(out, 'holdout-draft.json'), JSON.stringify({ cases: draft, labelsNotYetFrozen: true, newHoldoutModelCalls: 0 }, null, 2) + '\n', { flag: 'wx' });
writeFileSync(resolve(root, 'holdout-draft.private.json'), JSON.stringify(privateRows), { flag: 'wx', mode: 0o600 });
process.stdout.write(JSON.stringify(draft.map(c => ({ id: c.id, type: c.type, ticket: c.ticket, expectedRank20: c.expectedRank20, expectedSourceLinked: c.expectedSourceLinked }))) + '\n');
