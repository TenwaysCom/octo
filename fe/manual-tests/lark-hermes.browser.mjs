// Browser mock integration: synthetic Tickets, sessions and ACP events only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../extension/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: `${root}/vite.config.js`, server: { host: '127.0.0.1', port: 4198, strictPort: true } });
const action = 'lark-ticket-support-qa-answer';
const ticket = { baseId: 'b', tableId: 't', recordId: 'r1', title: 'Hermes Synthetic QA', syncedAt: '2026-10-21T00:00:00Z' };
const otherTicket = { ...ticket, recordId: 'r2', title: 'Other Synthetic QA' };
const chunk = (text, kind = 'agent_message_chunk') => ({ event: 'acp.session.update', data: { sessionId: 'h1', update: { sessionUpdate: kind, content: { type: 'text', text } } } });
const done = { event: 'done', data: { sessionId: 'h1', stopReason: 'end_turn' } };
const stamp = () => new Date().toISOString();
let browser, pending = false, thinkingOnly = false, revision = 0, delayLoad = false, releaseLoad, loadStarted;
let current = { sessionId: 'h1', title: 'Existing Hermes answer', agentProvider: 'hermes_acp', actionKey: action, threadSnapshotVersion: 1, threadContextSyncedAt: '2026-10-20T00:00:00Z', updatedAt: stamp(), runStatus: 'completed', events: [chunk('已有 Hermes 答案'), done] };
const sessions = new Map([['h1', current]]), posts = [], stops = [], approvals = [], effects = [], errors = [];
const summary = ({ events, ...session }) => session;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.OCTO_EVAL_BROWSER_EXECUTABLE ? { executablePath: process.env.OCTO_EVAL_BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const ok = data => route.fulfill({ json: { ok: true, data } });
    if (path === '/api/web/profile') return ok({ user: { id: 'qa', larkName: 'Synthetic QA' }, workspaceAccess: { platformLists: true, platformSync: true } });
    if (path === '/api/lark/auth/web/ensure') return ok({ user: { id: 'qa' } });
    if (path === '/api/web/platform-data/lark-tickets') return ok({ items: [ticket, otherTicket] });
    if (path.endsWith('/shadow-eval-sample')) return ok({ ticket: path.includes('/r2/') ? otherTicket : ticket, shadowAi: null, sample: null });
    if (path.includes('effect-drafts')) { effects.push(path); return ok({ drafts: [] }); }
    if (path.endsWith('/ai-sessions') && request.method() === 'GET') return ok({ sessions: path.includes('/r2/') ? [] : [
      ...[...sessions.values()].map(summary), { sessionId: 'legacy-kimi', title: 'Private old Kimi', actionKey: action, agentProvider: 'kimi_acp', updatedAt: '2099-01-01' },
      { sessionId: 'wiki', actionKey: 'lark-ticket-wiki-qa', agentProvider: 'wiki_qa', updatedAt: stamp() },
      { sessionId: 'document', actionKey: 'lark-ticket-support-qa-document-preview', agentProvider: 'hermes_acp', updatedAt: stamp() },
    ] });
    if (path.endsWith('/load')) {
      const id = decodeURIComponent(path.split('/').at(-2));
      const snapshot = structuredClone(sessions.get(id));
      if (delayLoad) { delayLoad = false; loadStarted(); await new Promise(resolve => { releaseLoad = resolve; }); }
      return ok(snapshot);
    }
    if (path.endsWith('/stop')) {
      stops.push(request.postDataJSON()); current.runStatus = 'cancelled'; current.errorMessage = '已停止';
      current.events = current.events.map(event => event.event === 'acp.permission.requested' ? { event: 'acp.permission.resolved', data: { ...event.data, status: 'cancelled' } } : event);
      return ok(current);
    }
    if (path === '/api/web/acp/permissions/reply') {
      const body = request.postDataJSON(); approvals.push(body);
      const permission = current.events.find(event => event.event === 'acp.permission.requested').data;
      current.events.push({ event: 'acp.permission.resolved', data: { ...permission, status: body.optionId === 'allow' ? 'approved' : 'rejected' } });
      current.runStatus = body.optionId === 'allow' ? 'completed' : 'failed';
      if (body.optionId === 'allow') current.events.push(chunk('审批后完成的回答'), done);
      else { current.errorMessage = '已拒绝，本轮终止'; current.events.push(done); }
      return ok({ status: body.optionId === 'allow' ? 'approved' : 'rejected' });
    }
    if (path.endsWith('/ai-sessions') && request.method() === 'POST') {
      const body = request.postDataJSON(); posts.push(body); revision += 1;
      const id = body.sessionId || `h-new-${revision}`;
      current = body.sessionId ? sessions.get(id) : { sessionId: id, title: 'New Hermes answer', actionKey: action, agentProvider: 'hermes_acp', threadSnapshotVersion: revision + 1, threadContextSyncedAt: stamp(), events: [] };
      Object.assign(current, { runId: `run-${revision}`, updatedAt: stamp(), runStatus: thinkingOnly ? 'running' : pending ? 'waiting_permission' : 'completed' });
      const events = [chunk(body.message, 'user_message_chunk')];
      if (thinkingOnly) events.push(chunk('synthetic private reasoning', 'agent_thought_chunk'));
      else if (pending) events.push({ event: 'acp.permission.requested', data: {
        sessionId: id, actionRunId: body.actionRunId, requestId: `permission-${revision}`, expiresAt: new Date(Date.now() + 50000).toISOString(),
        toolCall: { title: 'QA 读取知识', rawInput: { command: 'read QA fixture' } }, options: [{ optionId: 'allow', name: '允许', kind: 'allow_once' }, { optionId: 'reject', name: '拒绝', kind: 'reject_once' }],
      } });
      else events.push({ event: 'acp.session.update', data: { sessionId: id, update: { sessionUpdate: 'tool_call', toolCallId: `tool-${revision}`, title: '读取知识', status: 'completed' } } }, chunk(`回答 ${revision}`), done);
      current.events.push(...events); sessions.set(id, current);
      // WebAiSessionRuns stores the user entry for load, but streams only Agent events.
      const stream = [{ event: 'run.started', data: { runId: current.runId, sessionId: id, actionRunId: body.actionRunId } }, { event: 'session.created', data: { sessionId: id } }, ...events.filter(event => event.data?.update?.sessionUpdate !== 'user_message_chunk')];
      return route.fulfill({ contentType: 'text/event-stream', body: stream.map(event => `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`).join('') });
    }
    return route.fulfill({ status: 404, json: { ok: false, error: { errorCode: 'MOCK_NOT_AVAILABLE' } } });
  });
  await page.goto('http://127.0.0.1:4198/#lark-app-thread-analysis?baseId=b&tableId=t&recordId=r1');
  await page.getByRole('tab', { name: 'Hermes Agent AI', exact: true }).click();
  const panel = () => page.getByRole('region', { name: 'Hermes Agent AI 问答' });
  await page.getByText('已有 Hermes 答案', { exact: true }).waitFor(); assert.equal(posts.length, 0);
  assert.equal(await page.getByRole('option', { name: /Private old Kimi/ }).count(), 0);
  await page.getByLabel('继续提问').fill('补充 UK 的处理建议'); await page.getByRole('button', { name: '发送追问', exact: true }).click();
  await page.getByText('回答 1', { exact: true }).waitFor(); assert.equal(posts.length, 1); assert.equal(posts[0].sessionId, 'h1');
  await page.waitForFunction(() => document.querySelector('.lark-hermes__composer textarea')?.value === '');
  await page.getByLabel('继续提问').fill('切换页签保留输入');
  await page.getByRole('tab', { name: 'WIKI Rag AI', exact: true }).click();
  await page.getByRole('tab', { name: 'Hermes Agent AI', exact: true }).click();
  assert.equal(await page.getByLabel('继续提问').inputValue(), '切换页签保留输入');
  assert.equal(await panel().locator('details[open]').count(), 0);
  assert(await panel().evaluate(element => element.scrollWidth <= element.clientWidth));
  await page.screenshot({ path: '/tmp/octo-hermes-mobile.png', fullPage: true });
  process.stdout.write('PASS: tab navigation is read-only, Hermes history is isolated, follow-up shares session, tools collapse and 390px fits\n');

  await page.getByRole('button', { name: '新对话', exact: true }).click(); await page.getByRole('button', { name: '回答问题', exact: true }).click();
  await page.getByText('回答 2', { exact: true }).waitFor(); assert.equal(posts[1].sessionId, undefined); assert.equal(posts[1].actionKey, action);
  await page.getByText('聊天资料 v3', { exact: false }).waitFor();
  assert.equal(effects.length, 0); process.stdout.write('PASS: new conversation prepares a new context and does not expose business writeback\n');

  pending = true; await page.getByLabel('继续提问').fill('核实依据'); await page.getByRole('button', { name: '发送追问', exact: true }).click();
  await page.getByRole('button', { name: '仅允许这一次', exact: true }).waitFor();
  await page.getByRole('button', { name: '仅允许这一次', exact: true }).click();
  await page.getByText('审批后完成的回答', { exact: true }).waitFor(); assert.equal(approvals.length, 1); assert.equal(approvals[0].requestId, 'permission-3');
  process.stdout.write('PASS: interrupted stream restores run, visible native approval continues the same session\n');

  await page.getByLabel('继续提问').fill('拒绝这次工具'); await page.getByRole('button', { name: '发送追问', exact: true }).click();
  await page.getByRole('button', { name: '拒绝并停止', exact: true }).click();
  await panel().getByRole('alert').filter({ hasText: '已拒绝' }).waitFor();
  assert.equal(await page.getByLabel('继续提问').inputValue(), '拒绝这次工具');
  assert.equal(posts.length, 4); process.stdout.write('PASS: rejected permission remains failed despite a late done and retains follow-up input\n');

  await page.getByLabel('继续提问').fill('后台执行'); await page.getByRole('button', { name: '发送追问', exact: true }).click();
  await page.getByRole('button', { name: '仅允许这一次', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'WIKI Rag AI', exact: true }).click(); assert.equal(stops.length, 0);
  current.runStatus = 'completed'; current.events = current.events.filter(event => event.event !== 'acp.permission.requested'); current.events.push(chunk('后台完成的答案'), done);
  await page.getByRole('tab', { name: 'Hermes Agent AI', exact: true }).click(); await page.getByText('后台完成的答案', { exact: true }).waitFor();
  assert.equal(posts.length, 5); assert.equal(stops.length, 0); process.stdout.write('PASS: leaving tab detaches view, reopening restores background output without starting another run\n');

  await page.getByLabel('继续提问').fill('需要停止'); await page.getByRole('button', { name: '发送追问', exact: true }).click();
  await page.getByRole('button', { name: '仅允许这一次', exact: true }).waitFor(); await page.getByRole('button', { name: '停止', exact: true }).click();
  await page.getByText('已停止，已有内容已保留。', { exact: true }).waitFor(); assert.equal(stops.length, 1); assert.equal(stops[0].runId, 'run-6');
  assert.equal(await page.getByRole('button', { name: '仅允许这一次', exact: true }).count(), 0);
  process.stdout.write('PASS: explicit stop cancels only the selected run and disables stale approval\n');

  const started = new Promise(resolve => { loadStarted = resolve; }); delayLoad = true;
  await page.getByRole('button', { name: '读取进度', exact: true }).click(); await started;
  await page.evaluate(() => { location.hash = '#lark-app-thread-analysis?baseId=b&tableId=t&recordId=r2'; });
  await page.getByRole('heading', { name: otherTicket.title, exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Hermes Agent AI', exact: true }).click();
  releaseLoad(); await page.getByRole('button', { name: '回答问题', exact: true }).waitFor();
  assert.equal(await page.getByText('后台完成的答案', { exact: true }).count(), 0); assert.equal(posts.length, 6);
  await page.getByRole('tab', { name: 'Hermes Agent AI', exact: true }).press('Home');
  assert.equal(await page.getByRole('tab', { name: 'Shadow AI', exact: true }).getAttribute('aria-selected'), 'true');
  await page.getByRole('tab', { name: 'Shadow AI', exact: true }).press('End');
  assert.equal(await page.getByRole('tab', { name: 'Hermes Agent AI', exact: true }).getAttribute('aria-selected'), 'true');
  process.stdout.write('PASS: Ticket switch rejects stale load and keyboard tab order includes the third panel\n');

  pending = false;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { location.hash = '#lark-tickets/r1'; });
  await page.locator('.ticket-ai-session-card').filter({ hasText: 'New Hermes answer' }).click();
  await page.locator('#ticket-ai-followup').fill('主站继续追问');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByText('回答 7', { exact: true }).waitFor();
  const mainSessionId = posts.at(-1).sessionId; assert.equal(mainSessionId, current.sessionId);
  await page.getByRole('button', { name: '关闭 AI Session', exact: true }).click();
  await page.evaluate(() => { location.hash = '#lark-app-thread-analysis?baseId=b&tableId=t&recordId=r1'; });
  await page.getByRole('tab', { name: 'Hermes Agent AI', exact: true }).click();
  await page.getByText('回答 7', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Hermes 历史会话').inputValue(), mainSessionId);
  assert.equal(posts.length, 7); assert.deepEqual(errors, []);

  // A long existing answer can place the transcript's top status off screen.
  // Thinking-only native events must still leave visible feedback at the composer.
  thinkingOnly = true;
  await page.getByLabel('继续提问').fill('追问后等待模型处理');
  await page.getByRole('button', { name: '发送追问', exact: true }).click();
  const composer = panel().locator('.lark-hermes__composer');
  await composer.getByRole('status').filter({ hasText: 'Hermes 正在处理' }).waitFor();
  assert.equal(posts.length, 8);
  assert.equal(await composer.getByRole('button', { name: '正在回答…', exact: true }).isDisabled(), true);
  assert.equal(await page.getByText('synthetic private reasoning', { exact: true }).count(), 0);
  process.stdout.write('PASS: thinking-only follow-up shows processing feedback next to composer without exposing reasoning\n');
  process.stdout.write('PASS: actual main detail UI continues the same session and Lark tab restores its new answer\n');
} finally { await browser?.close(); await server.close(); }
