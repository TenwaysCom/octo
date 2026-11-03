import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash } from './inputs-v7.mts';

globalThis.fetch = async () => { throw new Error('Network disabled in evidence diagnosis'); };
process.env.LOG_LEVEL = 'silent'; process.env.WIKI_QA_RECALL_LIMIT = '20';
const root = '/tmp/octo-wiki-rag-v10'; const out = resolve('docs/tasks/ai-ticket/wiki-rag-v10');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const { createWikiKnowledgeReader } = await import(pathToFileURL(resolve(root, 'baseline/server/src/adapters/filesystem/wiki-knowledge-reader.ts')).href);
const { wikiQueryTerms, relevantSourceContent } = await import(pathToFileURL(resolve(root, 'baseline/server/src/domain/wiki-evidence.ts')).href);
const reader = createWikiKnowledgeReader({ workspaceDir: resolve(root, 'K') });
const inputs = read(resolve(root, 'holdout-inputs.private.json'));
const cases = read(resolve(out, 'holdout-cases.json')).cases;
const rows: any[] = [];
for (const id of ['U08', 'U14', 'U16']) {
  const row = inputs.find((r: any) => r.id === id); const c = cases.find((r: any) => r.id === id);
  const candidates = await reader.search(row.query); const candidate = candidates.find((r: any) => r.path === c.expected);
  const evidenceIds = candidate.sourceEvidence.map((s: any) => s.id);
  const actual = reader.selectEvidence({ candidate, question: row.query, evidenceIds });
  const terms = wikiQueryTerms([row.query.question, ...row.query.keywords, ...row.query.objects].join(' '));
  const sourceDiagnostics = candidate.sourceEvidence.map((source: any) => {
    const raw = readFileSync(resolve(root, 'K/docs/llm-wiki', source.path), 'utf8');
    const thread = raw.match(/^##\s+线程消息[^\n]*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m)?.[1]?.trim() ?? '';
    // Measure only: never forward this oversized text or alter the actual budget.
    const complete = relevantSourceContent(thread, terms, 1_000_000, true);
    const bounded = relevantSourceContent(thread, terms, 2400, true);
    return { path: source.path, requiredContextChars: complete.content.length, hasLexicalHit: Boolean(complete.content),
      retainedAt2400: Boolean(bounded.content), exceedsBudget: complete.content.length > 2400, rawSha256: hash(raw) };
  });
  rows.push({ id, expected: c.expected, candidateBodyChars: candidate.content.length,
    actualSourcesKept: actual.length, actualPrimaryChars: actual.reduce((n: number, s: any) => n + s.content.length, 0), sourceDiagnostics });
}
writeFileSync(resolve(out, 'source-budget-diagnostics.json'), JSON.stringify({ measurementOnly: true, effectiveBudgetUnchanged: 2400, G: 'disabled', rows }, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify(rows) + '\n');
