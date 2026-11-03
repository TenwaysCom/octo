"""Freeze source-audited labels after recall inspection and before holdout scores."""
import hashlib
import json
from pathlib import Path

OUT = Path('docs/tasks/ai-ticket/wiki-rag-v10')
ROOT = Path('/tmp/octo-wiki-rag-v10')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert read(OUT / 'stability.json')['passed']
assert not (OUT / 'holdout-freeze.json').exists()
assert len([json.loads(s) for s in (OUT / 'requests.jsonl').read_text().splitlines() if json.loads(s)['event'] == 'started']) == 10
cases = read(OUT / 'holdout-draft.json')['cases']
private = read(ROOT / 'holdout-draft.private.json')
wrong = {
    'U17': ('concepts/accounting/historical-entry-mandatory-fields-reverse.md', 'Historical reversal blocked by missing dimensions differs from a current nonmandatory Partner reminder.'),
    'U18': ('concepts/integration/shopify-paused-order-history.md', 'Paused initial import differs from adding a gift after order confirmation.'),
    'U19': ('concepts/accounting/reverse-entry-type-history.md', 'Reversal document-type selection differs from mandatory attachments before posting manual entries.'),
    'U20': ('concepts/approvals/ops-submission-notification-history.md', 'Missing monthly promotion submission notifications differ from receiving a payment confirmation after approval.'),
    'U21': ('concepts/delivery/marketplace-tracking-update-history.md', 'Odoo-to-Shopify tracking delivery differs from a WMS status remaining unchanged when Odoo already has tracking.'),
    'U22': ('concepts/sales/sale-order-cancel-loyalty-usage-log-permission.md', 'Sale order closure/Loyalty Usage Log deletion differs from a PO SKU deletion blocking the original inbound operation.'),
    'U23': ('concepts/reporting/gross-profit-quantity-sign-history.md', 'Gross-profit return quantity sign differs from a missing SKU in stock reporting.'),
    'U24': ('concepts/accounting/financial-report-config-preserve-on-module-update.md', 'Report configuration overwritten by an update differs from restoring a user role that lost Accounting Reports access.'),
}
no_answer = {
    'U25': 'No candidate establishes the requested PAYMKT-to-POMKT mapping or current payment-in-kind contract treatment; general approval flow is insufficient.',
    'U26': 'No candidate contains the requested EU AR line-item dataset as of 2026-07-31. Historical exports and accounting definitions cannot supply these records.',
    'U27': 'No candidate documents this Circuly zero-value automatic invoice issue or its current fix state; manual shipping mail and zero-line invoice errors are different cases.',
    'U28': 'No candidate supplies an approved sample-bike Bike Model classification or a verified impact analysis for removing punctuation from model names.',
    'U29': 'No candidate supplies this new BTC Other Outbound first-approver configuration or its verified implementation result; generic policy change guidance is insufficient.',
    'U30': 'No candidate establishes the field mapping behind this cross-carrier Additional Info/Tracking URL mismatch; generic tracking/feedback cases do not identify this source logic.',
    'U31': 'No candidate supplies the requested new in-Odoo SKU-grouped Backorder Overview Report or its implementation result; stock conversion and export workflows differ.',
    'U32': 'No candidate identifies the actual CI unit-price source for this outbound/SO discrepancy; ordinary invoice totals and missing outbound price cases do not establish that field mapping.',
}
assert len(cases) == 32
assert sum(c['type'] == 'positive' and c['expectedRank20'] is not None for c in cases) >= 14
for c in cases:
    c['inputOrigin'] = 'Manual paraphrase/translation of original current request only; no support reply, root cause, or gold text added.'
    c['expectedPages'] = [c['expected']] if c['expected'] else []
    c['wrongPages'] = []
    if c['type'] == 'negative_pair':
        path, reason = wrong[c['id']]
        assert any(r['path'] == path for r in c['candidates'])
        c['wrongPages'] = [path]
        c['wrongRank20'] = next(r['rank'] for r in c['candidates'] if r['path'] == path)
        c['boundary'] = reason
    if c['type'] == 'no_answer':
        c['boundary'] = no_answer[c['id']]
        c['noAnswerLabelScope'] = 'No candidate supports the specific requested data/configuration/current-state/field-mapping fact. Related general modeling is not credited as that answer.'
    c['labelStatus'] = 'frozen_before_new_holdout_scores'
    c['sourceLinkedToExpected'] = c['expectedSourceLinked']


def write(path, value, private_file=False):
    with path.open('x') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write('\n')
    if private_file:
        path.chmod(0o600)


write(OUT / 'holdout-cases.json', {'cases': cases,
    'selectionBoundary': 'Manual source-grounded stratification for short pages/cross-language/intent differences; wrong pages chosen from actual Top20 before scores. Not random sampling.',
    'goldInRecall': '15/16 positives; U05 remains an unrepaired recall miss',
    'counts': {'positive': 16, 'negative_pair': 8, 'no_answer': 8}})
write(ROOT / 'holdout-inputs.private.json', [{k: r[k] for k in ['id', 'query', 'documents', 'candidatePaths']} for r in private], True)
script_names = ['holdout-v10-seeds.json', 'prepare-holdout-v10.mts', 'freeze-holdout-v10.py', 'run-holdout-v10.mts']
write(OUT / 'holdout-freeze.json', {
    'casesSha256': sha(OUT / 'holdout-cases.json'), 'privateInputSha256': sha(ROOT / 'holdout-inputs.private.json'),
    'selectionSha256': sha(OUT / 'selection-lock.json'), 'stabilitySha256': sha(OUT / 'stability.json'),
    'liveCodeSha256': sha(Path('server/examples/wiki-retrieval-eval/live-v10.mts')),
    'code': {name: sha(Path('server/examples/wiki-retrieval-eval') / name) for name in script_names},
    'httpBeforeHoldout': 10, 'holdoutCallsBeforeFreeze': 0, 'G': 'disabled',
    'scoresMayNotChangeLabelsOrCaseSelection': True,
})
print(json.dumps({'frozen': 32, 'positiveRecalled': 15, 'wrongPagesActuallyRecalled': 8, 'httpBeforeHoldout': 10, 'holdoutModelCalls': 0}))
