// Experiment only. Copied into an isolated service; never imported by server/src.
export type Strategy = 'A' | 'B' | 'C' | 'D';
export interface ThresholdPolicy { strategy: Strategy; floor: number; gap: number }
export interface Score { index: number; relevance_score: number }
export interface Decision {
  strategy: Strategy; reason: string; lowFallback: boolean; selected: Score[];
  s1: number | null; s2: number | null; gap: number | null;
}
export function decideThreshold(
  results: Score[], candidates: { knowledgeType?: string }[], policy: ThresholdPolicy,
): Decision {
  if (!['A', 'B', 'C', 'D'].includes(policy.strategy)
    || !Number.isFinite(policy.floor) || policy.floor < 0 || policy.floor >= .7
    || !Number.isFinite(policy.gap) || policy.gap < 0 || policy.gap > 1) throw new Error('Invalid experiment policy');
  if (results.length > 5 || new Set(results.map(r => r.index)).size !== results.length
    || results.some(r => !Number.isInteger(r.index) || r.index < 0 || r.index >= candidates.length
      || !Number.isFinite(r.relevance_score) || r.relevance_score < 0 || r.relevance_score > 1)) {
    throw new Error('Invalid rerank response; never rescue malformed scores');
  }
  const sorted = results.map(r => ({ ...r })).sort((a, b) => b.relevance_score - a.relevance_score);
  const s1 = sorted[0]?.relevance_score ?? null;
  const s2 = sorted[1]?.relevance_score ?? null;
  const gap = s1 !== null && s2 !== null ? s1 - s2 : null;
  const finish = (selected: Score[], reason: string, lowFallback = false): Decision =>
    ({ strategy: policy.strategy, selected, reason, lowFallback, s1, s2, gap });
  if (policy.strategy === 'B') return finish(sorted.filter(r => r.relevance_score >= policy.floor), 'uniform_lower_threshold');
  const high = sorted.filter(r => r.relevance_score >= .7);
  if (high.length) return finish(high, 'normal_threshold');
  if (policy.strategy === 'A' || !sorted.length) return finish([], 'no_high_score');
  if (policy.strategy === 'D') {
    if (s2 === null) return finish([], 'missing_competitor');
    if (s1! < policy.floor) return finish([], 'below_floor');
    if (gap! <= 0 || gap! < policy.gap) return finish([], 'insufficient_gap');
  } else if (s1! < .15) return finish([], 'below_weknora_floor');
  // Do not skip an Ontology top1 and promote a lower-ranked SupportWiki.
  if (candidates[sorted[0].index].knowledgeType !== 'support_wiki') return finish([], 'low_ontology_not_rescued');
  return finish(sorted.slice(0, 1), 'low_top1_eligible', true);
}

export function hasPrimaryAndBody(item: { content: string; sourceEvidence: { content: string }[] }): boolean {
  return Boolean(item.content.trim() && item.sourceEvidence.some(source => source.content.trim()));
}
