// Experiment-only policy, copied into the isolated candidate; never imported by production.
export interface PrimaryUnit { id: string; path: string; content: string; complete: boolean }
export interface BudgetPage { key: string; existing: PrimaryUnit[]; units: PrimaryUnit[] }
export interface BudgetLimits { page: number; total: number }

export function allocatePrimaryBudget(pages: BudgetPage[], limits: BudgetLimits) {
  if (![limits.page, limits.total].every(n => Number.isSafeInteger(n) && n > 0)
    || pages.length > 3 || new Set(pages.map(p => p.key)).size !== pages.length) throw new Error('INVALID_BUDGET_INPUT');
  const kept = new Map<string, Set<string>>();
  const sizes = new Map<string, number>();
  const decisions: { page: string; source: string; chars: number; reason: string }[] = [];
  let used = 0;
  for (const p of pages) {
    if (new Set(p.units.map(u => u.id)).size !== p.units.length
      || new Set(p.existing.map(u => u.id)).size !== p.existing.length) throw new Error('DUPLICATE_SOURCE_UNIT');
    const ids = new Set<string>();
    let size = 0;
    for (const old of p.existing) {
      const unit = p.units.find(u => u.id === old.id);
      if (!unit || unit.path !== old.path || unit.content !== old.content || unit.complete !== old.complete
        || !unit.content) throw new Error('BASELINE_UNIT_CHANGED');
      ids.add(unit.id); size += unit.content.length;
      decisions.push({ page: p.key, source: unit.path, chars: unit.content.length, reason: 'baseline_reserved' });
    }
    if (size > limits.page) throw new Error('BASELINE_PAGE_OVER_LIMIT');
    used += size; kept.set(p.key, ids); sizes.set(p.key, size);
  }
  if (used > limits.total) throw new Error('BASELINE_TOTAL_OVER_LIMIT');
  const reserved = used;
  for (const p of pages) {
    const ids = kept.get(p.key)!;
    for (const unit of p.units) {
      if (ids.has(unit.id) || !unit.content) continue;
      const size = unit.content.length;
      const reason = sizes.get(p.key)! + size > limits.page ? 'page_limit'
        : used + size > limits.total ? 'total_limit' : 'added';
      decisions.push({ page: p.key, source: unit.path, chars: size, reason });
      if (reason !== 'added') continue;
      ids.add(unit.id); sizes.set(p.key, sizes.get(p.key)! + size); used += size;
    }
  }
  return { reserved, used, decisions,
    pages: pages.map(p => ({ key: p.key, sources: p.units.filter(u => kept.get(p.key)!.has(u.id)) })) };
}
