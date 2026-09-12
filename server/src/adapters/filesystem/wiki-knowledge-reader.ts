import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { redactSupportText } from "../../domain/support-ticket-analysis.js";
import { WikiQaError, type WikiCandidate, type WikiKnowledgeReader, type WikiSourceEvidence } from "../../domain/wiki-qa.js";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_CANDIDATES = 20;

// Read the scalar/string-list subset used by SCHEMA.md. Unrecognized forms
// remain unknown, never a confirmed status or a permissive environment.
function metadata(text: string, key: string): string[] {
  const header = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? "";
  const lines = header.split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (index < 0) return [];
  const scalar = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed.startsWith('"')) {
      try { const parsed: unknown = JSON.parse(trimmed); return typeof parsed === "string" ? parsed : ""; } catch { return ""; }
    }
    if (trimmed.startsWith("'")) return /^'(?:[^']|'')*'$/.test(trimmed) ? trimmed.slice(1, -1).replaceAll("''", "'") : "";
    return /^[^\[\]{}&*!|>#]+(?:\s+#.*)?$/.test(trimmed) ? trimmed.replace(/\s+#.*$/, "").trim() : "";
  };
  const value = lines[index].slice(key.length + 1).trim();
  if (value.startsWith("[")) {
    if (!value.endsWith("]")) return [];
    return (value.slice(1, -1).match(/"(?:\\.|[^"\\])*"|'(?:[^']|'')*'|[^,]+/g) ?? []).map(scalar).filter(Boolean);
  }
  if (value) return [scalar(value)].filter(Boolean);
  const values: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (/^[^\s#]/.test(line) && !line.startsWith("- ")) break;
    const match = line.match(/^\s*-\s+(.+)$/);
    if (match) values.push(scalar(match[1]));
  }
  return values.filter(Boolean);
}

function terms(text: string): string[] {
  const normalized = text.toLowerCase();
  return [...new Set([
    ...(normalized.match(/[a-z0-9_][a-z0-9_.-]+/g) ?? []),
    ...[...normalized.matchAll(/[\u3400-\u9fff]{2,}/g)].flatMap(([phrase]) =>
      Array.from({ length: phrase.length - 1 }, (_, index) => phrase.slice(index, index + 2))),
  ])].filter((term) => !["odoo", "eu", "uk", "us", "17", "18", "如何", "怎么", "什么", "问题"].includes(term));
}

function excerpt(text: string, queryTerms: string[], maxLength: number): string {
  const clean = redactSupportText(text);
  if (clean.length <= maxLength) return clean;
  const paragraphs = clean.split(/\n\s*\n/).map((content, index) => ({
    content, index, score: queryTerms.filter((term) => content.toLowerCase().includes(term)).length,
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  let size = 0;
  const selected = paragraphs.filter((paragraph) => {
    if (size >= maxLength) return false;
    size += paragraph.content.length + 2;
    return true;
  }).sort((a, b) => a.index - b.index);
  return `${selected.map((p) => p.content).join("\n\n").slice(0, maxLength)}\n[内容已截取，省略部分未经本轮核对]`;
}

function sourcePaths(text: string): string[] {
  return [...new Set(text.match(/raw\/(?:transcripts|documents)\/[^\s\]\)"'<>]+\.md/g) ?? [])];
}

function linkedConcepts(text: string, path: string, pages: string[]): string[] {
  const links = [...text.matchAll(/\]\(([^)\s]+)(?:\s+[^)]*)?\)|\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)];
  const found = new Set<string>();
  for (const match of links) {
    const link = (match[1] ?? match[2]).split("#")[0];
    for (const page of pages) {
      if (match[1] ? resolve("/wiki", dirname(path), link) === resolve("/wiki", page)
        : page === link || page === `${link}.md` || page.endsWith(`/${link}.md`)) found.add(page);
    }
  }
  return [...found];
}

export function createWikiKnowledgeReader(deps: { workspaceDir?: string } = {}): WikiKnowledgeReader {
  return {
    async search(input) {
      input.signal?.throwIfAborted();
      try {
        const workspace = deps.workspaceDir ?? process.env.SUPPORT_QA_EU_WORKSPACE_DIR?.trim();
        if (!workspace) throw new Error("Workspace missing");
        const root = await realpath(resolve(workspace, "docs/llm-wiki"));
        const within = (path: string) => { const rel = relative(root, path); return rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel); };
        async function read(path: string, optional = false): Promise<string | undefined> {
          input.signal?.throwIfAborted();
          if (path.split("/").includes("..") || !within(resolve(root, path)) || !path.endsWith(".md")) return undefined;
          let canonical: string;
          try { canonical = await realpath(resolve(root, path)); } catch (error) {
            if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
            throw error;
          }
          if (!within(canonical)) return undefined;
          const rawKind = ["raw/transcripts/", "raw/documents/"].find((prefix) => path.startsWith(prefix));
          if (rawKind && !relative(root, canonical).startsWith(rawKind)) return undefined;
          const info = await stat(canonical);
          if (!info.isFile() || info.size > MAX_FILE_BYTES) return undefined;
          const buffer = await readFile(canonical, { signal: input.signal });
          if (buffer.length > MAX_FILE_BYTES) return undefined;
          return buffer.toString("utf8");
        }
        async function scan(directory: string): Promise<string[]> {
          input.signal?.throwIfAborted();
          const canonical = await realpath(resolve(root, directory));
          if (!within(canonical)) return [];
          const entries = await readdir(canonical, { withFileTypes: true });
          const paths: string[] = [];
          for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
            const path = `${directory}/${entry.name}`;
            if (entry.isDirectory()) paths.push(...await scan(path));
            else if (entry.isFile() && entry.name.endsWith(".md")) paths.push(path);
          }
          return paths;
        }
        const queryTerms = terms([input.question, ...input.keywords, ...input.objects].join(" "));
        const pages: Array<{ path: string; text: string; score: number }> = [];
        for (const path of await scan("concepts")) {
          const text = await read(path);
          if (!text) continue;
          const environments = metadata(text, "environments");
          if (input.environments.length && environments.length && !environments.includes("待确认")
            && !input.environments.some((environment) => environments.includes(environment))) continue;
          const title = metadata(text, "title").join(" ").toLowerCase();
          const tags = ["objects", "processes", "tags"].flatMap((key) => metadata(text, key)).join(" ").toLowerCase();
          const content = text.toLowerCase();
          const score = queryTerms.reduce((total, term) => total + (title.includes(term) ? 4 : 0)
            + (tags.includes(term) ? 3 : 0) + (content.includes(term) ? 2 : 0), 0);
          pages.push({ path, text, score });
        }
        // Navigation pages contribute links, never independent knowledge hits.
        const navigation = ["index.md"];
        try { navigation.push(...await scan("entities")); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        for (const path of navigation) {
          const text = await read(path, true);
          if (!text) continue;
          for (const line of text.split("\n")) {
            if (!queryTerms.some((term) => line.toLowerCase().includes(term))) continue;
            const linked = linkedConcepts(line, path, pages.map((page) => page.path));
            for (const page of pages) if (linked.includes(page.path)) page.score += 1;
          }
        }
        const candidates: WikiCandidate[] = [];
        for (const page of pages.filter((page) => page.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, MAX_CANDIDATES)) {
          input.signal?.throwIfAborted();
          const id = `wiki-${candidates.length + 1}`;
          const state = metadata(page.text, "status")[0];
          const status = state === "confirmed" || state === "draft" ? state : "unknown";
          const environments = metadata(page.text, "environments");
          const limitations: string[] = [];
          if (status !== "confirmed") limitations.push(status === "draft" ? "草稿资料，尚未人工确认" : "页面状态未确认");
          const unknownEnvironment = !input.environments.length || !environments.length || environments.includes("待确认");
          if (unknownEnvironment) limitations.push("当前问题或资料的适用环境待确认");
          if (metadata(page.text, "contested")[0] === "true") limitations.push("资料标记有未决冲突");
          const sources: WikiSourceEvidence[] = [];
          const paths = sourcePaths(page.text);
          for (const path of paths.slice(0, 12)) {
            const source = await read(path, true);
            if (!source) { limitations.push("部分原始来源不可读取"); continue; }
            // Shadow AI analysis in a raw snapshot is not primary evidence.
            const thread = source.match(/^##\s+线程消息[^\n]*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m)?.[1]?.trim() ?? "";
            const isTranscript = path.startsWith("raw/transcripts/");
            const content = isTranscript ? thread : source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
            const complete = isTranscript ? metadata(source, "history_complete")[0] === "true"
              && Boolean(metadata(source, "thread_id")[0]) && Boolean(thread) : Boolean(content.trim());
            sources.push({ id: `${id}-source-${sources.length + 1}`, path, complete, content });
          }
          if (paths.length > 12) limitations.push("本轮仅核对前 12 个原始来源");
          if (!sources.length || sources.some((source) => !source.complete)) limitations.push("原始证据缺失或聊天快照不完整");
          const sourceScore = (source: WikiSourceEvidence) => queryTerms.filter((term) => source.content.toLowerCase().includes(term)).length;
          const selectedSources = sources.sort((a, b) => sourceScore(b) - sourceScore(a) || a.path.localeCompare(b.path)).slice(0, 3);
          if (sources.length > selectedSources.length) limitations.push("本轮按相关性摘录最多 3 个原始来源，其余未核对");
          const sourceEvidence = selectedSources.map((source) => ({ ...source,
            content: excerpt(source.content, queryTerms, Math.floor(2400 / selectedSources.length)),
          }));
          const lowConfidence = metadata(page.text, "confidence")[0] === "low";
          if (lowConfidence) limitations.push("资料置信度低，仅供历史参考");
          candidates.push({ id, path: page.path, title: redactSupportText(metadata(page.text, "title")[0] || page.text.match(/^#\s+(.+)$/m)?.[1] || page.path),
            status, environments, content: excerpt(page.text, queryTerms, 2400), sourceEvidence,
            limitations: [...new Set(limitations)], historicalOnly: unknownEnvironment || status === "unknown" || lowConfidence || !sourceEvidence.some((source) => source.complete),
          });
        }
        return candidates;
      } catch (error) {
        input.signal?.throwIfAborted();
        if (error instanceof WikiQaError) throw error;
        throw new WikiQaError("WIKI_QA_UNAVAILABLE", "Wiki 知识库暂不可读取，请检查服务端 workspace 和文件权限。", {
          layer: "adapter", module: "wiki-knowledge-reader", stage: "server.wiki_qa.retrieve",
        });
      }
    },
  };
}
