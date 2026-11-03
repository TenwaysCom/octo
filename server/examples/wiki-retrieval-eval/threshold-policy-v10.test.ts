/// <reference types="vitest/globals" />
// Copied into the isolated candidate service directory for Vitest.
import { decideThreshold, hasPrimaryAndBody } from './wiki-qa-threshold-policy.js';
import { createWikiQaService } from './wiki-qa.service.js';
import type { WikiCandidate } from '../../domain/wiki-qa.js';

const candidates = [{ knowledgeType: 'support_wiki' }, { knowledgeType: 'ontology' }, { knowledgeType: 'support_wiki' }];
const policy = { strategy: 'D' as const, floor: .4, gap: .2 };
const scores = (a: number, b: number) => [{ index: 0, relevance_score: a }, { index: 1, relevance_score: b }];
describe('isolated v10 threshold qualification', () => {
  it('retains the low Sign top1 and keeps its original score', () => {
    const d = decideThreshold(scores(.482614815, .028346812), candidates, policy);
    expect(d.lowFallback).toBe(true); expect(d.selected).toEqual([{ index: 0, relevance_score: .482614815 }]);
  });
  it('rejects a higher-scored but closely competing negative', () => {
    expect(decideThreshold(scores(.647834, .473126), candidates, policy).selected).toEqual([]);
  });
  it('uses the original Ontology runner-up even if it cannot be rescued', () => {
    const d = decideThreshold([...scores(.49, .45), { index: 2, relevance_score: .01 }], candidates, policy);
    expect(d.reason).toBe('insufficient_gap');
  });
  it('keeps the high-score channel and never adds low candidates', () => {
    const d = decideThreshold(scores(.7, .49), candidates, policy);
    expect(d.lowFallback).toBe(false); expect(d.selected).toEqual([{ index: 0, relevance_score: .7 }]);
  });
  it('does not promote rank2 when top1 is Ontology', () => {
    const d = decideThreshold([{ index: 1, relevance_score: .6 }, { index: 0, relevance_score: .3 }], candidates, policy);
    expect(d.reason).toBe('low_ontology_not_rescued'); expect(d.selected).toEqual([]);
  });
  it('rejects a missing competitor', () => {
    expect(decideThreshold(scores(.49, .01).slice(0, 1), candidates, policy).reason).toBe('missing_competitor');
  });
  it('rejects ties and empty results', () => {
    expect(decideThreshold(scores(.49, .49), candidates, policy).selected).toEqual([]);
    expect(decideThreshold([], candidates, policy).selected).toEqual([]);
  });
  it('rejects a low floor even with a large lead', () => {
    expect(decideThreshold(scores(.399, .001), candidates, policy).reason).toBe('below_floor');
  });
  it('simulates WeKnora-style .15 fallback without a gap condition', () => {
    expect(decideThreshold(scores(.49, .48), candidates, { ...policy, strategy: 'C' }).lowFallback).toBe(true);
    expect(decideThreshold(scores(.149, .01), candidates, { ...policy, strategy: 'C' }).selected).toEqual([]);
  });
  it('keeps uniform lowering as a separate multi-candidate control', () => {
    expect(decideThreshold(scores(.49, .48), candidates, { ...policy, strategy: 'B' }).selected).toHaveLength(2);
  });
  it.each([NaN, Infinity, -.1, 1.01])('refuses invalid score %s', value => {
    expect(() => decideThreshold(scores(value, .01), candidates, policy)).toThrow('Invalid rerank response');
  });
  it('refuses duplicate or invalid indices without rewriting competitors', () => {
    expect(() => decideThreshold([{ index: 0, relevance_score: .5 }, { index: 0, relevance_score: .01 }], candidates, policy)).toThrow();
    expect(() => decideThreshold([{ index: 4, relevance_score: .5 }], candidates, policy)).toThrow();
  });
  it('requires actual nonempty body and original evidence for fallback', () => {
    expect(hasPrimaryAndBody({ content: ' ', sourceEvidence: [{ content: 'source' }] })).toBe(false);
    expect(hasPrimaryAndBody({ content: 'body', sourceEvidence: [] })).toBe(false);
    expect(hasPrimaryAndBody({ content: 'body', sourceEvidence: [{ content: ' ' }] })).toBe(false);
    expect(hasPrimaryAndBody({ content: 'body', sourceEvidence: [{ content: 'source' }] })).toBe(true);
  });
});

function fixture(values = scores(.49, .01), primary = true) {
  const pages: WikiCandidate[] = [0, 1].map(i => ({ id: 'p' + i, path: 'concepts/p' + i + '.md', knowledgeType: 'support_wiki',
    title: 'Sign document archive', status: 'draft', environments: [], content: 'Sign document Archive historical reference',
    sourceEvidence: primary ? [{ id: 's' + i, path: 'raw/transcripts/p' + i + '.md', content: 'Remove Sign document: Archive', complete: true }] : [],
    limitations: ['No permanent deletion or current permission verified'], historicalOnly: true }));
  const rerank = vi.fn().mockResolvedValue({ mode: 'rerank', model: 'mock', results: values });
  const selectEvidence = vi.fn(({ candidate }: { candidate: WikiCandidate }) => candidate.sourceEvidence);
  const service = createWikiQaService({ thresholdPolicy: policy, reader: { search: async () => pages, selectEvidence },
    client: { createJsonCompletion: async () => ({ model: 'frozen', content: JSON.stringify({ question: 'Remove Sign document', keywords: ['Sign'], objects: [], environments: [] }) }) },
    rerankClient: { rerank }, promptStore: { getByKey: async () => undefined }, extractLog: () => {}, answerLog: () => {} });
  return { service, pages, rerank, selectEvidence };
}
describe('isolated v10 service evidence and failure boundaries', () => {
  it('consumes a low result through the real service and preserves historical restrictions', async () => {
    const f = fixture(); const result = await f.service.retrieve({ ticketContext: 'Remove Sign document', actionRunId: 'v10-test' });
    expect(result.evidence).toHaveLength(1); expect(f.selectEvidence).toHaveBeenCalledOnce();
    expect(result.evidence[0]).toMatchObject({ applicability: 'historical_reference', status: 'draft' });
    expect(result.evidence[0].limitations).toContain('No permanent deletion or current permission verified');
  });
  it('does not return a title-only low result when primary evidence is absent', async () => {
    const f = fixture(scores(.49, .01), false);
    expect((await f.service.retrieve({ ticketContext: 'Remove Sign document', actionRunId: 'v10-missing-primary' })).evidence).toEqual([]);
  });
  it('does not attempt a lower candidate when a high result loses its source', async () => {
    const f = fixture(scores(.8, .49)); f.selectEvidence.mockImplementation(() => []);
    const result = await f.service.retrieve({ ticketContext: 'Remove Sign document', actionRunId: 'v10-high-rejected' });
    expect(f.selectEvidence).toHaveBeenCalledTimes(1);
    expect(result.evidence.every(e => e.path === f.pages[0].path)).toBe(true);
  });
  it('propagates an API failure and never returns the original recall', async () => {
    const f = fixture(); f.rerank.mockRejectedValue(new Error('timeout'));
    await expect(f.service.retrieve({ ticketContext: 'Remove Sign document', actionRunId: 'v10-api-fail' })).rejects.toMatchObject({ code: 'WIKI_QA_MODEL_FAILED' });
    expect(f.selectEvidence).not.toHaveBeenCalled(); expect(f.rerank).toHaveBeenCalledOnce();
  });
});
