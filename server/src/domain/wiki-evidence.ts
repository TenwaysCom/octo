import { redactSupportText } from "./support-ticket-analysis.js";

const tokens = (text: string) => (text.toLowerCase().match(/[a-z0-9_][a-z0-9_.-]+/g) ?? []).map((word) => word.replace(/[.-]+$/, ""));

const stopwords = new Set("odoo eu uk us 17 18 如何 怎么 什么 问题 the a an is are was were be been being to of in on at for from with and or as by this that these those it its they them their we our you your i me my do does did not no can could would should will have has had what which when where why how please help any also after before still only error issue problem ticket record user users current following using use get need needs confirm confirmed check first must collect steps affected known pattern flow template summary support qa thanks thank 以及 是否 需要 当前 请问 这个 情况 确认 用户 出现 处理".split(" "));

export function wikiQueryTerms(text: string): string[] {
  const normalized = text.toLowerCase();
  return [...new Set([
    ...tokens(normalized),
    ...[...normalized.matchAll(/[\u3400-\u9fff]{2,}/g)].flatMap(([phrase]) =>
      Array.from({ length: phrase.length - 1 }, (_, index) => phrase.slice(index, index + 2))),
  ])].filter((term) => !stopwords.has(term));
}

export const wikiMatchCount = (text: string, terms: string[]) => {
  const words = new Set(tokens(text));
  return terms.filter((term) => /^[a-z0-9_]/.test(term) ? words.has(term) : text.toLowerCase().includes(term)).length;
};
const matches = wikiMatchCount;

export function wikiErrorSignatures(text: string): string[] {
  const cause = text.match(/Caused by:\s*([A-Za-z]\w*(?:Error|Exception))\b/i)?.[1];
  if (cause) return [cause.toLowerCase()];
  const names = [...new Set(text.match(/\b[A-Za-z]\w*(?:Error|Exception)\b/g) ?? [])];
  const specific = names.filter((name) => !["OwlError", "UncaughtPromiseError", "RPCError"].includes(name));
  return (specific.length ? specific : names).map((name) => name.toLowerCase());
}

export function supportsWikiQuestion(question: string, terms: string[], content: string): boolean {
  const signatures = wikiErrorSignatures(question);
  return signatures.length ? matches(content, signatures) > 0 : matches(content, terms) > 0;
}
const qualification = /前提|条件|仅限|只有|除非|不适用|限制|例外|注意|冲突|纠正|更正|判断有误|仍未|未解决|失败|无效|仍然|尚未|不能|不要|不得|验证|恢复|已解决|成功|已修复|显示正常|prerequisite|condition|exception|not applicable|correction|incorrect|still|failed|doesn.t work|only if|unless|verified|resolved/i;

// Select complete sections/paragraphs: never slice a rule away from its caveat.
export function relevantWikiContent(text: string, terms: string[], maxLength = 2400): string {
  const clean = redactSupportText(text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")).trim();
  const sections = clean.split(/\n(?=#{1,6}\s)/).filter((section) =>
    !/^#{1,6}\s+(?:Maintenance Notes|维护说明|维护备注|Related Tickets|关联工单|Resolution Summary Template|结论摘要模板)\s*$/im.test(section.split("\n")[0]));
  const scored = sections.map((content, index) => ({ content, index, score: matches(content, terms) }));
  if (!scored.some((item) => item.score)) return "";
  const guards = scored.filter((item) => qualification.test(item.content.split("\n")[0]));
  const guardSize = guards.reduce((sum, item) => sum + item.content.length + 2, 0);
  if (guardSize > maxLength) return "";
  const selected = scored.filter((item) => item.score > 0 && !guards.includes(item))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const kept = [...guards];
  let size = guardSize;
  for (const item of selected) {
    if (size + item.content.length + (kept.length ? 2 : 0) > maxLength) continue;
    kept.push(item);
    size += item.content.length + (kept.length > 1 ? 2 : 0);
  }
  if (!kept.some((item) => item.score > 0)) return "";
  const content = kept.sort((a, b) => a.index - b.index).map((item) => item.content).join("\n\n");
  return content ? `${content}\n[相关知识摘录；未包含的内容未经本轮核对]` : "";
}

export interface SourceExcerpt { content: string; contextComplete: boolean }

// Input is the original source, not the earlier budget-truncated rerank excerpt.
// M/P ordinals identify source blocks; original text, sender and time stay intact.
export function relevantSourceContent(text: string, terms: string[], maxLength: number, transcript: boolean): SourceExcerpt {
  const clean = redactSupportText(text).trim();
  const hasMessageHeaders = /^\s*-\s+\*\*\[/m.test(clean);
  const blocks = clean.split(hasMessageHeaders ? /\n(?=\s*-\s+\*\*\[)/ : /\n\s*\n/)
    .map((content) => content.trim()).filter(Boolean);
  const body = (content: string) => content.replace(/^\s*-\s+\*\*\[[^\n]*?\*\*(?:\([^\n]*?\))?\s*[:：]\s*/, "");
  const hitIndices = blocks.flatMap((content, index) => matches(body(content), terms) > 0 ? [index] : []);
  if (!hitIndices.length) return { content: "", contextComplete: false };
  const selected = new Set<number>();
  for (const index of hitIndices) {
    selected.add(index);
    // Adjacent original messages preserve the local question/reply relationship.
    if (index > 0) selected.add(index - 1);
    if (index + 1 < blocks.length) selected.add(index + 1);
  }
  // Late corrections and prerequisites may not repeat the query's keywords.
  // Conservatively keep these in the related source, even outside hit windows.
  blocks.forEach((content, index) => {
    if (qualification.test(body(content))) {
      selected.add(index);
      if (index > 0) selected.add(index - 1);
    }
  });
  const content = [...selected].sort((a, b) => a - b)
    .map((index) => `${transcript ? "M" : "P"}${index + 1}\n${blocks[index]}`).join("\n\n");
  // Do not keep a successful action while silently clipping its later reversal.
  if (content.length > maxLength) return { content: "", contextComplete: false };
  return { content, contextComplete: true };
}
