"""Read frozen v6 output; never changes questions, labels or model scores."""
import csv
import gzip
import json
import sys
from pathlib import Path
root = Path(sys.argv[1])
path = root / 'first-run.json'
data = json.loads(path.read_text()) if path.exists() else json.loads(gzip.decompress((root / 'first-run.json.gz').read_bytes()))
cases = json.loads((root / 'cases.json').read_text())['cases']
groups = ['reference', 'A', 'B', 'C', 'D']
rows = {(r['group'], r['id']): r for r in data['results']}
changes = {'lost_vs_A': [], 'gained_vs_A': [], 'wrong_pairs': [], 'consumption': {}, 'independent_primary': {}}
with (root / 'ranks.csv').open('w') as file:
    writer = csv.writer(file)
    writer.writerow(['id', 'split', 'help_type', 'expected_pages'] + [g + '_ranks' for g in groups] + ['D_eligibility', 'D_conditional_consumption'])
    for c in cases:
        records = [rows[g, c['id']] for g in groups]
        d = records[-1]
        consumption = {p['path']: p['conditionalMockConsumption'] for p in d['candidates'] if p['conditionalMockConsumption']}
        writer.writerow([c['id'], c['split'], c['help_type'], json.dumps(c['expected_pages'], ensure_ascii=False)] + [json.dumps(r['expectedRanks'], ensure_ascii=False) for r in records] + [json.dumps(d['expectedEligibility'], ensure_ascii=False), json.dumps(consumption, ensure_ascii=False)])
        if rows['A', c['id']]['hit20'] and not d['hit20']:
            changes['lost_vs_A'].append(c['id'])
        if rows['A', c['id']]['hit20'] is False and d['hit20']:
            changes['gained_vs_A'].append(c['id'])
        for path in c.get('wrong_pages', []):
            result = dict(id=c['id'], split=c['split'], path=path, boundary=c['boundary'])
            for g in groups:
                result[g] = next(w for w in rows[g, c['id']]['wrongPairResults'] if w['path'] == path)
            changes['wrong_pairs'].append(result)
for g in groups:
    counts = {}
    for r in data['results']:
        if r['group'] != g:
            continue
        for p in r['candidates']:
            if p['conditionalMockConsumption']:
                key = p['conditionalMockConsumption']['outcome']
                counts[key] = counts.get(key, 0) + 1
    changes['consumption'][g] = counts
    independent = [rows[g, c['id']] for c in cases if c['split'] == 'independent' and c['expected_pages']]
    changes['independent_primary'][g] = {
        'positive_total': len(independent),
        'knowledge_and_primary_retained': sum(any(p['conditionalMockConsumption'] and p['conditionalMockConsumption']['outcome'] == 'knowledge_and_primary_retained' for p in r['candidates']) for r in independent),
    }
(root / 'changes.json').write_text(json.dumps(changes, ensure_ascii=False, indent=2) + '\n')
(root / 'summary.json').write_text(json.dumps(data['summaries'], ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'lost_vs_A': changes['lost_vs_A'], 'gained_vs_A': changes['gained_vs_A'], 'independent_primary': changes['independent_primary']}, ensure_ascii=False))
