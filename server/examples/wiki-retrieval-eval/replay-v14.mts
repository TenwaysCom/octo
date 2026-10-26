import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { evaluate, assertFreeze, safeFinal, read, normalize } from './runtime-v13.mts';
import { hash, originalDocument } from './inputs-v7.mts';
import { checkAddedPrimary, focusPolicy } from './primary-focus-v14.mts';

const root = '/tmp/octo-wiki-rag-v14';
const out = resolve('docs/tasks/ai-ticket/wiki-rag-v14');
let networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw new Error('OLD_GATE_NETWORK_FORBIDDEN'); };
assertFreeze();
const freeze = read(resolve(out, 'initial-freeze.json'));
for (const [folder, files] of [[resolve(root, 'candidate/server/src'), freeze.candidateCode],
  [resolve(root, 'K'), freeze.knowledge], [resolve('server/src'), freeze.sharedApplicationBefore]] as const) {
  for (const [name, expected] of Object.entries(files)) {
    if (hash(readFileSync(resolve(folder, name))) !== expected) throw new Error('FREEZE_CHANGED:' + name);
  }
}
for (const [name, expected] of Object.entries(freeze.experimentCode)) {
  if (hash(readFileSync(new URL(name, import.meta.url))) !== expected) throw new Error('EXPERIMENT_CODE_CHANGED:' + name);
}
if (hash(readFileSync(resolve(out, 'source-labels.json'))) !== freeze.labelsSha256) throw new Error('LABELS_CHANGED');
if (hash(readFileSync(resolve(out, 'policy.json'))) !== freeze.policySha256) throw new Error('POLICY_CHANGED');
if (hash(readFileSync(resolve(root, 'old-inputs.private.json'))) !== freeze.oldInputsSha256) throw new Error('INPUTS_CHANGED');
const labels = read(resolve(out, 'source-labels.json')).labels;
const { createWikiKnowledgeReader } = await import(pathToFileURL(resolve(root, 'candidate/server/src/adapters/filesystem/wiki-knowledge-reader.ts')).href);
const { createWikiQaService } = await import(pathToFileURL(resolve(root, 'candidate/server/src/application/services/wiki-qa.service.ts')).href);
const reader = createWikiKnowledgeReader({ workspaceDir: resolve(root, 'K') });
const rows = read(resolve(root, 'old-inputs.private.json'));
const old = read(resolve('docs/tasks/ai-ticket/wiki-rag-v13/old-replay.json'));
const details: any[] = [], privateResults: any[] = [], audit: any[] = [];
const eq = (a: any, b: any, message: string) => { if (!isDeepStrictEqual(a, b)) throw new Error(message); };
for (const [i, row] of rows.entries()) {
  const ab = await evaluate(row, row.scores ?? [], i);
  const previous = old.details.find((r: any) => r.id === row.id);
  for (const arm of ['A', 'B']) eq(ab.report.runs.find((r: any) => r.arm === arm).final,
    previous.runs.find((r: any) => r.arm === arm).final, 'AB_NOT_FROZEN_EQUIVALENT:' + row.id);
  const candidates = await reader.search(row.query);
  eq(candidates.map((c: any) => c.sourcePath), row.candidatePaths, 'C_RECALL_CHANGED');
  eq(candidates.map(originalDocument), row.documents, 'C_DOCUMENTS_CHANGED');
  const decisions: any[] = [];
  let extractionCalls = 0, rerankCalls = 0, evidenceStarted = 0, evidenceMs = 0, gateMs = 0;
  const service = createWikiQaService({ rawBudget: { page: 4800, total: 7200 },
    primaryGate(question: string, source: any) {
      const started = performance.now();
      const decision = checkAddedPrimary(question, source.content);
      gateMs += performance.now() - started;
      decisions.push({ path: source.path, sha256: hash(source.content), chars: source.content.length, ...decision });
      return decision.allow;
    },
    reader: { search: async () => candidates, selectEvidence: reader.selectEvidence.bind(reader) },
    client: { createJsonCompletion: async () => {
      if (++extractionCalls !== 1) throw new Error('ANSWER_JUDGE_FORBIDDEN');
      return { model: 'frozen-extraction-no-model', content: JSON.stringify(row.query) };
    } },
    rerankClient: { rerank: async (input: any) => {
      rerankCalls++;
      eq(input.documents, row.documents, 'C_WIRE_DOCUMENTS_CHANGED');
      if (input.query !== row.query.question || input.topN !== Math.min(5, candidates.length)) throw new Error('C_WIRE_CHANGED');
      const wire = JSON.stringify({ model: 'BAAI/bge-reranker-v2-m3', query: input.query, documents: input.documents,
        top_n: input.topN, return_documents: false });
      if (hash(wire) !== ab.report.wireSha256) throw new Error('C_WIRE_HASH_CHANGED');
      return { mode: 'rerank', model: 'BAAI/bge-reranker-v2-m3', results: row.scores };
    } },
    promptStore: { getByKey: async () => undefined }, extractLog: () => {},
    answerLog: () => { throw new Error('ANSWER_FORBIDDEN'); },
  });
  const c = await service.retrieve({ ticketContext: row.query.question, actionRunId: 'v14-C-' + row.id,
    onProgress(e: any) {
      if (e.phase === 'answer') throw new Error('ANSWER_FORBIDDEN');
      if (e.phase === 'evidence' && e.status === 'started') evidenceStarted = performance.now();
      if (e.phase === 'evidence' && e.status === 'completed') evidenceMs = performance.now() - evidenceStarted;
    } });
  if (extractionCalls !== 1 || rerankCalls !== Number(Boolean(candidates.length))) throw new Error('CALL_COUNT_CHANGED');
  const a = ab.privateResults.A.evidence, b = ab.privateResults.B.evidence;
  eq(c.evidence.map((e: any) => e.path), a.map((e: any) => e.path), 'C_PAGE_SELECTION_CHANGED');
  for (const page of c.evidence) {
    const pa = a.find((x: any) => x.path === page.path), pb = b.find((x: any) => x.path === page.path);
    for (const unit of pa.sourceEvidence) if (!page.sourceEvidence.some((x: any) => isDeepStrictEqual(x, unit))) throw new Error('BASELINE_UNIT_LOST');
    for (const unit of page.sourceEvidence) if (!pb.sourceEvidence.some((x: any) => isDeepStrictEqual(x, unit))) throw new Error('NON_B_SOURCE_OR_CHANGED_UNIT');
    if (page.sourceEvidence.reduce((n: number, x: any) => n + x.content.length, 0) > 4800) throw new Error('PAGE_CAP');
    if (page.applicability !== pa.applicability) throw new Error('APPLICABILITY_UPGRADED');
    for (const line of pa.content.split('\n').filter(Boolean)) if (!page.content.includes(line)) throw new Error('BASELINE_BODY_LOST');
    const additions = pb.sourceEvidence.filter((x: any) => !pa.sourceEvidence.some((u: any) => isDeepStrictEqual(x, u)));
    for (const unit of additions) {
      const label = labels.find((x: any) => x.id === row.id && x.page === page.path && x.source === unit.path && x.sha256 === hash(unit.content));
      if (!label) throw new Error('INCREMENT_LABEL_MISSING');
      const decision = decisions.find(x => x.path === unit.path && x.sha256 === hash(unit.content));
      if (!decision) throw new Error('INCREMENT_DECISION_MISSING');
      const included = page.sourceEvidence.some((x: any) => isDeepStrictEqual(x, unit));
      if (included !== decision.allow) throw new Error('DECISION_NOT_APPLIED');
      audit.push({ ...label, included, decisionReason: decision.reason, invalidUnit: decision.reason === 'invalid_ordinals' });
    }
  }
  if (c.evidence.reduce((n: number, e: any) => n + safeFinal(e).primaryChars, 0) > 7200) throw new Error('TOTAL_CAP');
  const targetBodyAndPrimary = c.evidence.some((e: any) => row.expectedPages.includes(normalize(e.path)) && e.content && e.sourceEvidence.length);
  details.push({ ...ab.report, runs: [...ab.report.runs, { arm: 'C', final: c.evidence.map(safeFinal), targetBodyAndPrimary,
    explicitWrong: c.evidence.filter((e: any) => row.wrongPages.includes(normalize(e.path))).map((e: any) => normalize(e.path)),
    evidenceMs, gateMs }], gateDecisions: decisions.map(({ anchors, families, ordinals, ...safe }) => safe) });
  privateResults.push({ id: row.id, query: row.query, A: ab.privateResults.A, B: ab.privateResults.B, C: c, decisions });
}
if (details.length !== 137 || audit.length !== labels.length || networkAttempts) throw new Error('INCOMPLETE_OR_NETWORKED_REPLAY');
const quantile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
const summary = Object.fromEntries(['A', 'B', 'C'].map(arm => [arm, {
  purePositiveTargetBodyAndPrimary: details.filter(r => r.type === 'positive' && r.runs.find((x: any) => x.arm === arm).targetBodyAndPrimary).length,
  allTypesTargetBodyAndPrimary: details.filter(r => r.runs.find((x: any) => x.arm === arm).targetBodyAndPrimary).length,
  evidenceP50Ms: quantile(details.map(r => r.runs.find((x: any) => x.arm === arm).evidenceMs), .5),
  evidenceP95Ms: quantile(details.map(r => r.runs.find((x: any) => x.arm === arm).evidenceMs), .95),
  primaryChars: details.reduce((n,r) => n + r.runs.find((x: any) => x.arm === arm).final.reduce((s: number,e: any) => s + e.primaryChars, 0),0),
}]));
const retained = ['Q14', 'Q17', 'Q29', 'N01', 'P02', 'U14'].map(id => ({ id,
  retained: details.find(r => r.id === id).runs.find((x: any) => x.arm === 'C').targetBodyAndPrimary }));
const unsafeAdmitted = audit.filter(x => x.included && !x.allowedAsHistoricalEvidence);
const safeRejected = audit.filter(x => !x.included && x.allowedAsHistoricalEvidence);
const regression = details.find(r => r.id === 'E8-N2');
const knownMismatchBlocked = audit.find(x => x.id === 'E8-N2').included === false;
const knownBaselineKept = regression.runs.find((x: any) => x.arm === 'C').final[0].sourcePaths
  .some((s: string) => s.includes('ticket-1961.'));
const mechanical = { cases:137, abFrozenEquivalent:true, wireScoresPagesIdentical:true, baselineUnitsUnchanged:true,
  CSubsetOfB:true, noRefill:true, pageTotalCaps:true, applicabilityUnchanged:true, allAdditionsAudited:audit.length,
  invalidUnits:audit.filter(x => x.invalidUnit).length, G:'disabled', networkAttempts, answerCalls:0, judgeCalls:0 };
const gate = { knownMismatchBlocked: knownMismatchBlocked && knownBaselineKept, retained,
  allSixGainsKept:retained.every(x => x.retained), unsafeAdmitted:unsafeAdmitted.length,
  sourceSafetyPassed:unsafeAdmitted.length === 0,
  performancePassed:summary.C.evidenceP95Ms <= summary.B.evidenceP95Ms + 10,
  gateP95Ms: quantile(details.map(r => r.runs.find((x: any) => x.arm === 'C').gateMs), .95) };
const accepted = gate.knownMismatchBlocked && gate.allSixGainsKept && gate.sourceSafetyPassed && gate.performancePassed && !mechanical.invalidUnits;
const write = (p:string, x:any, mode=0o644) => writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx',mode});
write(resolve(root,'old-results.private.json'), privateResults,0o600);
write(resolve(out,'old-replay.json'),{cases:137,mechanical,gate,summary,details});
write(resolve(out,'source-audit.json'),{audited:audit.length,unsafeAdmitted,safeRejected,details:audit});
write(resolve(out,'acceptance.json'),{status:accepted?'OLD_GATE_PASSED':'NOT_ACCEPTED',oldGatePassed:accepted,
  new32Prepared:false,new32Called:0,networkRequests:0,answerCalls:0,judgeCalls:0,G:'disabled',productionChanges:false,gate,summary});
process.stdout.write(JSON.stringify({accepted,mechanical,gate,summary,unsafeAdmitted:unsafeAdmitted.map(x=>x.auditId),safeRejected:safeRejected.map(x=>x.auditId)})+'\n');
