import { extractTicketAnswerSources, ticketAnswerSourceSchema } from "./ticket-answer-sources.js";

describe("Ticket Answer sources", () => {
  it("extracts inline references without a heading and normalizes absolute knowledge paths", () => {
    const sources = extractTicketAnswerSources("参考[操作说明](https://example.com/how-to)；另见[规则](/srv/guide/docs/llm-wiki/concepts/rule.md#usage)。\n`docs/llm-wiki/concepts/rule.md#usage`\n依据：\nhttps://example.com/how-to");
    expect(sources).toEqual([
      { id: "https://example.com/how-to", href: "https://example.com/how-to", kind: "web", title: "操作说明", location: "example.com" },
      { id: "docs/llm-wiki/concepts/rule.md#usage", kind: "document", title: "规则", location: "docs/llm-wiki/concepts/rule.md#usage" },
    ]);
  });
  it("keeps balanced URLs, footnotes and cited document line numbers", () => {
    const sources = extractTicketAnswerSources("[1]: https://example.com/wiki/Rule_(UK)\n参考资料：\n- `docs/ontology/objects/order.md:12`\n反馈：\nhttps://example.com/not-a-reference");
    expect(sources.map((source) => source.id)).toEqual(["https://example.com/wiki/Rule_(UK)", "docs/ontology/objects/order.md:12"]);
  });
  it("preserves cited case source_ref identifiers without inventing a URL", () => {
    expect(extractTicketAnswerSources("依据：source_ref=case:LT-9:segment-2\n[案例](case:LT-9:segment-2)")).toEqual([
      { id: "case:LT-9:segment-2", kind: "reference", title: "案例", location: "case:LT-9:segment-2" },
    ]);
  });
  it("excludes fenced examples, unsafe protocols, embedded credentials and traversal", () => {
    expect(extractTicketAnswerSources("```md\n[example](https://example.com/example)\n```\n依据：\n[bad](javascript:alert(1)) [private](https://user:secret@example.com/) [escape](docs/llm-wiki/../secret.md)\n")).toEqual([]);
    expect(ticketAnswerSourceSchema.safeParse({ id: "x", kind: "web", title: "x", location: "x", href: "invalid" }).success).toBe(false);
  });
});
