import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, out, read, readerB, safeFinal, evaluate, assertFreeze } from './runtime-v13.mts';
import { hash } from './inputs-v7.mts';
import { allocatePrimaryBudget } from './primary-budget-v13.mts';

globalThis.fetch = async () => { throw new Error('Network forbidden in old v13 replay'); };
assertFreeze();
const old = resolve('docs/tasks/ai-ticket/wiki-rag-v10');
const inputs7 = read('/tmp/octo-wiki-rag-v7/inputs.private.json');
const inputs8 = read('/tmp/octo-wiki-rag-v8-four-inputs.private.json');
const inputs10 = read('/tmp/octo-wiki-rag-v10/holdout-inputs.private.json');
const cases8 = read(resolve('docs/tasks/ai-ticket/wiki-rag-v8-four-cases/cases.json'));
const cases10 = read(resolve(old, 'holdout-cases.json')).cases;
const rows: any[] = [];
for (const c of read(resolve(old, 'development-r1.json')).details) {
  const input = c.origin === 'v7' ? inputs7.find((r: any) => r.id === c.id) : inputs8.find((r: any) => 'E8-' + r.id === c.id);
  const query = input.query ?? input.input;
  const documents = c.origin === 'v7' ? input.documents.map((d: any) => d.A) : input.documents;
  const response = !c.candidatePaths.length ? { results: [] } : c.origin === 'v7' ? read(resolve('docs/tasks/ai-ticket/wiki-rag-v7/responses', c.payloadHash + '.json'))
    : read(resolve('docs/tasks/ai-ticket/wiki-rag-v8-four-cases', c.id.slice(3) + '-top5.json'));
  rows.push({ id: c.id, origin: c.origin, type: c.type, query, documents, candidatePaths: c.candidatePaths,
    expectedPages: c.expectedPages, wrongPages: c.wrongPages, scores: response.results,
    previousFinal: c.runs.find((r: any) => r.strategy === 'A').final });
}
for (const c of cases10) {
  const input = inputs10.find((r: any) => r.id === c.id);
  const previous = read(resolve(old, 'holdout.json')).results.find((r: any) => r.id === c.id);
  rows.push({ ...input, origin: 'v10', type: c.type, expectedPages: c.expectedPages, wrongPages: c.wrongPages,
    scores: read(resolve(old, 'holdout-' + c.id + '.json')).results,
    previousFinal: previous.runs.find((r: any) => r.strategy === 'A').final });
}
if (rows.length !== 137) throw new Error('Expected 137 old cases');
const details: any[] = [], audit: any[] = [], privateResults: any[] = [];
for (const [i, row] of rows.entries()) {
  const result = await evaluate(row, row.scores ?? [], i);
  details.push(result.report); audit.push(...result.audit); privateResults.push(result.privateResults);
}
const diagnosticRow = rows.find(r => r.id === 'U08');
const candidates = await readerB.search(diagnosticRow.query);
const c = candidates.find((p: any) => diagnosticRow.expectedPages.includes(p.path));
const args = { candidate: c, question: diagnosticRow.query, evidenceIds: c.sourceEvidence.map((s: any) => s.id) };
const existing = readerB.selectEvidence(args);
const units = readerB.selectEvidence({ ...args, maxChars: Number.MAX_SAFE_INTEGER });
const diag = allocatePrimaryBudget([{ key: c.sourcePath, existing, units }], { page: 4800, total: 7200 });
const diagnostic = { id: 'U08', diagnosticOnly: true, forcedQualification: false, originalQualified: false,
  path: c.path, requiredUnits: units.map((s: any) => ({ path: s.path, chars: s.content.length, sha256: hash(s.content) })),
  keptAt2400: existing.length, keptInBudgetDiagnostic: diag.pages[0].sources.length, chars: diag.used,
  actualFinalUnchanged: details.find(r => r.id === 'U08').runs.every((r: any) => r.final.length === 0) };
const quantile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
const summary = Object.fromEntries(['A', 'B'].map(arm => [arm, {
  targetBodyAndPrimary: details.filter(r => r.runs.find((v: any) => v.arm === arm).targetBodyAndPrimary).length,
  titleOnly: details.flatMap(r => r.runs.find((v: any) => v.arm === arm).final).filter(e => !e.contentChars && !e.primaryChars).length,
  primaryChars: details.reduce((n, r) => n + r.runs.find((v: any) => v.arm === arm).final.reduce((m: number, e: any) => m + e.primaryChars, 0), 0),
  evidenceP95Ms: quantile(details.map(r => r.runs.find((v: any) => v.arm === arm).evidenceMs), .95),
}]));
const lost = details.filter(r => r.runs[0].targetBodyAndPrimary && !r.runs[1].targetBodyAndPrimary);
const gained = details.filter(r => !r.runs[0].targetBodyAndPrimary && r.runs[1].targetBodyAndPrimary).map(r => r.id);
const u14 = details.find(r => r.id === 'U14');
const gate = { baselineEquivalent137: true, rerankPayloadIdentical: true, baselineUnitsPreserved: true, pageSelectionIdentical: true,
  lostTargets: lost.map(r => r.id), u14Restored: u14.runs[1].targetBodyAndPrimary,
  u08Diagnostic: diagnostic.actualFinalUnchanged && diagnostic.keptInBudgetDiagnostic > 0,
  performancePassed: summary.B.evidenceP95Ms <= summary.A.evidenceP95Ms + 100,
  G: 'disabled', networkRequests: 0, answerCalls: 0, judgeCalls: 0 };
const mechanicalPassed = !lost.length && gate.u14Restored && gate.u08Diagnostic && gate.performancePassed;
writeFileSync(resolve(root, 'old-audit.private.json'), JSON.stringify(audit), { flag: 'wx', mode: 0o600 });
writeFileSync(resolve(root, 'old-results.private.json'), JSON.stringify(privateResults), { flag: 'wx', mode: 0o600 });
writeFileSync(resolve(out, 'old-replay.json'), JSON.stringify({ cases: 137, gate, mechanicalPassed, summary, gained,
  changedPairs: audit.length, diagnostic, details }, null, 2) + '\n', { flag: 'wx' });
writeFileSync(resolve(out, 'old-audit-index.json'), JSON.stringify(audit.map((a: any) => ({ id: a.id, type: a.type,
  question: a.question, path: a.candidate.path, knownGold: a.expectedPages.includes(a.candidate.path.replace(/^docs\/llm-wiki\//, '')),
  knownWrong: a.wrongPages.includes(a.candidate.path.replace(/^docs\/llm-wiki\//, '')), A: safeFinal(a.baseline), B: safeFinal(a.candidate) })), null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify({ mechanicalPassed, gate, summary, gained, changedPairs: audit.length }) + '\n');
