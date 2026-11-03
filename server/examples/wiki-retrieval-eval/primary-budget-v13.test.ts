// Copied into /tmp candidate/server/src/domain before running scoped Vitest.
import { allocatePrimaryBudget } from './wiki-primary-budget.js';

const unit = (id: string, chars: number, path = id) => ({ id, path, content: '文'.repeat(chars), complete: true });
describe('v13 shared primary evidence budget', () => {
  it('reserves later baseline evidence before extending a high ranked page', () => {
    const keep = unit('keep', 2400);
    const x = allocatePrimaryBudget([
      { key: 'first', existing: [], units: [unit('long', 4800)] },
      { key: 'second', existing: [keep], units: [keep] },
    ], { page: 4800, total: 7200 });
    expect(x.reserved).toBe(2400); expect(x.used).toBe(7200);
    expect(x.pages.map(p => p.sources.map(s => s.id))).toEqual([['long'], ['keep']]);
  });
  it.each([2400, 2401, 4800])('keeps a complete %i-character unit', n => {
    const u = unit('u', n);
    expect(allocatePrimaryBudget([{ key: 'p', existing: [], units: [u] }], { page: 4800, total: 7200 }).pages[0].sources).toEqual([u]);
  });
  it('rejects a 4801-character unit without cutting a later correction', () => {
    const u = { ...unit('u', 4790), content: '文'.repeat(4790) + '\n更正：此前操作失败。' };
    expect(u.content.length).toBeGreaterThan(4800);
    const x = allocatePrimaryBudget([{ key: 'p', existing: [], units: [u] }], { page: 4800, total: 7200 });
    expect(x.pages[0].sources).toEqual([]); expect(x.decisions[0].reason).toBe('page_limit');
  });
  it('does not evict baseline evidence when an earlier extension would exceed the total', () => {
    const keep = unit('keep', 2400);
    const x = allocatePrimaryBudget([
      { key: 'p1', existing: [], units: [unit('long', 4800)] },
      { key: 'p2', existing: [keep], units: [keep] },
      { key: 'p3', existing: [], units: [unit('extra', 1)] },
    ], { page: 4800, total: 7200 });
    expect(x.used).toBe(7200); expect(x.pages[1].sources).toEqual([keep]);
    expect(x.decisions.at(-1)?.reason).toBe('total_limit');
  });
  it('preserves source order even when a later source was reserved first', () => {
    const a = unit('a', 2531), b = unit('b', 1000);
    const x = allocatePrimaryBudget([{ key: 'p', existing: [b], units: [a, b] }], { page: 4800, total: 7200 });
    expect(x.pages[0].sources).toEqual([a, b]);
  });
  it('shares 7200 between whole packages of 4482 and 2531 without admitting a third', () => {
    const x = allocatePrimaryBudget([4482, 2531, 188].map((n, i) => ({ key: String(i), existing: [], units: [unit(String(i), n)] })),
      { page: 4800, total: 7200 });
    expect(x.used).toBe(7013); expect(x.pages[2].sources).toEqual([]);
  });
  it('counts JavaScript string length including Unicode and ordinal wrappers', () => {
    const u = { ...unit('u', 0), content: '[M1] 🧪\n更正：UK仍未验证' };
    const x = allocatePrimaryBudget([{ key: 'p', existing: [], units: [u] }], { page: u.content.length, total: u.content.length });
    expect(x.used).toBe(u.content.length); expect(x.pages[0].sources[0].content).toBe(u.content);
  });
  it('retains incomplete-source status and does not manufacture primary evidence for ontology', () => {
    const u = { ...unit('u', 100), complete: false };
    const x = allocatePrimaryBudget([{ key: 'support', existing: [u], units: [u] }, { key: 'ontology', existing: [], units: [] }], { page: 4800, total: 7200 });
    expect(x.pages[0].sources[0].complete).toBe(false); expect(x.pages[1].sources).toEqual([]);
  });
  it('rejects a changed or borrowed baseline unit', () => {
    expect(() => allocatePrimaryBudget([{ key: 'p', existing: [unit('x', 5, 'source-one')], units: [unit('x', 5, 'source-two')] }],
      { page: 4800, total: 7200 })).toThrow('BASELINE_UNIT_CHANGED');
  });
  it('rejects duplicate units, duplicate pages and more than three pages', () => {
    const u = unit('u', 1);
    expect(() => allocatePrimaryBudget([{ key: 'p', existing: [], units: [u, u] }], { page: 4800, total: 7200 })).toThrow('DUPLICATE_SOURCE_UNIT');
    expect(() => allocatePrimaryBudget(['p', 'p'].map(key => ({ key, existing: [], units: [] })), { page: 4800, total: 7200 })).toThrow('INVALID_BUDGET_INPUT');
    expect(() => allocatePrimaryBudget(['1', '2', '3', '4'].map(key => ({ key, existing: [], units: [] })), { page: 4800, total: 7200 })).toThrow('INVALID_BUDGET_INPUT');
  });
  it('fails instead of silently dropping baseline units over either cap', () => {
    const u = unit('u', 2400);
    expect(() => allocatePrimaryBudget([{ key: 'p', existing: [u], units: [u] }], { page: 2399, total: 7200 })).toThrow('BASELINE_PAGE_OVER_LIMIT');
    expect(() => allocatePrimaryBudget([{ key: 'p', existing: [u], units: [u] }], { page: 4800, total: 2399 })).toThrow('BASELINE_TOTAL_OVER_LIMIT');
  });
});
