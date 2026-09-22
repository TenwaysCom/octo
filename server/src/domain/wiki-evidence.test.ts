import { relevantSourceContent, relevantWikiContent, wikiQueryTerms, wikiMatchCount, supportsWikiQuestion } from "./wiki-evidence.js";

const message = (index: number, text: string) => `- **[2026-09-22T10:00:00.000] 用户 ${index % 2}**(text): ${text}`;

describe("wiki evidence excerpts", () => {
  it("keeps relevant wiki sections and explicit prerequisites without frontmatter or other incidents", () => {
    const result = relevantWikiContent("---\ntitle: report\nowner: test\n---\n# 知识\n## 报表\nPL report 配置缺失。\n## 适用条件\n只有核对配置后才执行。\n## 库存\nUNRELATED_STOCK", ["report"]);
    expect(result).toContain("PL report");
    expect(result).toContain("只有核对配置后才执行");
    expect(result).not.toContain("owner:");
    expect(result).not.toContain("UNRELATED_STOCK");
  });

  it("does not cut a long rule before its exception or retain a rule without a required condition section", () => {
    expect(relevantWikiContent(`## 报表\nreport ${"背景".repeat(100)}\n不能直接修改。`, ["report"], 60)).toBe("");
    expect(relevantWikiContent(`## 报表\nreport 修复。\n## 适用条件\n${"前提".repeat(100)}`, ["report"], 60)).toBe("");
  });

  it("keeps exact original messages, local replies, late reversals and source ordinals", () => {
    const messages = [
      message(1, "UK Odoo 17，升级后发生。"), message(2, "PL report 缺少科目。"),
      message(3, "发现配置缺失，补齐后重试。"), message(4, "收到。"),
      message(5, "另一件事：库存导出。"), message(6, "催一下库存。"),
      message(7, "刚才结果已发送。"), message(8, "纠正：刚才判断有误，仍未解决。"),
      message(9, "另一个无关问题。"),
    ];
    const result = relevantSourceContent(messages.join("\n\n"), ["report"], 2400, true);
    expect(result.contextComplete).toBe(true);
    for (const index of [0, 1, 2, 6, 7]) expect(result.content).toContain(messages[index]);
    expect(result.content).toContain(`M8\n${messages[7]}`);
    expect(result.content).not.toContain("库存");
    expect(result.content).not.toContain("另一个无关问题");
    expect(result.content.indexOf("M2\n")).toBeLessThan(result.content.indexOf("M8\n"));
  });

  it("refuses to drop a late failure to fit the evidence budget", () => {
    const text = [message(1, "report 已成功。"), message(2, "收到"), message(3, "讨论"), message(4, `纠正：失败，${"原因".repeat(150)}`)].join("\n\n");
    expect(relevantSourceContent(text, ["report"], 200, true)).toEqual({ content: "", contextComplete: false });
  });

  it("does not match source metadata or invent evidence when no body matches", () => {
    expect(relevantSourceContent("- **[2026-09-22] report**(text): 收到。", ["report"], 2400, true).content).toBe("");
    expect(relevantSourceContent("完全无关的内容", ["report"], 2400, false).content).toBe("");
  });
});

it("ignores common words, matches whole English tokens, and removes maintenance templates", async () => {
  expect(wikiQueryTerms("the error issue with report.")).toEqual(["report"]);
  expect(wikiMatchCount("reporting reported reporter", ["report"])).toBe(0);
  expect(wikiMatchCount("report. account.account", ["report", "account.account"])).toBe(2);
  const content = relevantWikiContent("## Report\nreport root cause\n## Maintenance Notes\nreport admin\n## Resolution Summary Template\nreport template", ["report"]);
  expect(content).toContain("root cause");
  expect(content).not.toContain("admin");
  expect(content).not.toContain("template");
});
it("requires the specific cause when generic wrappers are present", () => {
  const question = "OwlError Caused by: NotFoundError insertBefore";
  expect(supportsWikiQuestion(question, ["claim"], "claim OwlError server error")).toBe(false);
  expect(supportsWikiQuestion(question, ["claim"], "NotFoundError: insertBefore")).toBe(true);
});
