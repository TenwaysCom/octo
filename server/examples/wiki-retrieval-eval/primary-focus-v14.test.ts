// Copied into the isolated server; Vitest globals follow project conventions.
import { checkAddedPrimary } from './wiki-primary-focus.js';
import { allocatePrimaryBudget } from './wiki-primary-budget.js';

describe('v14 incremental direct question focus', () => {
  it('does not admit a source on a generic object alone', () => {
    expect(checkAddedPrimary('凭证如何复制Review时间？', 'M1\n凭证有金额。').allow).toBe(false);
  });
  it('recognizes a field without a field-name whitelist', () => {
    const r = checkAddedPrimary('复制AuditStamp时间后仍保留？', 'M1\nAuditStamp remains after copying.');
    expect(r.allow).toBe(true); expect(r.anchors).toContain('auditstamp');
  });
  it('does not bypass an explicit field with two broad action clues', () => {
    expect(checkAddedPrimary('复制AuditStamp时间失败', 'M1\n复制失败').allow).toBe(false);
  });
  it('requires the detailed error cause rather than a broad wrapper', () => {
    expect(checkAddedPrimary('OwlError Caused by EvalError', 'M1\nOwlError: import failed.').allow).toBe(false);
    expect(checkAddedPrimary('OwlError Caused by EvalError', 'M1\nEvalError occurred.').allow).toBe(true);
  });
  it('uses two distinct clue families with an action', () => {
    expect(checkAddedPrimary('反冲时必填缺失', 'M1\n历史反冲遇到必填限制。').allow).toBe(true);
    expect(checkAddedPrimary('反冲反冲反冲', 'M1\n反冲。反冲。').allow).toBe(false);
  });
  it('does not count synonyms as independent clues', () => {
    expect(checkAddedPrimary('反冲 reverse', 'M1\n反冲 reverse reversal').allow).toBe(false);
  });
  it('does not bridge distant original messages', () => {
    expect(checkAddedPrimary('反冲必填', 'M1\n反冲\n\nM9\n必填').allow).toBe(false);
    expect(checkAddedPrimary('反冲必填', 'M1\n反冲\n\nM2\n必填').allow).toBe(true);
  });
  it('ignores sender metadata and source identity as evidence', () => {
    expect(checkAddedPrimary('反冲必填', 'M1\n- **[2026-10-22] 反冲必填**(user): 凭证').allow).toBe(false);
  });
  it('has no automatic translation or generated keyword fallback', () => {
    expect(checkAddedPrimary('复制复核信息', 'M1\ncopy review information').allow).toBe(false);
  });
  it('fails closed on missing or duplicated block ordinals', () => {
    expect(checkAddedPrimary('反冲必填','反冲必填').allow).toBe(false);
    expect(checkAddedPrimary('反冲必填','M1\n反冲必填\n\nM1\n反冲必填').allow).toBe(false);
  });
  it('only removes additions after budget allocation without refilling', () => {
    const unit = (id: string, content: string) => ({ id, path: id, content, complete: false });
    const old = unit('old', 'M1\n凭证');
    const bad = unit('bad', 'M1\n凭证金额');
    const later = unit('later', 'M1\n反冲必填');
    const budget = allocatePrimaryBudget([{ key: 'p', existing: [old], units: [old, bad, later] }],
      { page: old.content.length + bad.content.length, total: 7200 });
    const sources = budget.pages[0].sources.filter(s => s.id === old.id || checkAddedPrimary('反冲必填', s.content).allow);
    expect(sources).toEqual([old]); expect(sources[0].complete).toBe(false);
  });
  it('keeps the entire original unit including a later reversal', () => {
    const content = 'M1\n反冲必填\n\nM8\n更正：之前操作无效，不能照做。';
    expect(checkAddedPrimary('反冲必填', content).allow).toBe(true);
    // Gate returns a decision, never a replacement/truncated source body.
    expect('content' in checkAddedPrimary('反冲必填', content)).toBe(false);
  });
});
