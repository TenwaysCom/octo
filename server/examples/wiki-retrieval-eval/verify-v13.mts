import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { hash } from './inputs-v7.mts';

globalThis.fetch = async () => { throw new Error('Network forbidden in v13 verification'); };
process.env.LOG_LEVEL = 'silent';
const root = '/tmp/octo-wiki-rag-v13', repo = process.cwd(), out = resolve('docs/tasks/ai-ticket/wiki-rag-v13');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const manifest = (dir: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const e of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (e.isFile() && !e.isSymbolicLink()) {
      const p = resolve(e.parentPath, e.name); result[relative(dir, p)] = hash(readFileSync(p));
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
};
const frozen = read(resolve(out, 'initial-freeze.json'));
const checks: Record<string, boolean> = {};
checks.sharedApplicationUnchanged = isDeepStrictEqual(manifest(resolve(repo, 'server/src')), frozen.sharedApplicationBefore);
checks.baselineUnchanged = isDeepStrictEqual(manifest(resolve(root, 'baseline/server/src')), frozen.baselineCode);
checks.knowledgeUnchanged = isDeepStrictEqual(manifest(resolve(root, 'K')), frozen.knowledge);
checks.priorArtifactsUnchanged = Object.entries(frozen.previousArtifacts).every(([name, files]) =>
  isDeepStrictEqual(manifest(resolve('docs/tasks/ai-ticket', name)), files));
const code = manifest(resolve(root, 'candidate/server/src'));
const test = 'domain/wiki-primary-budget.test.ts';
checks.candidateOnlyFrozenCodeAndTest = isDeepStrictEqual(code, { ...frozen.candidateCode,
  [test]: hash(readFileSync(resolve('server/examples/wiki-retrieval-eval/primary-budget-v13.test.ts'))) });
const replay = read(resolve(out, 'old-replay.json'));
const data = read(resolve(root, 'old-results.private.json'));
if (data.length !== 137 || replay.details.length !== 137) throw new Error('Expected 137 cases');
const { relevantSourceContent, wikiQueryTerms, wikiMatchCount } = await import(pathToFileURL(resolve(root, 'baseline/server/src/domain/wiki-evidence.ts')).href);
let sourceChecks = 0;
const known: any[] = [];
for (const row of data) {
  const terms = wikiQueryTerms([row.query.question, ...row.query.keywords, ...row.query.objects].join(' '));
  const report = replay.details.find((r: any) => r.id === row.id);
  if (!isDeepStrictEqual(row.A.evidence.map((e: any) => e.path), row.B.evidence.map((e: any) => e.path))) throw new Error('Page selection changed');
  let total = 0;
  for (const [index, e] of row.B.evidence.entries()) {
    const old = row.A.evidence[index];
    for (const s of old.sourceEvidence) if (!e.sourceEvidence.some((u: any) => isDeepStrictEqual(u, s))) throw new Error('Prior source changed');
    let page = 0;
    for (const s of e.sourceEvidence) {
      const sourceFile = resolve(root, 'K/docs/llm-wiki', s.path);
      if (!sourceFile.startsWith(resolve(root, 'K/docs/llm-wiki/raw') + '/')) throw new Error('Wrong source root');
      const raw = readFileSync(sourceFile, 'utf8');
      const transcript = s.path.startsWith('raw/transcripts/');
      const content = transcript ? raw.match(/^##\s+线程消息[^\n]*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m)?.[1]?.trim() ?? ''
        : raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
      const expected = relevantSourceContent(content, terms, Number.MAX_SAFE_INTEGER, transcript);
      if (s.content !== expected.content || !expected.contextComplete) throw new Error('Not the complete original unit');
      sourceChecks++; page += s.content.length;
      if (row.id === 'E8-N2' && !old.sourceEvidence.some((o: any) => o.id === s.id)) known.push({
        source: s.path, sourceSha256: hash(raw), unitSha256: hash(s.content), chars: s.content.length,
        matchedTerms: terms.filter((t: string) => wikiMatchCount(s.content, [t]) > 0),
        hasReviewText: /review/i.test(s.content), hasBankLineText: /update bank line/i.test(s.content),
        sourceAlreadyLinkedByWiki: readFileSync(resolve(root, 'K', e.path), 'utf8').includes(s.path),
      });
    }
    if (page > 4800) throw new Error('Page cap exceeded');
    total += page;
    if (report.runs.find((r: any) => r.arm === 'B').final[index].primaryChars !== page) throw new Error('Report size differs');
    if (e.applicability !== old.applicability) throw new Error('Applicability upgraded');
  }
  if (total > 7200 || row.B.evidence.length > 3) throw new Error('Question caps exceeded');
}
checks.completeOriginalUnits = true; checks.baselineEvidencePreserved = true;
checks.pageAndQuestionCaps = true; checks.pageSelectionUnchanged = true;
checks.noApplicabilityUpgrade = true;
checks.noLiveOrAnswerArtifacts = !readdirSync(out).some(n => /^(?:requests\.jsonl|holdout-|answer)/.test(n));
checks.confirmedUnrelatedAddedSource = known.length === 1 && known[0].source.includes('ticket-1488.')
  && known[0].chars === 824 && !known[0].hasReviewText && known[0].hasBankLineText && known[0].sourceAlreadyLinkedByWiki;
checks.mechanicalGateAgrees = replay.mechanicalPassed && replay.gate.u14Restored && replay.gate.u08Diagnostic;
if (Object.values(checks).some(v => !v)) throw new Error('Verification failed: ' + JSON.stringify(checks));
writeFileSync(resolve(out, 'verification.json'), JSON.stringify({ checks, passed: true, sourceChecks,
  cases: 137, networkRequests: 0, answerModelCalls: 0, judgeModelCalls: 0, G: 'disabled',
  knownRegression: known, qualityGate: 'failed: unrelated source added to an already correctly ranked page',
  meaning: 'Verification success proves experimental integrity; it does not mean quality acceptance passed.' }, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify({ checks, sourceChecks, networkRequests: 0, qualityGate: 'failed', knownRegression: known }) + '\n');
