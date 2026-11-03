"""Audit cached development additions and lock one policy before fresh scores."""
import hashlib
import json
from pathlib import Path

OUT = Path('docs/tasks/ai-ticket/wiki-rag-v10')
ROOT = Path('/tmp/octo-wiki-rag-v10')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def write(name, value):
    if (OUT / name).exists():
        assert read(OUT / name) == value, 'Existing evidence differs: ' + name
        return
    with (OUT / name).open('x') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write('\n')


assert not (OUT / 'selection-lock.json').exists(), 'Never overwrite selection'
assert (OUT / 'development.json').read_bytes() == (OUT / 'development-r1.json').read_bytes(), 'Correction changed cached development behavior'
raw = read(ROOT / 'development-r1-audit.private.json')
no_answer = {'H07', 'H08', 'H09', 'H10', 'H11', 'H12', 'T19', 'T20', 'T21', 'T22', 'T23', 'T24'}
# Explicit review of every low-top1 addition. Other controls remain conservative:
# unresolved relevance is recorded and is never counted as a correct rescue.
review = {
    0: ('uncertain', 'Cargo discount approval does not establish markup price-rule behavior; selected body is largely cross-links.'),
    9: ('unrelated', 'Credit-limit/excess-amount block versus sent picking splitting and order-line changes.'),
    10: ('related_limited', 'Selected ticket 1196 discusses missing Dynamo invoice/filter results and parent tags; related filter history, not a verified current correction.'),
    11: ('related_limited', 'Operation Type addition checklist is relevant to the configuration request; current implementation remains unverified.'),
    14: ('related_limited', 'Approval validity for current commercial-terms version is relevant modeling context; no current execution proof.'),
    15: ('related_limited', 'Price/payment exception version and approval boundaries are relevant modeling context.'),
    17: ('related_limited', 'Received/unknown external WMS outcome and retry boundary are directly relevant; no default resend advice.'),
    19: ('related_limited', 'Virtual-to-virtual quantity and accounting-entry separation is directly relevant to missing 12280 context.'),
    20: ('related_limited', 'Original ticket 1708 reports Turbo beta expiry; TestFlight prerequisite and no retest limit retained.'),
    24: ('unrelated', 'Payment and reconciliation starts after bill posting; it does not support the current posting failure.'),
    25: ('uncertain', 'Knowledge mentions historical bill confirmation but selected primary is ticket 84 amount/currency discrepancy, not posting failure; no verified same symptom.'),
    27: ('unrelated', 'A stock.move object definition does not support an Expected singleton traceback diagnosis.'),
    28: ('unrelated', 'Employee/vehicle model does not explain the desktop Lark organization login issue.'),
    30: ('related_limited', 'Account identity versus granted scope is related login modeling context, not proof of restored organization access.'),
    31: ('related_limited', 'Contact and address-role separation is related recipient context; not a current mail-delivery trace.'),
    32: ('related_limited', 'Invoice delivery-channel evidence separation is related context; no assertion of actual recipient.'),
    33: ('unrelated', 'Backorder template missing field/500 differs from leaking service internal notes.'),
    34: ('related_limited', 'Portal support content exposure boundaries are relevant modeling context, not a tested fix.'),
    44: ('unrelated', 'Current Group Company feature schedule versus historical KPI/time-off/expense approval access issues.'),
    52: ('unrelated', 'Confirmation email rendered fee amount differs from inability to edit delivery charge fields.'),
    53: ('unrelated', 'Transaction-tax choice differs from Currency Rate display precision and upgrade persistence.'),
    54: ('uncertain', 'Journal Item broad controls do not establish four-decimal configuration or code persistence.'),
    55: ('unrelated', 'Business-party permission/batch configuration differs from pricelist rule-change logging and popup batching.'),
    56: ('unrelated', 'Markup applicability differs from rule-change logs and save-time popup behavior.'),
    57: ('uncertain', 'Historical mapping discussion includes archive only when unused; does not establish STOP SKU inventory prerequisites or schedule. Not counted as safe rescue.'),
    58: ('related_limited', 'Product active/archive/channel-state separation is relevant modeling context; no current deactivation schedule.'),
    59: ('unrelated', 'Default warehouse/location assignment differs from discontinued SKU deactivation.'),
    61: ('unrelated', 'Sales order amendment differs from fixed-asset original-value revaluation.'),
    62: ('uncertain', 'Receivable reconciliation modeling does not establish the cause of 20-second bank reconciliation latency.'),
    63: ('unrelated', 'Supplier payment workflow does not support the bank operation latency investigation.'),
    64: ('unrelated', 'Chassis/mapping and cannot-Done errors differ from address2/house-number payload loss.'),
    65: ('uncertain', 'General tax evidence does not establish the actual Destination Country field data source.'),
    66: ('unrelated', 'Fiscal Position/duplicate-contact tax-rate cases differ from Destination Country field sourcing.'),
    67: ('uncertain', 'UK variant taxable history cannot establish the CHF currency order tax computation; environment and actual amount must remain unverified.'),
    68: ('uncertain', 'Gross-profit modeling is broadly related but does not establish missing delivery charge SO attribution.'),
    69: ('related_limited', 'Warehouse/location identities are related modeling context for the requested relocation and first-return binding.'),
    70: ('related_limited', 'Warehouse/location configuration checklist is related context; not proof of new RTB routing implementation.'),
    71: ('unrelated', 'Historical leave export differs from historical approval failure/access issues.'),
    72: ('related_limited', 'Approval-node configuration FAQ is related, but no body/primary survived; not an evidence-backed rescue.'),
    81: ('uncertain', 'Journal Item definition is broad modeling context and does not explain this Review loading latency.'),
    82: ('related_limited', 'Slow-operation investigation evidence collection is relevant; neither shared root cause nor current fix is established.'),
}
audits = []
for i, r in enumerate(raw):
    e = r['fullEvidence']
    body = bool(e['content'].strip())
    primary = any(s['content'].strip() for s in e['sourceEvidence'])
    if r['knownGold']:
        relevance, reason = 'related_limited', 'Existing verified gold label rechecked against selected knowledge/source; historical and scope limitations remain.'
    elif r['id'] in no_answer:
        relevance, reason = 'unrelated', 'Frozen candidate-context no-answer label; selected text does not establish the current requested feature/status/schedule.'
    else:
        relevance, reason = review.get(i, ('uncertain', 'Control-only addition reviewed as broad or different-symptom context; insufficient support for the specific current request, not credited as correct.'))
    if i == 21:
        reason = 'EU historical daily invoice job is the existing boundary gold; no timezone/current UK-US cron proof. Only bounded historical comparison is supported.'
    if i == 83:
        reason = 'Ticket 718 original asks removal/deletion; support says Archive. Current permission, permanent deletion and signature-record handling remain unverified.'
    audits.append({'key': r['key'], 'id': r['id'], 'path': r['path'], 'knownGold': r['knownGold'],
                   'relevance': relevance, 'reason': reason, 'body': body, 'primary': primary,
                   'acceptable': relevance == 'related_limited' and body and (primary or e.get('knowledgeType') == 'ontology'),
                   'contentSha256': hashlib.sha256(e['content'].encode()).hexdigest(),
                   'sourcePaths': [s['path'] for s in e['sourceEvidence']], 'reviewRole': 'offline experiment audit only; never online filtering'})
write('development-audit.json', {'pairs': audits, 'total': len(audits), 'unresolvedControlsNotCredited': True})
by_key = {r['key']: r for r in audits}
normalized = read(OUT / 'development-r1.json')
# The first report used "gap" for observed lead, shadowing the configured gap.
# Recover the fixed loop's policy order; preserve both original reports verbatim.
policies = [{'strategy': 'A', 'floor': .4, 'gap': .2}, {'strategy': 'C', 'floor': .4, 'gap': .2}]
policies += [{'strategy': 'B', 'floor': f, 'gap': .2} for f in [.3, .4, .5]]
policies += [{'strategy': 'D', 'floor': f, 'gap': g} for f in [.3, .4, .5] for g in [.1, .2, .3]]
for r in normalized['details']:
    assert len(r['runs']) == len(policies)
    for run, policy in zip(r['runs'], policies):
        assert run['strategy'] == policy['strategy'] and run['floor'] == policy['floor']
        run['observedGap'] = run['gap']
        run['gap'] = policy['gap']
        for path in run['addedPaths']:
            original = next(a for a in raw if a['key'] == r['id'] + '|' + path)
            assert policy in original['policies'], 'Normalized policy does not match original independent audit index'
write('development-normalized.json', normalized)
write('report-normalization.json', {'reason': 'Separate observedGap from configured gap; no model input, score, policy computation or final evidence changed.', 'sourceSha256': sha(OUT / 'development-r1.json'), 'normalizedSha256': sha(OUT / 'development-normalized.json'), 'originalResultsPreserved': True})
details = normalized['details']
summaries = []
for policy in policies:
    run_for = lambda r: next(x for x in r['runs'] if all(x[k] == v for k, v in policy.items()))
    baseline_for = lambda r: next(x for x in r['runs'] if x['strategy'] == 'A')
    additions = [by_key[r['id'] + '|' + p] for r in details for p in run_for(r)['addedPaths']]
    lost = []
    for r in details:
        actual = {e['path']: e for e in run_for(r)['final']}
        for e in baseline_for(r)['final']:
            # Exact old final payload preservation, including empty-source cards.
            if actual.get(e['path']) != e:
                lost.append({'id': r['id'], 'path': e['path']})
    summaries.append({**policy, 'cases': len(details),
        'acceptedGold': sum(run_for(r)['acceptedGold'] for r in details),
        'finalGold': sum(run_for(r)['finalGold'] for r in details),
        'primaryGold': sum(run_for(r)['primaryGold'] for r in details),
        'newPairs': len(additions), 'newAcceptable': sum(a['acceptable'] for a in additions),
        'newUnrelated': [a['key'] for a in additions if a['relevance'] == 'unrelated'],
        'newUncertain': [a['key'] for a in additions if a['relevance'] == 'uncertain'],
        'newUnusable': [a['key'] for a in additions if not a['body'] or (not a['primary'] and not a['path'].startswith('docs/ontology/'))],
        'baselineFinalChanged': lost,
        'explicitWrongFinal': [r['id'] for r in details if run_for(r)['explicitWrongFinal']],
        'noAnswerFinal': [r['id'] for r in details if r['id'] in no_answer and run_for(r)['final']],
        'p2Recovered': run_for(next(r for r in details if r['id'] == 'E8-P2'))['primaryGold'],
        'qualifies': policy['strategy'] == 'D' and not lost and all(a['acceptable'] for a in additions)
                     and run_for(next(r for r in details if r['id'] == 'E8-P2'))['primaryGold']})
write('development-summary.json', {'summaries': summaries})
eligible = [r for r in summaries if r['qualifies']]
if not eligible:
    write('development-failed.json', {'decision': 'No candidate meets development gates', 'liveCalls': 0})
    raise SystemExit('No candidate meets development requirements; stop before live calls')
chosen = max(eligible, key=lambda r: (r['primaryGold'], r['newAcceptable'], r['floor'], r['gap']))
write('selection-lock.json', {'strategy': 'D', 'floor': chosen['floor'], 'gap': chosen['gap'],
    'selectionObjective': 'No erroneous/uncertain/unusable new context, baseline payload unchanged, P2 recovered; maximize primary gold then acceptable additions; conservative floor/gap tie-break.',
    'developmentSha256': sha(OUT / 'development-normalized.json'), 'auditSha256': sha(OUT / 'development-audit.json'),
    'summarySha256': sha(OUT / 'development-summary.json'), 'revisionSha256': sha(OUT / 'candidate-revision-1.json'),
    'stabilityCases': ['E8-P2', 'Q08', 'N04', 'Q26', 'H08', 'H09', 'N15', 'D03', 'D02', 'T18'],
    'holdoutSeen': False, 'liveCallsBeforeLock': 0, 'G': 'disabled'})
for r in summaries:
    print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in r.items() if k != 'cases'}, ensure_ascii=False))
print(json.dumps({'chosen': {'floor': chosen['floor'], 'gap': chosen['gap']}, 'liveCalls': 0}))
