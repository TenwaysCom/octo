import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { redactSupportText } from "../../domain/support-ticket-analysis.js";
import { WikiQaError, type WikiCandidate, type WikiKnowledgeReader, type WikiSourceEvidence } from "../../domain/wiki-qa.js";
import { relevantSourceContent, relevantWikiContent, wikiMatchCount, wikiQueryTerms as terms } from "../../domain/wiki-evidence.js";

const MAX_FILE_BYTES = 256 * 1024;
const DEFAULT_RECALL_LIMIT = 20;

interface KnowledgeRoot {
  root: string;
  publicRoot: "docs/llm-wiki" | "docs/ontology";
  knowledgeType: "support_wiki" | "ontology";
}

function readRecallLimit(): number {
  const configured = process.env.WIKI_QA_RECALL_LIMIT?.trim();
  const limit = configured ? Number(configured) : DEFAULT_RECALL_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new WikiQaError("WIKI_QA_UNAVAILABLE", "WIKI_QA_RECALL_LIMIT must be an integer from 1 to 100.", {
      layer: "server", module: "wiki-knowledge-reader", stage: "server.wiki_qa.retrieve.config",
    });
  }
  return limit;
}

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

function excerpt(text: string, queryTerms: string[], maxLength: number): string {
  const clean = redactSupportText(text);
  if (clean.length <= maxLength) return clean;
  const paragraphs = clean.split(/\n\s*\n/).map((content, index) => ({
    content, index, score: wikiMatchCount(content, queryTerms),
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  let size = 0;
  const selected = paragraphs.filter((paragraph) => {
    if (size >= maxLength) return false;
    size += paragraph.content.length + 2;
    return true;
  }).sort((a, b) => a.index - b.index);
  return `${selected.map((p) => p.content).join("\n\n").slice(0, maxLength)}\n[内容已截取，省略部分未经本轮核对]`;
}

const ontologyGuardHeading = /规则|条件|边界|限制|例外|安全|验证|冲突|待确认|状态|生命周期|rule|condition|boundary|limit|exception|security|validation|conflict|pending|state|lifecycle/i;

// Ontology pages are substantially longer than QA cards. Select whole matched
// sections first, then adjacent guard sections, without truncating a rule away
// from its boundary or allowing every guard section in the document to crowd
// the matched material out of the fixed context budget.
function relevantOntologyContent(text: string, queryTerms: string[], maxLength = 2400): string {
  // Match against the local source before redaction: stable ontology IDs such
  // as `sales-order-amendment` can resemble reference numbers. Redact only the
  // selected text that leaves this adapter.
  const clean = text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").trim();
  // Stable-id anchors in ontology pages commonly sit immediately before the
  // heading they identify. Treat the anchor and heading as one section start.
  const starts = [...clean.matchAll(/^(?:<a\b[^>\r\n]*><\/a>\r?\n)?#{1,6}\s/gim)].map((match) => match.index);
  if (!starts.length || starts[0] !== 0) starts.unshift(0);
  const sections = starts.map((start, index) => clean.slice(start, starts[index + 1] ?? clean.length).trim())
    .map((content, index) => ({
      content, index, score: wikiMatchCount(content, queryTerms),
    }));
  const matches = sections.filter((section) => section.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const kept = new Set<number>();
  let remaining = maxLength - 48;
  const keep = (section: typeof sections[number] | undefined) => {
    if (!section || kept.has(section.index) || section.content.length > remaining) return;
    kept.add(section.index);
    remaining -= section.content.length + 2;
  };
  for (const match of matches) keep(match);
  if (![...kept].some((index) => sections[index].score > 0)) return "";
  const heading = (section: typeof sections[number]) => section.content.split("\n").find((line) => /^#{1,6}\s/.test(line)) ?? "";
  for (const match of matches) {
    const before = sections[match.index - 1];
    const after = sections[match.index + 1];
    if (before && ontologyGuardHeading.test(heading(before))) keep(before);
    if (after && ontologyGuardHeading.test(heading(after))) keep(after);
  }
  const content = [...kept].sort((a, b) => a - b)
    .map((index) => redactSupportText(sections[index].content)).join("\n\n");
  return content ? `${content}\n[Ontology 相关章节摘录；未包含的内容未经本轮核对]` : "";
}

function sourcePaths(text: string): string[] {
  return [...new Set(text.match(/raw\/(?:transcripts|documents)\/[^\s\]\)"'<>]+\.md/g) ?? [])];
}

function linkedPages(text: string, path: string, pages: string[]): string[] {
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
  // Keep full primary sources local to this run's candidate objects. They are
  // never serialized into the rerank request or retained after candidates expire.
  const originals = new WeakMap<WikiCandidate, WikiSourceEvidence[]>();
  return {
    selectEvidence({ candidate, question, evidenceIds, signal }) {
      signal?.throwIfAborted();
      const queryTerms = terms([question.question, ...question.keywords, ...question.objects].join(" "));
      const linkedPaths = sourcePaths(candidate.content);
      const sources = (originals.get(candidate) ?? []).filter((source) => evidenceIds.includes(source.id)
        && (!linkedPaths.length || linkedPaths.includes(source.path)));
      let remaining = 2400;
      return sources.flatMap((source) => {
        const excerpt = relevantSourceContent(source.content, queryTerms, remaining, source.path.startsWith("raw/transcripts/"));
        if (!excerpt.content) return [];
        remaining -= excerpt.content.length;
        return [{ ...source, content: excerpt.content, complete: source.complete && excerpt.contextComplete }];
      });
    },
    async search(input) {
      input.signal?.throwIfAborted();
      const recallLimit = readRecallLimit();
      try {
        const workspace = deps.workspaceDir ?? process.env.SUPPORT_QA_EU_WORKSPACE_DIR?.trim();
        if (!workspace) throw new Error("Workspace missing");
        const workspaceRoot = await realpath(workspace);
        const withinWorkspace = (path: string) => {
          const rel = relative(workspaceRoot, path);
          return rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
        };
        const wikiRoot: KnowledgeRoot = {
          root: await realpath(resolve(workspaceRoot, "docs/llm-wiki")),
          publicRoot: "docs/llm-wiki",
          knowledgeType: "support_wiki",
        };
        let ontologyRoot: KnowledgeRoot | undefined;
        try {
          ontologyRoot = {
            root: await realpath(resolve(workspaceRoot, "docs/ontology")),
            publicRoot: "docs/ontology",
            knowledgeType: "ontology",
          };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (!withinWorkspace(wikiRoot.root) || (ontologyRoot && !withinWorkspace(ontologyRoot.root))) {
          throw new Error("Knowledge root outside workspace");
        }
        const within = (source: KnowledgeRoot, path: string) => {
          const rel = relative(source.root, path);
          return rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
        };
        async function read(source: KnowledgeRoot, path: string, optional = false): Promise<string | undefined> {
          input.signal?.throwIfAborted();
          if (path.split("/").includes("..") || !within(source, resolve(source.root, path)) || !path.endsWith(".md")) return undefined;
          let canonical: string;
          try { canonical = await realpath(resolve(source.root, path)); } catch (error) {
            if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
            throw error;
          }
          if (!within(source, canonical)) return undefined;
          const rawKind = source.knowledgeType === "support_wiki"
            ? ["raw/transcripts/", "raw/documents/"].find((prefix) => path.startsWith(prefix))
            : undefined;
          if (rawKind && !relative(source.root, canonical).startsWith(rawKind)) return undefined;
          const info = await stat(canonical);
          if (!info.isFile() || info.size > MAX_FILE_BYTES) return undefined;
          const buffer = await readFile(canonical, { signal: input.signal });
          if (buffer.length > MAX_FILE_BYTES) return undefined;
          return buffer.toString("utf8");
        }
        async function scan(source: KnowledgeRoot, directory: string, optional = false): Promise<string[]> {
          input.signal?.throwIfAborted();
          let canonical: string;
          try { canonical = await realpath(resolve(source.root, directory)); } catch (error) {
            if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw error;
          }
          if (!within(source, canonical)) return [];
          const entries = await readdir(canonical, { withFileTypes: true });
          const paths: string[] = [];
          for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
            const path = `${directory}/${entry.name}`;
            if (entry.isDirectory()) paths.push(...await scan(source, path));
            else if (entry.isFile() && entry.name.endsWith(".md")) paths.push(path);
          }
          return paths;
        }
        async function topLevelIndexes(source: KnowledgeRoot): Promise<string[]> {
          const entries = await readdir(source.root, { withFileTypes: true });
          return entries.filter((entry) => !entry.name.startsWith(".") && !entry.isSymbolicLink() && entry.isFile()
            && (entry.name === "index.md" || entry.name.endsWith("-index.md")))
            .map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
        }
        const queryTerms = terms([input.question, ...input.keywords, ...input.objects].join(" "));
        const pages: Array<{ source: KnowledgeRoot; path: string; text: string; content: string; score: number }> = [];
        const candidateDirectories: Array<{ source: KnowledgeRoot; directory: string; optional?: boolean }> = [
          { source: wikiRoot, directory: "concepts" },
          ...(ontologyRoot ? ["objects", "processes", "rules"].map((directory) => ({ source: ontologyRoot, directory, optional: true })) : []),
        ];
        for (const { source, directory, optional } of candidateDirectories) {
          for (const path of await scan(source, directory, optional)) {
            const text = await read(source, path);
            if (!text) continue;
            const environments = metadata(text, "environments");
            if (input.environments.length && environments.length && !environments.includes("待确认")
              && !input.environments.some((environment) => environments.includes(environment))) continue;
            const title = (source.knowledgeType === "ontology"
              ? metadata(text, "title")[0] || text.match(/^#\s+(.+)$/m)?.[1] || path
              : metadata(text, "title").join(" ")).toLowerCase();
            const supportWiki = source.knowledgeType === "support_wiki";
            const summary = supportWiki ? metadata(text, "summary").join(" ") : "";
            const searchTerms = supportWiki ? metadata(text, "search_terms").join(" ") : "";
            const tags = [...["objects", "processes", "tags"].flatMap((key) => metadata(text, key)), searchTerms].join(" ").toLowerCase();
            const content = source.knowledgeType === "ontology"
              ? relevantOntologyContent(text, queryTerms)
              : relevantWikiContent(text, queryTerms, 2400, {
                matched: wikiMatchCount(`${searchTerms} ${summary}`, queryTerms) > 0, summary,
              });
            const pathScore = source.knowledgeType === "ontology" ? wikiMatchCount(path.replace(/\.md$/, ""), queryTerms) : 0;
            const score = (wikiMatchCount(title, queryTerms) + pathScore) * 4
              + wikiMatchCount(tags, queryTerms) * 3 + wikiMatchCount(`${summary} ${content}`, queryTerms) * 2;
            pages.push({ source, path, text, content, score });
          }
        }
        // Navigation pages contribute links, never independent knowledge hits.
        const navigation: Array<{ source: KnowledgeRoot; paths: string[] }> = [{
          source: wikiRoot,
          paths: ["index.md", ...await scan(wikiRoot, "entities", true)],
        }];
        if (ontologyRoot) navigation.push({ source: ontologyRoot, paths: await topLevelIndexes(ontologyRoot) });
        for (const group of navigation) {
          const sourcePages = pages.filter((page) => page.source === group.source);
          for (const path of group.paths) {
            const text = await read(group.source, path, true);
            if (!text) continue;
            for (const line of text.split("\n")) {
              if (!wikiMatchCount(line, queryTerms)) continue;
              const linked = linkedPages(line, path, sourcePages.map((page) => page.path));
              for (const page of sourcePages) if (linked.includes(page.path)) page.score += 1;
            }
          }
        }
        const candidates: WikiCandidate[] = [];
        for (const page of pages.filter((page) => page.score > 0).sort((a, b) => b.score - a.score
          || `${a.source.publicRoot}/${a.path}`.localeCompare(`${b.source.publicRoot}/${b.path}`)).slice(0, recallLimit)) {
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
          if (page.source.knowledgeType === "ontology") {
            const businessReview = metadata(page.text, "business_review")[0];
            if (businessReview === "pending") limitations.push("Ontology 业务规则待确认");
            else if (businessReview !== "approved" && businessReview !== "confirmed") limitations.push("Ontology 业务复核状态未确认");
            const implementationReview = metadata(page.text, "implementation_review")[0];
            if (implementationReview === "pending" || implementationReview === "partial-static") {
              limitations.push("Ontology 实现仅完成部分静态核对");
            }
            limitations.push("Ontology 仅作为业务建模参考，不证明当前环境已上线或本 Ticket 已发生相应事实");
          }
          const sources: WikiSourceEvidence[] = [];
          const paths = page.source.knowledgeType === "support_wiki" ? sourcePaths(page.text) : [];
          for (const path of paths.slice(0, 12)) {
            const source = await read(wikiRoot, path, true);
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
          if (page.source.knowledgeType === "ontology") limitations.push("Ontology 页面不作为本 Ticket 的原始证据");
          else if (!sources.length || sources.some((source) => !source.complete)) limitations.push("原始证据缺失或聊天快照不完整");
          const content = page.content;
          const linkedPaths = sourcePaths(content);
          const sourceScore = (source: WikiSourceEvidence) => wikiMatchCount(source.content, queryTerms);
          const selectedSources = sources.sort((a, b) => Number(linkedPaths.includes(b.path)) - Number(linkedPaths.includes(a.path))
            || sourceScore(b) - sourceScore(a) || a.path.localeCompare(b.path)).slice(0, 3);
          if (sources.length > selectedSources.length) limitations.push("本轮按相关性摘录最多 3 个原始来源，其余未核对");
          const sourceEvidence = selectedSources.map((source) => ({ ...source,
            content: excerpt(source.content, queryTerms, Math.floor(2400 / selectedSources.length)),
          }));
          const lowConfidence = metadata(page.text, "confidence")[0] === "low";
          if (lowConfidence) limitations.push("资料置信度低，仅供历史参考");
          if (!content) limitations.push("未能在预算内摘取完整相关知识段落");
          const candidate: WikiCandidate = { id, path: page.path, sourcePath: `${page.source.publicRoot}/${page.path}`,
            knowledgeType: page.source.knowledgeType,
            title: redactSupportText(metadata(page.text, "title")[0] || page.text.match(/^#\s+(.+)$/m)?.[1] || page.path),
            status, environments, content, sourceEvidence,
            limitations: [...new Set(limitations)], historicalOnly: page.source.knowledgeType === "ontology"
              || unknownEnvironment || status === "unknown" || lowConfidence || !sourceEvidence.some((source) => source.complete),
          };
          originals.set(candidate, selectedSources);
          candidates.push(candidate);
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
