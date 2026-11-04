import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("Ticket task cards distinguish configuration, execution, unavailable records and planned work", async () => {
  const server = await createServer({ configFile: false, root: new URL("../..", import.meta.url).pathname, server: { middlewareMode: true, hmr: false, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom" });
  try {
    const { TicketBackgroundTaskCard } = await server.ssrLoadModule("/src/pages/SyncStatusPage.jsx");
    const task = { id: "lark-thread-tickets", label: "自动创建 Ticket", implemented: true, configured: true, enabled: true, intervalMinutes: 2, batchLimit: 7, sourceCount: 1 };
    const render = (overrides) => renderToStaticMarkup(createElement(TicketBackgroundTaskCard, { task: { ...task, ...overrides } }));
    const running = render({ runStatus: "running", running: true });
    assert.match(running, /执行中/);
    assert.match(running, /每 2 分钟/);
    assert.match(running, /每个来源 7 条/);
    assert.doesNotMatch(running, /<button/);
    const stale = render({ runStatus: "running", running: false });
    assert.match(stale, /状态未知（无有效运行租约）/);
    assert.doesNotMatch(stale, /执行中/);
    const disabled = render({ enabled: false });
    assert.match(disabled, /未启用/);
    assert.match(disabled, /暂无运行记录/);
    assert.match(render({ configured: false }), /未配置/);
    assert.match(render({ statusUnavailable: true }), /状态暂不可用/);
    const failed = render({ runStatus: "failed", lastErrorCode: "LARK_PERMISSION_DENIED" });
    assert.match(failed, /最近失败/);
    assert.match(failed, /LARK_PERMISSION_DENIED/);
    const done = renderToStaticMarkup(createElement(TicketBackgroundTaskCard, { task: { id: "lark-ticket-done-reaction", label: "自动添加 Done 表情", implemented: false, enabled: false } }));
    assert.match(done, /自动添加 Done 表情/);
    assert.match(done, /尚未实现/);
    assert.doesNotMatch(done, /已启用|运行中|执行中|扫描间隔|<button/);
    const enabledDone = renderToStaticMarkup(createElement(TicketBackgroundTaskCard, { task: {
      id: "lark-ticket-done-reaction", label: "自动添加 Done 表情", implemented: true, configured: true, enabled: false,
      intervalMinutes: 10, overlapMinutes: 5, targetStatus: "Resolved", targetCount: 2,
    } }));
    assert.match(enabledDone, /每 10 分钟/);
    assert.match(enabledDone, /5 分钟/);
    assert.match(enabledDone, /Resolved/);
    assert.doesNotMatch(enabledDone, /尚未实现|来源群数量|每轮处理上限|undefined|<button/);
  } finally {
    await server.close();
  }
});
