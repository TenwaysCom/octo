import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { hash } from './inputs-v7.mts';

globalThis.fetch = async () => { throw new Error('VERIFICATION_NETWORK_FORBIDDEN'); };
const root = '/tmp/octo-wiki-rag-v14', out = resolve('docs/tasks/ai-ticket/wiki-rag-v14');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const manifest = (dir: string) => Object.fromEntries(readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter(e => e.isFile() && !e.isSymbolicLink()).map(e => {
    const path = resolve(e.parentPath, e.name); return [relative(dir, path), hash(readFileSync(path))];
  }).sort(([a], [b]) => a.localeCompare(b)));
const f = read(resolve(out, 'initial-freeze.json'));
const checks: Record<string, boolean> = {
  sharedApplicationUnchanged: isDeepStrictEqual(manifest(resolve('server/src')), f.sharedApplicationBefore),
  candidateFrozen: isDeepStrictEqual(manifest(resolve(root, 'candidate/server/src')), f.candidateCode),
  baselineFrozen: isDeepStrictEqual(manifest(resolve(root, 'baseline/server/src')), f.baselineCode),
  knowledgeFrozen: isDeepStrictEqual(manifest(resolve(root, 'K')), f.knowledge),
  labelsFrozen: hash(readFileSync(resolve(out, 'source-labels.json'))) === f.labelsSha256,
  policyFrozen: hash(readFileSync(resolve(out, 'policy.json'))) === f.policySha256,
  inputsFrozen: hash(readFileSync(resolve(root, 'old-inputs.private.json'))) === f.oldInputsSha256,
  priorArtifactsUnchanged: Object.entries(f.previousArtifacts).every(([name, files]) =>
    isDeepStrictEqual(manifest(resolve('docs/tasks/ai-ticket', name)), files)),
  experimentCodeFrozen: Object.entries(f.experimentCode).every(([name, expected]) =>
    hash(readFileSync(new URL(name, import.meta.url))) === expected),
};
const { relevantSourceContent, wikiQueryTerms } = await import(pathToFileURL(resolve(root, 'baseline/server/src/domain/wiki-evidence.ts')).href);
const data = read(resolve(root, 'old-results.private.json'));
const report = read(resolve(out, 'old-replay.json'));
const acceptance = read(resolve(out, 'acceptance.json'));
const audit = read(resolve(out, 'source-audit.json'));
let checkedOriginalUnits = 0, baselineUnits = 0;
if (data.length !== 137 || report.details.length !== 137 || audit.details.length !== 32) throw new Error('INCOMPLETE_REPLAY');
for (const row of data) {
  const terms = wikiQueryTerms([row.query.question, ...row.query.keywords, ...row.query.objects].join(' '));
  if (!isDeepStrictEqual(row.A.evidence.map((p: any) => p.path), row.C.evidence.map((p: any) => p.path))) throw new Error('PAGES_CHANGED');
  let total = 0;
  for (const c of row.C.evidence) {
    const a = row.A.evidence.find((p: any) => p.path === c.path), b = row.B.evidence.find((p: any) => p.path === c.path);
    let page = 0;
    for (const s of a.sourceEvidence) {
      baselineUnits++;
      if (!c.sourceEvidence.some((u: any) => isDeepStrictEqual(u, s))) throw new Error('BASELINE_UNIT_CHANGED');
    }
    for (const s of c.sourceEvidence) {
      if (!b.sourceEvidence.some((u: any) => isDeepStrictEqual(u, s))) throw new Error('C_NOT_SUBSET_OF_B');
      const filename = resolve(root, 'K/docs/llm-wiki', s.path);
      if (!filename.startsWith(resolve(root, 'K/docs/llm-wiki/raw') + '/')) throw new Error('RAW_ROOT_ESCAPE');
      const raw = readFileSync(filename, 'utf8'), transcript = s.path.startsWith('raw/transcripts/');
      const content = transcript ? raw.match(/^##\s+线程消息[^\n]*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m)?.[1]?.trim() ?? ''
        : raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
      const expected = relevantSourceContent(content, terms, Number.MAX_SAFE_INTEGER, transcript);
      if (!expected.contextComplete || expected.content !== s.content) throw new Error('NOT_COMPLETE_ORIGINAL_UNIT');
      checkedOriginalUnits++; page += s.content.length;
    }
    if (page > 4800 || c.applicability !== a.applicability) throw new Error('PAGE_CAP_OR_APPLICABILITY');
    total += page;
  }
  if (total > 7200 || row.C.evidence.length > 3) throw new Error('TOTAL_CAP');
}
checks.originalSourceUnitsAndBounds = true;
checks.baselinePreservedAndSubsetOfB = true;
checks.all32AdditionsAudited = new Set(audit.details.map((x: any) => x.auditId)).size === 32;
checks.qualityConclusionAgrees = acceptance.oldGatePassed === (report.gate.knownMismatchBlocked
  && report.gate.allSixGainsKept && report.gate.sourceSafetyPassed && report.gate.performancePassed && !report.mechanical.invalidUnits);
checks.noNew32BeforeGate = !readdirSync(out).some(n => /^(?:holdout|answer|requests)/.test(n)) && !acceptance.new32Prepared;
checks.noModelsAndGOff = acceptance.networkRequests === 0 && acceptance.answerCalls === 0
  && acceptance.judgeCalls === 0 && acceptance.G === 'disabled';
if (Object.values(checks).some(v => !v)) throw new Error('VERIFY_FAILED:' + JSON.stringify(checks));
const result = { passed: true, checks, checkedOriginalUnits, baselineUnits, sourceLabels: 32,
  networkRequests: 0, answerCalls: 0, judgeCalls: 0, G: 'disabled', oldGatePassed: acceptance.oldGatePassed,
  meaning: 'Integrity passed does not mean source relevance or experiment acceptance passed.' };
writeFileSync(resolve(out, 'verification.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify(result) + '\n');
