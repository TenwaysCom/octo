import { describe, expect, it } from "vitest";

import {
  renderMarkdownStream,
  renderMarkdownText,
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

describe("renderMarkdownText", () => {
  it("renders bold text", () => {
    expect(renderMarkdownText("**bold**")).toBe("<strong>bold</strong>");
    expect(renderMarkdownText("__bold__")).toBe("<strong>bold</strong>");
  });

  it("renders italic text", () => {
    expect(renderMarkdownText("*italic*")).toBe("<em>italic</em>");
    expect(renderMarkdownText("_italic_")).toBe("<em>italic</em>");
  });

  it("renders inline code", () => {
    expect(renderMarkdownText("`code`")).toBe(
      '<code class="kimi-chat-markdown__inline-code">code</code>',
    );
  });

  it("renders links", () => {
    expect(renderMarkdownText("[link](https://example.com)")).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">link</a>',
    );
  });

  it("renders mixed inline markdown", () => {
    expect(renderMarkdownText("**bold** and *italic* and `code`")).toBe(
      '<strong>bold</strong> and <em>italic</em> and <code class="kimi-chat-markdown__inline-code">code</code>',
    );
  });

  it("escapes html before rendering", () => {
    expect(renderMarkdownText("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });
});

describe("renderMarkdownStream", () => {
  it("renders bold and italic in paragraphs", () => {
    const html = renderMarkdownStream("This is **bold** and *italic* text.");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders links in paragraphs", () => {
    const html = renderMarkdownStream("Visit [example](https://example.com) for more.");
    expect(html).toContain('<a href="https://example.com"');
  });

  it("renders code blocks with language", () => {
    const html = renderMarkdownStream("```ts\nconst x = 1;\n```");
    expect(html).toContain('<pre class="kimi-chat-markdown__code-block"');
    expect(html).toContain('data-lang="ts"');
    expect(html).toContain("const x = 1;");
  });

  it("renders empty string to empty string", () => {
    const html = renderMarkdownStream("");
    expect(html).toBe("");
  });

  it("renders plain text to paragraph", () => {
    const html = renderMarkdownStream("Hello world");
    expect(html).toContain('<p class="kimi-chat-markdown__paragraph">Hello world</p>');
  });
});
