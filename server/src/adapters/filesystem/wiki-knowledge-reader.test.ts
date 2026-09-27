import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createWikiKnowledgeReader } from "./wiki-knowledge-reader.js";
import type { WikiQuestion } from "../../domain/wiki-qa.js";

const question: WikiQuestion = { question: "报表缺少科目 40500", keywords: ["PL", "report", "科目"], objects: ["account.account"], environments: ["UK Odoo 17"] };
const fixtures: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "wiki-reader-"));
  fixtures.push(workspaceDir);
  const root = join(workspaceDir, "docs/llm-wiki");
  const ontologyRoot = join(workspaceDir, "docs/ontology");
  const put = async (path: string, text: string) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text); };
  const putOntology = async (path: string, text: string) => { await mkdir(dirname(join(ontologyRoot, path)), { recursive: true }); await writeFile(join(ontologyRoot, path), text); };
  await put("index.md", "# Empty index");
  await put("raw/transcripts/ticket-1.md", "---\nthread_id: 123\nhistory_complete: true\n---\n# Ticket\n## 线程消息(1 条)\nPL report 40500：修正报表分组后科目显示。\n\n## Shadow AI 完整分析记录(参考,非证据)\nSHADOW_MUST_NOT_BE_EVIDENCE\n");
  await put("concepts/accounting/report.md", card());
  return { root, ontologyRoot, put, putOntology, reader: createWikiKnowledgeReader({ workspaceDir }) };
}

function card(environment = "UK Odoo 17", additional = "", body = "## 已确认的排查或解决路径\nPL 报表缺少科目 40500，核对报表分组配置。") {
  return `---\ntitle: "报表缺少科目"\nstatus: draft\nenvironments:\n  - ${environment}\nobjects: [account.account]\nconfidence: medium\nsources:\n  - raw/transcripts/ticket-1.md\n${additional}---\n${body}\n`;
}

describe("wiki knowledge reader", () => {
  it("selects evidence after ranking from original sources, preserving late corrections beyond the earlier excerpt", async () => {
    const { reader, put } = await fixture();
    const message = (index: number, text: string) => `- **[2026-09-22T10:00:00.000] 用户 ${index}**(text): ${text}`;
    const messages = [message(1, "PL report 40500 配置缺失。"), message(2, "核对配置后重试。"),
      ...Array.from({ length: 20 }, (_, i) => message(i + 3, `无关库存讨论${"背景".repeat(100)}`)),
      message(23, "复查结束。"), message(24, "纠正：仍未解决，不能沿用前面的判断。")];
    await put("raw/transcripts/ticket-1.md", `---\nthread_id: 123\nhistory_complete: true\n---\n## 线程消息\n${messages.join("\n\n")}\n\n## Shadow AI\nSHADOW_ANALYSIS`);
    const hit = (await reader.search(question))[0];
    expect(hit.sourceEvidence[0].content).not.toContain("纠正：仍未解决");
    const sources = reader.selectEvidence!({ candidate: hit, question, evidenceIds: hit.sourceEvidence.map((source) => source.id) });
    expect(sources).toHaveLength(1);
    expect(sources[0].content).toContain("M24\n");
    expect(sources[0].content).toContain(messages[23]);
    expect(sources[0].content).not.toContain("库存");
    expect(sources[0].content).not.toContain("SHADOW_ANALYSIS");
    expect(sources[0].path).toBe("raw/transcripts/ticket-1.md");
  });

  it("uses links in related wiki content and never returns an unselected or unrelated source", async () => {
    const { reader, put } = await fixture();
    await put("raw/documents/other.md", "PL report 40500 unrelated branch");
    await put("concepts/accounting/report.md", card("UK Odoo 17", "", "## 报表\nPL report 40500 [证据](../../raw/transcripts/ticket-1.md)\n## 库存\n其他事故 [证据](../../raw/documents/other.md)"));
    const hit = (await reader.search(question))[0];
    const sources = reader.selectEvidence!({ candidate: hit, question, evidenceIds: hit.sourceEvidence.map((source) => source.id) });
    expect(sources.map((source) => source.path)).toEqual(["raw/transcripts/ticket-1.md"]);
    expect(reader.selectEvidence!({ candidate: hit, question, evidenceIds: [] })).toEqual([]);
    expect(reader.selectEvidence!({ candidate: { ...hit }, question, evidenceIds: hit.sourceEvidence.map((source) => source.id) })).toEqual([]);
  });

  it("retrieves pages missing from the index and supplies primary thread evidence, excluding Shadow AI", async () => {
    const { reader } = await fixture();
    const hits = await reader.search(question);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ path: "concepts/accounting/report.md", status: "draft", historicalOnly: false });
    expect(hits[0].sourceEvidence[0]).toMatchObject({ complete: true, content: expect.stringContaining("修正报表分组") });
    expect(hits[0].sourceEvidence[0].content).not.toContain("SHADOW_MUST_NOT_BE_EVIDENCE");
  });

  it("searches English terms and follows entity links without counting navigation or raw as hits", async () => {
    const { reader, put } = await fixture();
    await put("entities/objects/account.md", "# objects\n- ledger missing account → [rule](../../concepts/accounting/report.md)");
    const hits = await reader.search({ question: "ledger", keywords: [], objects: [], environments: [] });
    expect(hits.map((hit) => hit.path)).toEqual(["concepts/accounting/report.md"]);
    expect(hits[0].historicalOnly).toBe(true);
  });

  it("recalls ontology objects, processes and rules while keeping indexes and excluded directories as navigation-only", async () => {
    const { reader, putOntology } = await fixture();
    const ontologyPage = (title: string) => `---\nstatus: draft\nbusiness_review: pending\nimplementation_review: partial-static\n---\n# ${title}\n\n## 规则\nONTOLOGY_PROBE 销售订单修改规则。\n`;
    await putOntology("objects/sales-order.md", ontologyPage("销售订单定义"));
    await putOntology("processes/sales-order-amendment.md", ontologyPage("销售订单修改流程"));
    await putOntology("rules/order-history.md", ontologyPage("销售订单历史保留规则"));
    await putOntology("sales-modeling-index.md", "# Index\n- ONTOLOGY_PROBE [销售订单](objects/sales-order.md)\n");
    await putOntology("reviews/review.md", ontologyPage("不应召回的复核记录"));
    await putOntology("templates/template.md", ontologyPage("不应召回的模板"));
    await putOntology("examples/example.md", ontologyPage("不应召回的示例"));
    await putOntology("objects/.git/private.md", ontologyPage("不应召回的隐藏文件"));

    const hits = await reader.search({ question: "ONTOLOGY_PROBE", keywords: [], objects: [], environments: ["UK Odoo 17"] });
    expect(hits.map((hit) => hit.path)).toEqual([
      "objects/sales-order.md",
      "processes/sales-order-amendment.md",
      "rules/order-history.md",
    ]);
    expect(hits.every((hit) => hit.knowledgeType === "ontology" && hit.historicalOnly && !hit.sourceEvidence.length)).toBe(true);
    expect(hits[0]).toMatchObject({ sourcePath: "docs/ontology/objects/sales-order.md", status: "draft" });
    expect(hits[0].limitations).toEqual(expect.arrayContaining([
      "草稿资料，尚未人工确认",
      "Ontology 业务规则待确认",
      "Ontology 实现仅完成部分静态核对",
      "Ontology 页面不作为本 Ticket 的原始证据",
    ]));
  });

  it("keeps matched ontology sections when unrelated guard sections exceed the page budget", async () => {
    const { reader, putOntology } = await fixture();
    const guards = Array.from({ length: 30 }, (_, index) => `## 限制 ${index}\n不能使用无关规则。${"边界".repeat(80)}`).join("\n\n");
    await putOntology("objects/large.md", `---\nstatus: draft\nbusiness_review: pending\n---\n# 大型业务定义\n\n${guards}\n\n<a id="large-target"></a>\n## 目标规则\nLARGE_ONTOLOGY_TARGET 必须保留完整命中章节。\n`);
    const hits = await reader.search({ question: "LARGE_ONTOLOGY_TARGET", keywords: [], objects: [], environments: [] });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ knowledgeType: "ontology", sourcePath: "docs/ontology/objects/large.md" });
    expect(hits[0].content).toContain("LARGE_ONTOLOGY_TARGET");
    expect(hits[0].content.length).toBeLessThanOrEqual(2400);
  });

  it("recalls stable ontology IDs before redacting reference-like output", async () => {
    const { reader, putOntology } = await fixture();
    await putOntology("objects/sales-order-amendment.md", `---\nstatus: draft\nbusiness_review: pending\n---\n# 销售订单修改\n\n<a id="sales-order-amendment"></a>\n## \`sales-order-amendment\`\n保留业务历史。\n`);
    const hits = await reader.search({ question: "sales-order-amendment", keywords: [], objects: [], environments: [] });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ sourcePath: "docs/ontology/objects/sales-order-amendment.md", knowledgeType: "ontology" });
    expect(hits[0].content).not.toBe("");
  });

  it("excludes known environment mismatches and demotes uncertain environments or low confidence", async () => {
    const { reader, put } = await fixture();
    await put("concepts/accounting/report.md", card("US Odoo 18"));
    expect(await reader.search(question)).toEqual([]);
    await put("concepts/accounting/report.md", card("待确认"));
    expect((await reader.search(question))[0].historicalOnly).toBe(true);
    await put("concepts/accounting/report.md", card().replace("confidence: medium", "confidence: low"));
    expect((await reader.search(question))[0].historicalOnly).toBe(true);
  });

  it("retains missing or incomplete evidence only as historical material", async () => {
    const { reader, put } = await fixture();
    await put("raw/transcripts/ticket-1.md", "---\nhistory_complete: false\n---\n# No thread\n## Shadow AI\nreport fixed");
    expect((await reader.search(question))[0]).toMatchObject({ historicalOnly: true, sourceEvidence: [{ complete: false, content: "" }] });
    await put("concepts/accounting/report.md", card().replace("ticket-1.md", "ticket-missing.md"));
    expect((await reader.search(question))[0]).toMatchObject({ historicalOnly: true, sourceEvidence: [] });
  });

  it("blocks links and symlinks escaping the configured wiki", async () => {
    const { reader, put, putOntology, root, ontologyRoot } = await fixture();
    const outside = join(dirname(root), "private.md");
    await writeFile(outside, "SECRET_OUTSIDE_WIKI");
    await symlink(outside, join(root, "concepts/accounting/escape.md"));
    await symlink(outside, join(root, "raw/transcripts/escape.md"));
    await putOntology("objects/inside.md", "# harmless ontology page");
    await symlink(outside, join(ontologyRoot, "objects/escape.md"));
    await put("concepts/accounting/report.md", card().replace("ticket-1.md", "escape.md"));
    const hits = await reader.search(question);
    expect(hits).toHaveLength(1);
    expect(JSON.stringify(hits)).not.toContain("SECRET_OUTSIDE_WIKI");
    expect(hits[0].sourceEvidence).toEqual([]);
    expect(await reader.search({ ...question, question: "SECRET_OUTSIDE_WIKI", keywords: [], objects: [] })).toEqual([]);
  });

  it("rejects an ontology root symlink that escapes the configured workspace", async () => {
    const { reader, ontologyRoot } = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "ontology-outside-"));
    fixtures.push(outside);
    await mkdir(join(outside, "objects"), { recursive: true });
    await writeFile(join(outside, "objects/private.md"), "# private ontology");
    await symlink(outside, ontologyRoot, "dir");
    await expect(reader.search(question)).rejects.toMatchObject({ code: "WIKI_QA_UNAVAILABLE" });
  });

  it("caps candidates at twenty, reloads edits, and distinguishes no hits from unreadable wiki", async () => {
    const { reader, put } = await fixture();
    for (let i = 0; i < 22; i++) await put(`concepts/faq/report-${i}.md`, card());
    expect(await reader.search(question)).toHaveLength(20);
    expect(await reader.search({ ...question, question: "unmatchableword", keywords: [], objects: [] })).toEqual([]);
    await put("concepts/accounting/report.md", card("UK Odoo 17", "", "newuniqueword"));
    expect(await reader.search({ ...question, question: "newuniqueword", keywords: [], objects: [] })).toHaveLength(1);
    await expect(createWikiKnowledgeReader({ workspaceDir: "/nonexistent-wiki-fixture" }).search(question)).rejects.toMatchObject({ code: "WIKI_QA_UNAVAILABLE" });
  });

  it("does not treat a wiki page reached through a raw alias or traversal as primary evidence", async () => {
    const { reader, root, put } = await fixture();
    await put("queries/answer.md", "UNVERIFIED_QUERY_ANSWER");
    await mkdir(join(root, "raw/documents"), { recursive: true });
    await symlink(join(root, "queries/answer.md"), join(root, "raw/documents/alias.md"));
    await put("concepts/accounting/report.md", card().replace("raw/transcripts/ticket-1.md", "raw/documents/alias.md\n  - raw/documents/../../queries/answer.md"));
    const hit = (await reader.search(question))[0];
    expect(hit.sourceEvidence).toEqual([]);
    expect(hit.historicalOnly).toBe(true);
  });

  it("honors cancellation before accessing the filesystem", async () => {
    const { reader } = await fixture();
    await expect(reader.search({ ...question, signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" });
  });
});

it("shares the configured recall limit and validates integer bounds", async () => {
  const { reader, put } = await fixture();
  for (let i = 0; i < 22; i++) await put(`concepts/faq/report-${i}.md`, card());
  for (const [setting, count] of [["1", 1], ["7", 7], ["20", 20], ["30", 23], ["100", 23], ["", 20]] as const) {
    vi.stubEnv("WIKI_QA_RECALL_LIMIT", setting);
    expect(await reader.search(question)).toHaveLength(count);
  }
  for (const setting of ["0", "-1", "1.5", "101", "abc"]) {
    vi.stubEnv("WIKI_QA_RECALL_LIMIT", setting);
    await expect(reader.search(question)).rejects.toMatchObject({ code: "WIKI_QA_UNAVAILABLE", diagnostic: { stage: "server.wiki_qa.retrieve.config" } });
  }
});
