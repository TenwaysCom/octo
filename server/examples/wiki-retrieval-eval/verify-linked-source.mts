import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

globalThis.fetch = async () => { throw new Error('Offline verification'); };
process.env.LOG_LEVEL = 'silent';
process.env.WIKI_QA_RECALL_LIMIT = '20';
process.env.WIKI_QA_RERANK_MIN_SCORE = '0.7';
const [experimentRoot, artifactDir] = process.argv.slice(2);
if (!experimentRoot || !artifactDir) throw new Error('Usage: verify-linked-source.mts EXPERIMENT_ROOT ARTIFACT_DIR');
const root = resolve(artifactDir);
const c = JSON.parse(await readFile(resolve(root, 'cases.json'), 'utf8')).cases.find((c: any) => c.id === 'D02');
const checks = [];
for (const variant of ['G', 'RG']) {
  const modulePath = (path: string) => pathToFileURL(resolve(experimentRoot, variant, 'server/src', path)).href;
  const { createWikiKnowledgeReader } = await import(modulePath('adapters/filesystem/wiki-knowledge-reader.ts'));
  const { createWikiQaService } = await import(modulePath('application/services/wiki-qa.service.ts'));
  const associations: any[] = [];
  const reader = createWikiKnowledgeReader({ workspaceDir: resolve(experimentRoot, 'K2'), onEvidenceAssociation: (event: any) => associations.push(event) });
  const candidates = await reader.search(c.input);
  const index = candidates.findIndex((p: any) => c.expected_pages.includes(p.path));
  assert.ok(index >= 0);
  const service = createWikiQaService({
    reader: { search: async () => candidates, selectEvidence: reader.selectEvidence.bind(reader), assessRelevance: reader.assessRelevance?.bind(reader) },
    client: { createJsonCompletion: async () => ({ model: 'frozen', content: JSON.stringify(c.input) }) },
    rerankClient: { rerank: async () => ({ mode: 'rerank', model: 'forced-gold-MOCK', results: [{ index, relevance_score: 1 }] }) },
    promptStore: { getByKey: async () => undefined }, extractLog: () => {}, answerLog: () => {},
  });
  const result = await service.retrieve({ ticketContext: c.input.question, actionRunId: `verify-${variant}` });
  const e = result.evidence[0];assert.ok(e);
  assert.equal(e.applicability, 'historical_reference');assert.equal(e.sourceEvidence.length, 1);
  assert.ok(e.sourceEvidence[0].path.includes('ticket-2370.'));
  assert.ok(e.sourceEvidence[0].content.includes('ValueError: Expected singleton: stock.move()'));
  assert.ok(e.sourceEvidence[0].content.includes('_tw_purchase_original_currency_unit_price'));
  assert.ok(e.sourceEvidence[0].content.length <= 2400);
  assert.ok(e.content.includes('未给出诊断、修复或恢复结果'));
  assert.ok(!e.content.includes('用户确认可操作'));assert.ok(!e.content.includes('曾临时调整日期'));
  assert.ok(e.limitations.some((s: string) => s.includes('当前票是否同因待确认')));
  assert.ok(associations.some((a) => a.sourcePath.includes('ticket-1935.') && a.outcome === 'over_budget'));
  assert.ok(associations.some((a) => a.sourcePath.includes('ticket-2118.') && a.outcome === 'over_budget'));
  checks.push({ variant, passed: true, knowledgeChars: e.content.length, primaryChars: e.sourceEvidence[0].content.length,
    primaryPaths: e.sourceEvidence.map((s: any) => s.path), selectedOrdinals: [...e.sourceEvidence[0].content.matchAll(/^M\d+$/gm)].map((m) => m[0]),
    exactErrorAndFunctionVerified: true, unresolvedBoundaryRetained: true, otherTicketsRecoveryNotForwarded: true,
    originalBudgetRejectionsPreserved: true, applicability: e.applicability });
}
await writeFile(resolve(root, 'focused-verification.json'), JSON.stringify(checks, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify(checks, null, 2) + '\n');
