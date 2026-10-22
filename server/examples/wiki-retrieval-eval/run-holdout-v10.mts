import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hash } from './inputs-v7.mts';

// Validate the newly frozen holdout without changing the locked live runner.
const out = resolve('docs/tasks/ai-ticket/wiki-rag-v10');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const frozen = read(resolve(out, 'holdout-freeze.json'));
assert.equal(hash(readFileSync(resolve(out, 'holdout-cases.json'))), frozen.casesSha256);
assert.equal(hash(readFileSync('/tmp/octo-wiki-rag-v10/holdout-inputs.private.json')), frozen.privateInputSha256);
assert.equal(hash(readFileSync(resolve(out, 'selection-lock.json'))), frozen.selectionSha256);
assert.equal(hash(readFileSync(resolve(out, 'stability.json'))), frozen.stabilitySha256);
assert.equal(hash(readFileSync(new URL('./live-v10.mts', import.meta.url))), frozen.liveCodeSha256);
for (const [name, expected] of Object.entries(frozen.code)) {
  assert.equal(hash(readFileSync(new URL('./' + name, import.meta.url))), expected);
}
process.argv[2] = 'holdout';
await import('./live-v10.mts');
