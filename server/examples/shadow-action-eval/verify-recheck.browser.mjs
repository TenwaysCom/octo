// Local-file browser checks only. No API, platform or model access.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../../extension/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const artifacts = path.join(root, 'evals/lark-ticket-ai/artifacts');
const input = path.resolve(process.argv[2] || path.join(artifacts, 'shadow-first10-v2-recheck-20261023'));
const output = path.resolve(process.argv[3] || path.join(artifacts, 'shadow-first10-v2-browser-check'));
assert(input.startsWith(artifacts + path.sep) && output.startsWith(artifacts + path.sep) && input !== output);
const rows = (await readFile(path.join(input, 'comparison.private.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
const countAction = action => rows.filter(row => row.first10_candidate.expected.action === action).length;
const changed = rows.filter(row => row.classification_recheck.action_changed).length;
await mkdir(output, { mode: 0o700 });
await chmod(output, 0o700);
const executablePath = process.env.OCTO_EVAL_BROWSER_EXECUTABLE || (existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : undefined);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let externalRequests = 0;
  await context.route(/^https?:\/\//, route => { externalRequests++; return route.abort(); });
  const page = await context.newPage();
  let pageErrors = 0;
  page.on('pageerror', () => { pageErrors++; });
  await page.goto(pathToFileURL(path.join(input, 'comparison.private.html')).href);
  assert.equal(await page.locator('article').count(), 120);
  assert.equal(await page.locator('.recheck-basis').count(), 120);
  assert.equal(await page.locator('.history').count(), 111);
  assert.equal(await page.locator('.history[open]').count(), 0);
  const visible = () => page.locator('article:visible').count();
  await page.selectOption('#action-filter', 'human');
  assert.equal(await visible(), countAction('human'));
  await page.selectOption('#action-filter', 'wait');
  assert.equal(await visible(), countAction('wait'));
  await page.selectOption('#action-filter', '');
  await page.check('#changed-filter');
  assert.equal(await visible(), changed);
  await page.selectOption('#action-filter', 'human');
  assert.equal(await visible(), rows.filter(row => row.classification_recheck.action_changed && row.first10_candidate.expected.action === 'human').length);
  await page.uncheck('#changed-filter');
  await page.selectOption('#action-filter', '');
  await page.fill('#case-filter', 'S10-019');
  assert.equal(await visible(), 1);
  await page.fill('#case-filter', 'does-not-exist');
  assert.equal(await visible(), 0);
  await page.locator('.changes a[href="#S10-116"]').click();
  assert.equal(await visible(), 120);
  assert.equal(new URL(page.url()).hash, '#S10-116');
  await page.locator('#S10-001 .history summary').click();
  assert.equal(await page.locator('#S10-001 .history[open]').count(), 1);
  await page.locator('#S10-001 .history summary').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, 'desktop.private.png') });
  await chmod(path.join(output, 'desktop.private.png'), 0o600);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.equal(await page.locator('#S10-001 .grid').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 1);
  await page.screenshot({ path: path.join(output, 'mobile.private.png') });
  await chmod(path.join(output, 'mobile.private.png'), 0o600);
  assert.equal(externalRequests, 0);
  assert.equal(pageErrors, 0);
  const report = { scope: 'local_html_browser_only', cases: 120, basisPanels: 120, originalPanels: 111,
    changedCases: changed, humanFilter: countAction('human'), waitFilter: countAction('wait'),
    searchAndChangedNavigation: 'passed', historyInitiallyCollapsed: true, mobileWidth: 390,
    mobileHorizontalOverflow: false, pageErrors, externalRequests, deployedRuntimeVerified: false };
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  process.stdout.write(JSON.stringify(report) + '\n');
} finally {
  await browser.close();
}
