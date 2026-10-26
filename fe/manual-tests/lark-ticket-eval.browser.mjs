// Browser mock integration. Uses synthetic API responses; does not verify Lark login or deployed services.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../extension/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const server = await createServer({ root, configFile: `${root}/vite.config.js`, server: { host: '127.0.0.1', port: 4197, strictPort: true } });
let browser;
try {
await server.listen();
browser = await chromium.launch({ headless: true, ...(process.env.OCTO_EVAL_BROWSER_EXECUTABLE ? { executablePath: process.env.OCTO_EVAL_BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let sample, revision = 0, abortFirst = false, shadow, history = [], delayRead = false, readStarted, releaseRead;
const writes = [], committed = new Set();
const ticket = { baseId: 'b', tableId: 't', recordId: 'r', title: 'Synthetic QA Ticket', ticketNumber: 'TEST-144', syncedAt: '2026-10-21T00:00:00Z' };
const reset = () => { sample = null; revision = 0; abortFirst = false; committed.clear(); writes.length = 0; shadow = { status: 'ok', snapshotVersion: 1, analyzedAt: '2026-10-21T01:00:00Z', summary: '旧版问题摘要', intent: '咨询', solutionSummary: '请核对 UK 环境', evalVersion: 'a'.repeat(64) }; };
const time = () => new Date(Date.UTC(2026, 9, 21, 2, 0, revision++)).toISOString();
await page.route('https://**/*', route => route.abort());
await page.route('**/api/**', async route => {
  const req = route.request(), path = new URL(req.url()).pathname;
  const ok = data => route.fulfill({ json: { ok: true, data } });
  const fail = (code, status = 409) => route.fulfill({ status, json: { ok: false, error: { errorCode: code } } });
  if (path === '/api/web/profile') return ok({ user: { id: 'test', larkName: 'Synthetic QA' }, workspaceAccess: { platformLists: true, platformSync: true } });
  if (path === '/api/lark/auth/web/ensure') return ok({ user: { id: 'test' } });
  if (path === '/api/web/platform-data/lark-tickets') return ok({ items: [{ ...ticket, shadowAi: shadow }, { ...ticket, recordId: 'r2', title: 'Other Synthetic Ticket', shadowAi: { ...shadow, summary: '另一个 Ticket 的摘要' } }] });
  if (path === '/api/web/platform-data/lark-ticket-filter-options') return ok({ requester: [], responsible: [], issueType: [] });
  if (path.endsWith('/ai-sessions')) return ok({ sessions: [] });
  if (path === '/api/web/lark-ticket-eval-samples') return ok({ samples: history.length ? history : sample ? [sample] : [] });
  if (path.endsWith('/shadow-eval-sample') && req.method() === 'GET') {
    if (path.includes('/r2/')) return ok({ ticket: { ...ticket, recordId: 'r2', title: 'Other Synthetic Ticket' }, shadowAi: { ...shadow, summary: '另一个 Ticket 的摘要' }, outputVersion: shadow.evalVersion, sample: null });
    if (delayRead) { delayRead = false; readStarted(); await new Promise(resolve => { releaseRead = resolve; }); }
    return ok({ ticket, shadowAi: shadow, outputVersion: shadow.evalVersion, sample: sample?.outputVersion === shadow.evalVersion ? sample : null });
  }
  if (path.endsWith('/shadow-eval-sample') && req.method() === 'POST') {
    const body = req.postDataJSON(); writes.push({ method: 'POST', body });
    if (committed.has(body.actionRunId)) return ok({ sample });
    if (sample?.outputVersion === body.outputVersion) return fail('EVAL_SAMPLE_CONFLICT');
    if (body.outputVersion !== shadow.evalVersion) return fail('SHADOW_OUTPUT_CHANGED');
    const stamp = time();
    sample = { id: `s-${revision}`, ticket, source: 'shadow', snapshotVersion: 1, outputVersion: shadow.evalVersion, aiOutput: { shadowAi: structuredClone(shadow) }, createdAt: stamp, updatedAt: stamp, evalAt: stamp, evalBy: 'Synthetic QA', ...body };
    committed.add(body.actionRunId);
    if (abortFirst) { abortFirst = false; return route.abort(); }
    return ok({ sample });
  }
  if (path.startsWith('/api/web/lark-ticket-eval-samples/') && req.method() === 'PUT') {
    const body = req.postDataJSON(); writes.push({ method: 'PUT', body });
    if (committed.has(body.actionRunId)) return ok({ sample });
    if (body.expectedUpdatedAt !== sample.updatedAt) return fail('EVAL_SAMPLE_CONFLICT');
    const stamp = time(); sample = { ...sample, ...body, updatedAt: stamp, evalAt: stamp };
    committed.add(body.actionRunId); return ok({ sample });
  }
  return fail('MOCK_NOT_AVAILABLE', 503);
});
const url = 'http://127.0.0.1:4197/#lark-app-thread-analysis?baseId=b&tableId=t&recordId=r';
const open = async () => { await page.goto(url); await page.reload(); await page.getByRole('button', { name: '标记 Badcase', exact: true }).waitFor({ state: 'visible' }); await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === '纳入 Eval')?.disabled); };
const dialog = () => page.getByRole('dialog');
const fillBadcase = async (reason = 'UK 讨论误用了 EU 路径') => { await dialog().getByRole('checkbox', { name: '事实错误', exact: true }).check(); await dialog().getByLabel('失败原因（Badcase 必填）').fill(reason); };
  reset(); await open();
  await page.locator('.lark-app__eval').screenshot({ path: '/tmp/octo-eval-controls-mobile.png' });
  await page.getByRole('button', { name: '标记 Badcase', exact: true }).click();
  assert(await dialog().getByLabel('失败原因（Badcase 必填）').evaluate(element => element.getBoundingClientRect().width >= element.closest('fieldset').clientWidth - 2));
  await dialog().screenshot({ path: '/tmp/octo-eval-form-mobile.png' });
  assert.equal(await dialog().getByLabel('人工标准意图（选填）').isVisible(), false);
  await dialog().locator('.ticket-eval-editor__optional > summary').focus();
  await page.keyboard.press('Enter');
  await dialog().getByLabel('人工标准意图（选填）').fill('取消前的临时输入');
  await dialog().locator('.ticket-eval-editor__optional > summary').click();
  await page.keyboard.press('Tab');
  assert.equal(await dialog().getByRole('button', { name: '取消', exact: true }).evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await dialog().locator('.ticket-eval-editor__optional > summary').evaluate(element => element === document.activeElement), true);
  await dialog().getByRole('button', { name: '取消', exact: true }).click(); assert.equal(writes.length, 0);
  await page.getByRole('button', { name: '标记 Badcase', exact: true }).click();
  await dialog().getByRole('button', { name: '保存标注' }).click(); await dialog().getByRole('alert').filter({ hasText: '至少选择一个' }).waitFor();
  const errorBounds = await dialog().getByRole('alert').boundingBox(); assert(errorBounds.y + errorBounds.height <= 844);
  await dialog().getByRole('checkbox', { name: '事实错误', exact: true }).check();
  await dialog().getByRole('button', { name: '保存标注' }).click(); await dialog().getByRole('alert').filter({ hasText: '填写失败原因' }).waitFor();
  assert.equal(writes.length, 0);
  await dialog().getByLabel('失败原因（Badcase 必填）').fill('UK 讨论误用了 EU 路径');
  await dialog().locator('.ticket-eval-editor__optional > summary').click();
  await dialog().getByLabel('人工标准意图（选填）').fill('咨询操作方法');
  await dialog().getByLabel('期望结果（选填）').fill('提供 UK 的处理路径');
  await dialog().locator('.ticket-eval-editor__optional > summary').click();
  await dialog().getByRole('button', { name: '保存标注' }).click(); await dialog().waitFor({ state: 'detached' });
  assert.equal(writes.length, 1); assert.equal(writes[0].body.datasetStatus, 'badcase');
  await page.reload(); await page.getByRole('button', { name: '编辑标注', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '编辑原因', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '纳入 Eval', exact: true }).count(), 0);
  await page.getByRole('button', { name: '编辑标注', exact: true }).click();
  assert.equal(await dialog().getByLabel('失败原因（Badcase 必填）').inputValue(), 'UK 讨论误用了 EU 路径');
  await dialog().getByLabel('数据集状态').selectOption('eval'); await dialog().getByRole('button', { name: '保存标注' }).click(); await dialog().waitFor({ state: 'detached' });
  assert.equal(sample.datasetStatus, 'eval'); assert.equal(sample.notes, 'UK 讨论误用了 EU 路径');
  assert.equal(sample.manualIntent, '咨询操作方法'); assert.equal(sample.expectedOutcome, '提供 UK 的处理路径');
  process.stdout.write('PASS: initial Badcase is atomic; cancel and invalid forms do not write; reload and state changes preserve annotation\n');

  await page.getByRole('button', { name: '编辑标注', exact: true }).click();
  await dialog().getByLabel('失败原因（Badcase 必填）').fill('我的补充');
  sample = { ...sample, notes: '另一位标注人的原因', manualIntent: '另一位的新意图', updatedAt: time() };
  await dialog().getByRole('button', { name: '保存标注' }).click(); await dialog().getByRole('alert').filter({ hasText: '已被更新' }).waitFor();
  assert.equal(await dialog().getByLabel('失败原因（Badcase 必填）').inputValue(), '我的补充');
  await dialog().getByRole('button', { name: '重新读取', exact: true }).click(); await dialog().getByText('最新原因：另一位标注人的原因').waitFor();
  assert.equal(await dialog().getByLabel('人工标准意图（选填）').inputValue(), '另一位的新意图');
  await dialog().getByRole('button', { name: '保存标注' }).click(); await dialog().waitFor({ state: 'detached' }); assert.equal(sample.notes, '我的补充');
  process.stdout.write('PASS: stale editor is rejected; explicit reload preserves local edits and adopts untouched server fields\n');

  reset(); await open(); abortFirst = true;
  await page.getByRole('button', { name: '纳入 Eval', exact: true }).click(); await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: '纳入 Eval', exact: true }).click(); await page.getByText('标注已保存。', { exact: true }).waitFor();
  assert.equal(writes.length, 2); assert.equal(writes[0].body.actionRunId, writes[1].body.actionRunId); assert.equal(committed.size, 1);
  process.stdout.write('PASS: lost response retries the same actionRunId\n');

  reset(); await open(); await page.getByRole('button', { name: '标记 Badcase', exact: true }).click(); await fillBadcase('旧版本的失败说明');
  shadow = { ...shadow, evalVersion: 'b'.repeat(64), summary: '新版问题摘要', analyzedAt: '2026-10-21T03:00:00Z' };
  await dialog().getByRole('button', { name: '保存标注' }).click(); await dialog().getByRole('alert').filter({ hasText: '已更新' }).waitFor();
  assert.equal(sample, null);
  await dialog().getByRole('button', { name: '重新读取', exact: true }).click(); await dialog().getByText('新版问题摘要', { exact: true }).waitFor();
  assert.equal(await dialog().getByLabel('失败原因（Badcase 必填）').inputValue(), '旧版本的失败说明');
  const bounds = await dialog().boundingBox(); assert(bounds.width <= 390);
  const saveBounds = await dialog().getByRole('button', { name: '保存标注' }).boundingBox(); assert(saveBounds.y + saveBounds.height <= 844);
  assert(await dialog().evaluate(element => element.scrollWidth <= element.clientWidth));
  await dialog().evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: '/tmp/octo-eval-mobile.png', fullPage: false });
  await dialog().getByRole('button', { name: '保存标注' }).click(); await dialog().waitFor({ state: 'detached' });
  assert.equal(sample.outputVersion, 'b'.repeat(64));
  process.stdout.write('PASS: first save rejects changed output; review refreshes frozen preview and retains input; 390px modal fits\n');
  const started = new Promise(resolve => { readStarted = resolve; });
  delayRead = true;
  await page.getByRole('button', { name: '重新读取', exact: true }).click();
  await started;
  await page.evaluate(() => { location.hash = '#lark-app-thread-analysis?baseId=b&tableId=t&recordId=r2'; });
  await page.getByRole('heading', { name: 'Other Synthetic Ticket', exact: true }).waitFor();
  await page.getByText('另一个 Ticket 的摘要', { exact: true }).first().waitFor();
  releaseRead();
  await page.waitForTimeout(100);
  assert.equal(await page.getByRole('heading', { name: 'Other Synthetic Ticket', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '编辑原因', exact: true }).count(), 0);
  process.stdout.write('PASS: late reads from the previous Ticket do not leak into the selected Ticket\n');

  history = [sample, { ...sample, id: 'legacy', source: 'legacy', outputVersion: '', aiOutput: { 'AI意图': '旧正式意图' }, createdAt: '2026-10-01T00:00:00Z' }];
  shadow = { ...shadow, summary: '动态最新分析，不能进入冻结样本' };
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { location.hash = '#lark-tickets'; });
  await page.getByRole('button', { name: /配置.*Lark Ticket.*视图/ }).click();
  await page.getByRole('button', { name: '✓ Eval 数据集', exact: true }).click();
  await page.getByLabel('分组', { exact: true }).selectOption('none');
  await page.getByRole('button', { name: /配置.*Lark Ticket.*视图/ }).click();
  const versions = page.getByLabel('选择 Synthetic QA Ticket 的评测版本');
  await versions.waitFor();
  await versions.selectOption('legacy');
  await page.getByText('旧正式意图', { exact: true }).first().waitFor();
  await versions.selectOption(sample.id);
  await page.getByRole('button', { name: '编辑 Eval', exact: true }).click();
  await dialog().screenshot({ path: '/tmp/octo-eval-form-desktop.png' });
  await dialog().locator('.ticket-eval-editor__ai > summary').click();
  await dialog().getByText('新版问题摘要', { exact: true }).waitFor();
  assert.equal(await dialog().getByText('动态最新分析，不能进入冻结样本', { exact: true }).count(), 0);
  await dialog().getByRole('button', { name: '取消', exact: true }).click();
  process.stdout.write('PASS: main Eval view reads the same saved sample and selects legacy versions without borrowing current Shadow\n');
  assert.deepEqual(errors, []);
} finally { await browser?.close(); await server.close(); }
