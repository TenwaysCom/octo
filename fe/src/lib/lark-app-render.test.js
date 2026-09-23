import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Exercise actual JSX without adding a browser or DOM dependency to FE tests.
test("Wiki Markdown renders readable structure and never executes model HTML or unsafe URLs", async () => {
  const server = await createServer({ configFile: false, root: new URL("../..", import.meta.url).pathname, server: { middlewareMode: true, hmr: false, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom" });
  try {
    const { LarkAppMarkdown } = await server.ssrLoadModule("/src/components/lark-ticket/LarkAppMarkdown.jsx");
    const markup = renderToStaticMarkup(createElement(LarkAppMarkdown, { text: "## 依据\n**重点**\n- 核对环境\n- 核对时间\n\n| 条件 | 动作 |\n| --- | --- |\n| A | B |\n```\n<script>unsafe()</script>\n```\n<script>unsafe()</script>\n[链接](https://example.com)\n[危险](javascript:unsafe)" }));
    assert.match(markup, /<h3>依据<\/h3>/);
    assert.match(markup, /<strong>重点<\/strong>/);
    assert.match(markup, /<ul><li>核对环境<\/li><li>核对时间<\/li><\/ul>/);
    assert.match(markup, /<table>/);
    assert.match(markup, /href="https:\/\/example.com\/"/);
    assert.doesNotMatch(markup, /<script|href="javascript:/);
    assert.match(markup, /&lt;script&gt;/);
  } finally { await server.close(); }
});
