import { compactWikiAnswerContext } from "./wiki-answer-context.js";

describe("answer context compaction", () => {
  it("keeps error causes and failed retry facts while reducing repeated frames", () => {
    const frames = Array.from({ length: 8 }, (_, i) => `    at f${i} (https://private.example/web/assets/long/path.js:${i}:1)`).join("\n");
    const result = compactWikiAnswerContext(`OwlError: lifecycle\n${frames}\nCaused by: NotFoundError: insertBefore\n${frames}\n刷新后仍然失败`);
    expect(result).toContain("Caused by: NotFoundError: insertBefore");
    expect(result).toContain("刷新后仍然失败");
    expect(result).toContain("path.js:2:1");
    expect(result).not.toContain("f3");
    expect(result).not.toContain("private.example");
    expect(result.match(/省略 5 条/g)).toHaveLength(2);
  });
  it("removes only standalone greetings, preserving referenced replies and business text", () => {
    const result = compactWikiAnswerContext("Title: claim\nM1\nTime: now\nSender: A\nThanks!\nM2\nSender: B\nHi\nM3\nReply to: M1\n仍然失败\nResponsible: 业务事实\nM4\nNo, not resolved");
    expect(result).toContain("M1\n");
    expect(result).not.toContain("M2\n");
    expect(result).toContain("Responsible: 业务事实");
    expect(result).toContain("No, not resolved");
  });
});
