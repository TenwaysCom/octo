import { describe, expect, it } from "vitest";

import {
  renderMarkdownStream,
  stabilizeMarkdownStream,
} from "./markdown-stream.js";

describe("markdown streaming guard", () => {
  it("closes incomplete fenced code blocks before rendering", () => {
    expect(stabilizeMarkdownStream("先看代码：\n```ts\nconst value = 1;")).toBe(
      "先看代码：\n```ts\nconst value = 1;\n```",
    );
  });

  it("closes dangling inline code spans before rendering", () => {
    expect(stabilizeMarkdownStream("Use `session.abort")).toBe(
      "Use `session.abort`",
    );
  });

  it("renders stabilized markdown into safe html for streaming previews", () => {
    const html = renderMarkdownStream(
      "先看代码：\n\n```ts\nconst value = `<tag>`;",
    );

    expect(html).toContain("<pre");
    expect(html).toContain("<code");
    expect(html).toContain("const value = `&lt;tag&gt;`;");
    expect(html).not.toContain("```");
  });
});
