import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { originalDocument, describedDocument, hash } from './inputs-v7.mts';

globalThis.fetch = async () => { throw new Error('Network disabled during sample preparation'); };
process.env.LOG_LEVEL = 'silent'; process.env.WIKI_QA_RECALL_LIMIT = '20';
const root = '/tmp/octo-wiki-rag-v7';
const artifacts = resolve('docs/tasks/ai-ticket/wiki-rag-v7');
if (existsSync(resolve(artifacts, 'freeze.json'))) throw new Error('Frozen v7 inputs already exist; preparation cannot overwrite them');
const source = resolve(root, 'baseline/server/src');
const { createWikiKnowledgeReader } = await import(pathToFileURL(resolve(source, 'adapters/filesystem/wiki-knowledge-reader.ts')).href);
const { wikiQueryTerms, wikiMatchCount } = await import(pathToFileURL(resolve(source, 'domain/wiki-evidence.ts')).href);
const { wikiQuestionSchema } = await import(pathToFileURL(resolve(source, 'domain/wiki-qa.ts')).href);
const { redactSupportText } = await import(pathToFileURL(resolve(source, 'domain/support-ticket-analysis.ts')).href);
const input = JSON.parse(await readFile(resolve(artifacts, 'cases.provisional.json'), 'utf8'));
const contexts = JSON.parse(await readFile(resolve(root, 'contexts.private.json'), 'utf8'));
const reader = createWikiKnowledgeReader({ workspaceDir: resolve(root, 'K') });
const rows: any[] = [];
for (const c of input.cases) {
  const query = wikiQuestionSchema.parse(c.input);
  const candidates = await reader.search(query);
  const terms = wikiQueryTerms([query.question, ...query.keywords, ...query.objects].join(' '));
  const documents = [];
  for (const p of candidates) {
    const page = await readFile(resolve(root, 'K', p.sourcePath), 'utf8');
    const described = describedDocument(p, page, terms, wikiMatchCount);
    documents.push({ path: p.path, sourcePath: p.sourcePath, title: p.title, knowledgeType: p.knowledgeType,
      originalContentHash: hash(p.content), originalBodyChars: p.content.length,
      A: originalDocument(p), B: described.document, diagnostics: described.diagnostics,
      evidenceProfile: { previewSources: p.sourceEvidence.length, originalBodyChars: p.content.length } });
  }
  const queryC = contexts[c.id]?.queryC ? redactSupportText(contexts[c.id].queryC) : null;
  rows.push({ id: c.id, split: c.split, query, queryC, queryCSource: contexts[c.id]?.source ?? null,
    candidatePaths: candidates.map((p: any) => p.sourcePath), documents });
}
await writeFile(resolve(root, 'inputs.private.json'), JSON.stringify(rows, null, 2) + '\n');
const audit = rows.filter((r) => r.split === 'holdout').map((row) => ({ id: row.id,
  candidates: row.documents.map((p: any, index: number) => ({ rank: index + 1, path: p.path, title: p.title, type: p.knowledgeType, originalBodyChars: p.originalBodyChars })) }));
await writeFile(resolve(artifacts, 'candidate-audit.provisional.json'), JSON.stringify(audit, null, 2) + '\n');
process.stdout.write(JSON.stringify({ cases: rows.length, empty: rows.filter((r) => !r.documents.length).map((r) => r.id), CAvailable: rows.filter((r) => r.queryC).length,
  holdoutExpectedRank: input.cases.filter((c: any) => c.type === 'positive' && c.split === 'holdout').map((c: any) => ({ id: c.id, ranks: c.expected_pages.map((p: string) => rows.find((r) => r.id === c.id)?.documents.findIndex((d: any) => d.path === p)! + 1) })) }) + '\n');
