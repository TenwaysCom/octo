import { createHash } from 'node:crypto';

// Experiment-only input preparation. No production reader or evidence changes.
export const DOCUMENT_BUDGET = 3200;
export const QUERY_BUDGET = 2000;
export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export interface CandidateInput {
  title: string; environments: string[]; content: string;
  status: string; limitations: string[]; historicalOnly: boolean;
}
export function stripTargets(value: string): string {
  return value.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/raw\/(?:transcripts|documents)\/[^\s\]\)"'<>]+\.md/g, '');
}
export function originalDocument(candidate: CandidateInput): string {
  const document = JSON.stringify({ title: candidate.title, environments: candidate.environments, content: stripTargets(candidate.content) });
  if (document.length > DOCUMENT_BUDGET) throw new Error('Baseline document exceeds frozen common budget');
  return document;
}
export function scalar(text: string, key: string): string {
  const header = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? '';
  const raw = header.match(new RegExp(`^${key}:\\s*([^\\n]*)`, 'm'))?.[1]?.trim() ?? '';
  if (!raw || /^[>|\[\]{]/.test(raw)) return '';
  if (raw.startsWith('"')) { try { return JSON.parse(raw); } catch { return ''; } }
  return raw.replace(/^'(.*)'$/, '$1');
}
export function describedDocument(candidate: CandidateInput, page: string, queryTerms: string[], match: (text: string, terms: string[]) => number): { document: string; diagnostics: object } {
  const summary = stripTargets(scalar(page, 'summary'));
  const prefix = `标题：${candidate.title}\n适用环境：${candidate.environments.join('、') || '待确认'}\n资料状态：${candidate.status}；${candidate.historicalOnly ? '仅供历史或建模参考' : '适用性仍需按证据核对'}\n`;
  const constraints = candidate.limitations.length ? `资料限制：${candidate.limitations.join('；')}\n` : '';
  const summaryLine = summary ? `已有摘要：${summary}\n` : '';
  const wrapper = prefix + constraints + summaryLine + '正文：\n';
  const body = page.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim();
  const sections = body.split(/\n(?=#{1,6}\s)/).map((text, index) => ({ text: stripTargets(text).trim(), index }))
    .filter(({ text }) => !/^#{1,6}\s+(?:Maintenance Notes|维护说明|维护备注|Related Tickets|关联工单|Resolution Summary Template|结论摘要模板)\s*$/im.test(text.split('\n')[0]));
  const guardHeading = /适用|边界|限制|前提|条件|未解决|纠正|更正|结果|完成与停止|scope|boundar|limit|prerequisite|condition|correction|outcome/i;
  const guards = sections.filter(({ text }) => guardHeading.test(text.split('\n')[0]));
  const selected = new Set(guards.map(({ index }) => index));
  const available = DOCUMENT_BUDGET - wrapper.length;
  let used = guards.reduce((total, { text }) => total + text.length + 2, 0);
  if (available < 0) throw new Error('Required metadata exceeds frozen common budget');
  if (used > available) return { document: wrapper + '[完整适用边界超出本轮预算，正文未提供]', diagnostics: { bodyAvailable: false, reason: 'guard_budget_refusal' } };
  const matched = sections.filter(({ index, text }) => !selected.has(index) && match(text, queryTerms) > 0)
    .sort((a, b) => match(b.text, queryTerms) - match(a.text, queryTerms) || a.index - b.index);
  // Metadata-only recall may still provide the whole introduction and boundaries.
  const intro = sections.find(({ index }) => index === 0);
  const choices = [...matched, ...(intro && !matched.includes(intro) ? [intro] : [])];
  for (const section of choices) {
    if (selected.has(section.index) || used + section.text.length + 2 > available) continue;
    selected.add(section.index); used += section.text.length + 2;
  }
  const selectedBody = sections.filter(({ index }) => selected.has(index)).map(({ text }) => text).join('\n\n');
  const document = wrapper + (selectedBody || '[预算内无完整正文段落]');
  if (document.length > DOCUMENT_BUDGET) throw new Error('Prepared document exceeds frozen common budget');
  return { document, diagnostics: { bodyAvailable: Boolean(selectedBody), sections: [...selected], guardSections: guards.map(({ index }) => index), existingSummary: Boolean(summary) } };
}
