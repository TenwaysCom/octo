import { z } from "zod";

const httpUrl = z.string().max(3000).url().refine((value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
});
export const ticketAnswerSourceSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string().max(3000), kind: z.literal("web"), title: z.string().max(500), location: z.string().max(3000), href: httpUrl }),
  z.object({ id: z.string().max(3000), kind: z.literal("document"), title: z.string().max(500), location: z.string().max(3000) }),
  z.object({ id: z.string().max(3000), kind: z.literal("reference"), title: z.string().max(500), location: z.string().max(3000) }),
]);
export type TicketAnswerSource = z.infer<typeof ticketAnswerSourceSchema>;

function documentPath(target: string): string | undefined {
  let path = target.replace(/^\.\//, "");
  // Native agents may cite an absolute workspace path. Expose only its known
  // documentation suffix; this never reads a file or manufactures a preview URL.
  if (path.startsWith("/") && path.includes("/docs/")) path = path.slice(path.indexOf("/docs/") + 1);
  if (path.split("/").includes("..")) return;
  return /^(?:docs\/(?:llm-wiki|ontology)\/|(?:concepts|entities|raw|queries)\/)[^\s<>`]+\.md(?:#[^\s<>`]*|:\d+(?:-\d+)?)?$/.test(path) ? path : undefined;
}

/** References explicitly present in the answer, not verified retrieval hits. */
export function extractTicketAnswerSources(answer: string): TicketAnswerSource[] {
  const sources = new Map<string, TicketAnswerSource>();
  let inReferences = false, fence: string | undefined;
  function add(target: string, title?: string) {
    let source: TicketAnswerSource | undefined;
    if (/^https?:\/\//i.test(target)) {
      try {
        const url = new URL(target);
        source = { id: url.href, href: url.href, kind: "web", title: title || url.hostname, location: url.hostname };
      } catch { return; }
    } else {
      const path = documentPath(target);
      if (path) source = { id: path, kind: "document", title: title || path.replace(/(?:#.*|:\d+(?:-\d+)?)$/, "").split("/").at(-1)!, location: path };
      else if (/^case:[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(target)) source = { id: target, kind: "reference", title: title || target, location: target };
    }
    if (!source) return;
    const previous = sources.get(source.id);
    source.title = (title || previous?.title || source.title).replace(/[*`]/g, "").slice(0, 500);
    const parsed = ticketAnswerSourceSchema.safeParse(source);
    if (parsed.success && (sources.has(source.id) || sources.size < 50)) sources.set(source.id, parsed.data);
  }
  for (const line of answer.split("\n")) {
    const boundary = line.match(/^\s*(`{3,}|~{3,})/);
    if (boundary) {
      if (!fence) fence = boundary[1];
      else if (boundary[1][0] === fence[0] && boundary[1].length >= fence.length) fence = undefined;
      continue;
    }
    if (fence) continue;
    const label = line.replace(/^\s*#{1,6}\s+/, "").replace(/\*\*/g, "").trim();
    if (/^(?:依据|参考(?:来源|资料|文档|链接)?|来源|引用(?:来源)?|相关文档|sources|references|citations)\s*(?:[:：]|$)/i.test(label)) inReferences = true;
    else if (/^\s*#{1,6}\s+/.test(line) || /^(?:结论|问题|答案|待确认|反馈|边界说明|建议|下一步|适用范围|限制)\s*[:：]/.test(label)) inReferences = false;
    // Explicit links and inline document references do not need a section title.
    const remaining = line.replace(/\[([^\]\n]+)\]\(((?:[^\s()]|\([^()\s]*\))+)\)/g, (_match, title: string, target: string) => {
      add(target, title); return "";
    }).replace(/`([^`\n]+)`/g, (match, target: string) => {
      if (!documentPath(target) && !target.startsWith("case:")) return match;
      add(target); return "";
    });
    if (!inReferences && !/^\s*\[\d+\]:\s*/.test(line)) continue;
    const withoutUrls = remaining.replace(/https?:\/\/[^\s<>"'`]+/gi, (target) => {
      let url = target.replace(/[，。；、！？,.;:!?]+$/, "");
      for (const [open, close] of [["(", ")"], ["[", "]"]]) {
        while (url.endsWith(close) && url.split(close).length > url.split(open).length) url = url.slice(0, -1);
      }
      add(url); return "";
    });
    for (const match of withoutUrls.matchAll(/(?:docs\/(?:llm-wiki|ontology)\/|(?:concepts|entities|raw|queries)\/)[^\s<>`，。；、）)\]]+\.md(?:#[^\s<>`，。；、）)\]]*|:\d+(?:-\d+)?)?/g)) add(match[0]);
    for (const match of withoutUrls.matchAll(/\bcase:[A-Za-z0-9][A-Za-z0-9._:-]*/g)) add(match[0].replace(/[.:]+$/, ""));
  }
  return [...sources.values()];
}
