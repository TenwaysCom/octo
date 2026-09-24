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

test("Shadow saved analysis renders concise assessments and old results as unevaluated", async () => {
  const server = await createServer({ configFile: false, root: new URL("../..", import.meta.url).pathname, server: { middlewareMode: true, hmr: false, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom" });
  try {
    const { LarkAppAnalysis } = await server.ssrLoadModule("/src/components/lark-ticket/LarkAppAnalysis.jsx");
    const ticket = { baseId: "base", tableId: "table", recordId: "record", shadowAi: {
      status: "ok", analyzedAt: "2026-09-23T09:00:00Z",
      businessRisk: { level: 6, rationale: "发货流程受阻，无替代方案", evidenceMessageIds: ["om_private"] },
      replyAdvice: { advice: "reply_now", rationale: "已错过反馈承诺，建议说明进展", evidenceMessageIds: ["om_private"] },
    } };
    const markup = renderToStaticMarkup(createElement(LarkAppAnalysis, { ticket, apiBaseUrl: "/api" }));
    assert.match(markup, /业务风险/);
    assert.match(markup, /6\/9/);
    assert.match(markup, /发货流程受阻，无替代方案/);
    assert.match(markup, /回复时机（分析时）/);
    assert.match(markup, /立即回复/);
    assert.match(markup, /已错过反馈承诺，建议说明进展/);
    assert.doesNotMatch(markup, /om_private/);
    const old = renderToStaticMarkup(createElement(LarkAppAnalysis, { ticket: { ...ticket, shadowAi: { status: "ok" } }, apiBaseUrl: "/api" }));
    assert.equal(old.match(/未评估/g)?.length, 2);
    const degraded = renderToStaticMarkup(createElement(LarkAppAnalysis, { ticket: { ...ticket, shadowAi: { ...ticket.shadowAi, wikiContext: { status: "unavailable", sources: [] } } }, apiBaseUrl: "/api" }));
    assert.match(degraded.split('<details')[0], /Wiki 不可用，本次仅基于聊天分析/);
  } finally { await server.close(); }
});
