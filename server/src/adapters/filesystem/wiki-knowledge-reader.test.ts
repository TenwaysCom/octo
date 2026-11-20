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

  it("recalls a short KCS result inside an oversized case and reads its referenced source beyond the start of the index", async () => {
    const { reader, put } = await fixture();
    const verification = Array.from({ length: 20 }, (_, index) => `库存流程背景 ${index} ${"无关库存内容".repeat(24)}。`).join("\n\n");
    const index = Array.from({ length: 20 }, (_, index) => `- M${index + 1} [无关来源](../../../raw/documents/inventory-${index}.md) ${"库存内容".repeat(24)}`).join("\n");
    const sourcePath = "raw/documents/kcs-export.md";
    await put(sourcePath, "EXPORT_CASE: Support reviewed the export template.");
    await put("kcs/demo-base/demo-table/rec-long-case.md", [
      "## 历史模板核对", "### 当前结果", "EXPORT_CASE 下载后列名一致，其他模板未核对（F80）。",
      "### 关键处理与验证", verification,
      "管理员使用示例模板复测（F80）。", "更正：文件能打开，仍未验证字段映射。",
      "### 遇到类似情况", "适用前提：导出账号须有模板读取权限。",
      "### 待确认", "导出列的字段映射仍待核对。", "### 来源与范围", "测试只覆盖同一模板的一次操作。",
      "#### 来源索引", index, `- [F80 核对记录](../../../${sourcePath})`,
    ].join("\n\n"));

    const query = { question: "EXPORT_CASE", keywords: [], objects: [], environments: [], includeKcs: true };
    const hits = await reader.search(query);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ knowledgeType: "kcs", historicalOnly: true });
    expect(hits[0].content.length).toBeLessThanOrEqual(2400);
    for (const kept of ["下载后列名一致", "管理员使用示例模板复测", "仍未验证字段映射", "导出账号须有模板读取权限",
      "导出列的字段映射仍待核对", "测试只覆盖同一模板的一次操作", "F80 核对记录", "未包含的内容未经本轮核对"]) {
      expect(hits[0].content).toContain(kept);
    }
    expect(hits[0].content).not.toMatch(/库存流程背景|inventory-0\.md/);
    expect(hits[0].sourceEvidence[0].path).toBe(sourcePath);
    const selected = reader.selectEvidence!({ candidate: hits[0], question: query, evidenceIds: [hits[0].sourceEvidence[0].id] });
    expect(selected).toMatchObject([{ path: sourcePath, complete: true, content: expect.stringContaining("Support reviewed the export template") }]);
  });

  it("recalls KCS only at the canonical base, table and record path", async () => {
    const { reader, put } = await fixture();
    const validPath = "kcs/demo_base/demo-table/rec-valid_01.md";
    const text = "## Tariff\n\n### 当前结果\nTariff classification was reviewed.\n";
    await Promise.all([
      validPath,
      "kcs/demo_base/demo-table/assets/rec-valid_01/notes.md",
      "kcs/demo_base/demo-table/guides/notes.md",
      "kcs/demo_base/notes.md",
      "kcs/demo.base/demo-table/rec-invalid.md",
      "kcs/demo_base/demo table/rec-invalid.md",
      "kcs/demo_base/demo-table/rec.invalid.md",
    ].map((path) => put(path, text)));

    expect(await reader.search({ question: "tariff", keywords: [], objects: [], environments: [], includeKcs: true }))
      .toMatchObject([{ path: validPath, knowledgeType: "kcs", historicalOnly: true }]);
  });

  it("omits superseded or explicitly excluded pages before ranking", async () => {
    const { reader, put } = await fixture();
    const activePath = "concepts/current-tariff.md";
    const legacyPath = "kcs/demo-base/demo-table/rec-legacy.md";
    const content = "## Tariff\n\n### 当前结果\nTariff classification was reviewed.\n";
    await Promise.all([
      put(activePath, `---\ntitle: Tariff\napplicability_status: current\nretrieval_status: conditional\n---\n${content}`),
      put(legacyPath, content),
      put("concepts/superseded-tariff.md", `---\ntitle: Tariff\napplicability_status: "superseded"\n---\n${content}`),
      put("concepts/excluded-tariff.md", `---\ntitle: Tariff\nretrieval_status: excluded\n---\n${content}`),
      put("kcs/demo-base/demo-table/rec-excluded.md", `---\ntitle: Tariff\nretrieval_status: excluded\n---\n${content}`),
      put("index.md", "# Tariff index\n- Tariff [superseded](concepts/superseded-tariff.md)\n"),
    ]);

    const hits = await reader.search({ question: "tariff", keywords: [], objects: [], environments: [], includeKcs: true });
    expect(hits.map((hit) => hit.path).sort()).toEqual([activePath, legacyPath]);
  });

  it("retains the matching KCS table row with its verification gap when unrelated rows exceed the budget", async () => {
    const { reader, put } = await fixture();
    const otherCases = Array.from({ length: 30 }, (_, index) => `| 库存同步 ${index} | ${"背景说明".repeat(30)} | 库存未复测 |`);
    await put("kcs/demo-base/demo-table/rec-many-cases.md", [
      "## 多诉求测试", "", "### 当前结果", "",
      "| 诉求 | 处理结果 | 还没核对 |", "| --- | --- | --- |",
      ...otherCases, "| KCS_ROW_CASE | 模板绑定完成（M2） | 还没有验证权限较低的账号（M3） |", "",
      "### 遇到类似情况", "", "先核对测试账号的适用范围。", "",
      "### 来源与范围", "", "仅使用了一次会话。",
    ].join("\n"));

    const hits = await reader.search({ question: "KCS_ROW_CASE", keywords: [], objects: [], environments: [], includeKcs: true });
    expect(hits).toHaveLength(1);
    expect(hits[0].content.length).toBeLessThanOrEqual(2400);
    expect(hits[0].content).toContain("| KCS_ROW_CASE | 模板绑定完成（M2） | 还没有验证权限较低的账号（M3） |");
    expect(hits[0].content).toContain("先核对测试账号的适用范围");
    expect(hits[0].content).not.toContain("库存未复测");
  });

  it.each(["complete", "fields-only", "compacted"])("reads the Lark solution field beside KCS chat evidence (%s)", async (snapshot) => {
    const { reader, put } = await fixture();
    const fieldsOnly = snapshot === "fields-only";
    const complete = snapshot === "complete";
    const sourcePath = "raw/transcripts/ticket-kcs-field.md";
    const firstMessage = "- **[2026-09-22T10:00:00Z] 用户 1**(user): TEMPLATE_CHECK 示例账号已核对。";
    await put(sourcePath, [
      "---", `thread_id: ${fieldsOnly ? '""' : '"demo-thread"'}`, `history_complete: ${!fieldsOnly}`,
      `render_complete: ${snapshot !== "compacted"}`, "---", "# Demo Ticket", "",
      "<!-- octo-ticket-fields:start -->", "## Ticket 源字段", "", '- Business line: "Demo"', "",
      "### 解决方案（Lark Base 记录）", "", "> TEMPLATE_CHECK 处理人员调整模板。", "> 仅适用示例账号。联系 demo@example.com。",
      "<!-- octo-ticket-fields:end -->", "",
      "<!-- octo-thread-messages:start -->", "## 线程消息", "",
      fieldsOnly ? "无线程快照；没有可用的预处理原始消息。" : firstMessage, "<!-- octo-thread-messages:end -->", "",
      "## Shadow AI 完整分析记录", "TEMPLATE_CHECK PRIVATE_ANALYSIS",
    ].join("\n"));
    await put("kcs/demo-base/demo-table/rec-solution.md", [
      "## 模板问题", "### 当前结果", "TEMPLATE_CHECK 调整了示例模板。", "### 来源与范围",
      `- [原始工单快照](../../../${sourcePath})`,
    ].join("\n\n"));

    const query = { question: "TEMPLATE_CHECK", keywords: [], objects: [], environments: [], includeKcs: true };
    const [hit] = await reader.search(query);
    expect(hit.sourceEvidence).toMatchObject([{ path: sourcePath, complete, content: expect.stringContaining("解决方案（Lark Base 源字段）") }]);
    const [evidence] = reader.selectEvidence!({ candidate: hit, question: query, evidenceIds: [hit.sourceEvidence[0].id] });
    expect(evidence).toMatchObject({ path: sourcePath, complete });
    expect(evidence.content).toContain("解决方案（Lark Base 源字段）\nTEMPLATE_CHECK 处理人员调整模板。\n仅适用示例账号。联系 [EMAIL]。");
    expect(evidence.content).not.toMatch(/demo@example\.com|PRIVATE_ANALYSIS|octo-thread-messages|无线程快照/);
    if (fieldsOnly) expect(evidence.content).not.toMatch(/^M\d+$/m);
    else expect(evidence.content).toContain(`M1\n${firstMessage}`);
  });

  it.each([true, false])("selects a short linked KCS transcript across languages (render complete: %s)", async (renderComplete) => {
    const { reader, put } = await fixture();
    const sourcePath = "raw/transcripts/ticket-warranty.md";
    const messages = [
      "- **[2026-09-22T10:00:00Z] 用户 1**(text): Which serial range appears on the returned unit?",
      "- **[2026-09-22T10:01:00Z] 处理人 1**(text): The range is printed beside the hinge.",
      "- **[2026-09-22T10:02:00Z] 处理人 1**(text): The alternate label still needs inspection.",
    ];
    await put(sourcePath, [
      "---", "thread_id: demo-thread", "history_complete: true", `render_complete: ${renderComplete}`,
      "---", "## 线程消息", ...messages, "<!-- octo-thread-messages:end -->", "## Shadow AI", "PRIVATE_ANALYSIS",
    ].join("\n"));
    await put("kcs/demo-base/demo-table/rec-warranty.md", [
      "## 保修件批次", "### 当前结果", "保修件批次可查看标签。",
      "#### 来源索引", `- [M1 原始工单快照](../../../${sourcePath})`,
    ].join("\n\n"));

    const query = { question: "如何查看保修件批次", keywords: [], objects: [], environments: [], includeKcs: true };
    const [hit] = await reader.search(query);
    expect(hit.historicalOnly).toBe(true);
    const [source] = hit.sourceEvidence;
    expect(reader.selectEvidence!({ candidate: hit, question: query, evidenceIds: [source.id] })).toEqual([{
      id: source.id, path: sourcePath, complete: renderComplete,
      content: messages.map((message, index) => `M${index + 1}\n${message}`).join("\n\n"),
    }]);
  });

  it("keeps unmatched transcripts out without a KCS excerpt link or room for every message", async () => {
    const { reader, put } = await fixture();
    const shortPath = "raw/transcripts/ticket-short.md";
    const longPath = "raw/transcripts/ticket-long.md";
    const transcript = (body: string) => `---\nthread_id: demo-thread\nhistory_complete: true\n---\n## 线程消息\n${body}\n`;
    const message = "- **[2026-09-22T10:00:00Z] 用户 1**(text): The recording was filed.";
    const longMessage = `- **[2026-09-22T10:01:00Z] 处理人 1**(text): ${"Details to retain. ".repeat(150)}`;
    const body = "## 保修件批次\n\n### 当前结果\n保修件批次可查看标签。";
    const link = (path: string) => `\n\n[原始工单快照](/${path})`;
    await Promise.all([
      put(shortPath, transcript(message)),
      put(longPath, transcript(`${message}\n${longMessage}`)),
      put("kcs/demo-base/demo-table/rec-no-link.md", `---\nsources: [${shortPath}]\n---\n${body}`),
      put("kcs/demo-base/demo-table/rec-too-long.md", body + link(longPath)),
      put("concepts/ordinary-wiki.md", body + link(shortPath)),
    ]);

    const query = { question: "如何查看保修件批次", keywords: [], objects: [], environments: [], includeKcs: true };
    const hits = await reader.search(query);
    expect(hits.map((hit) => hit.path).sort()).toEqual([
      "concepts/ordinary-wiki.md", "kcs/demo-base/demo-table/rec-no-link.md", "kcs/demo-base/demo-table/rec-too-long.md",
    ]);
    for (const hit of hits) {
      expect(hit.sourceEvidence).toHaveLength(1);
      expect(reader.selectEvidence!({ candidate: hit, question: query, evidenceIds: [hit.sourceEvidence[0].id] })).toEqual([]);
    }
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
