"""Summarize actual-reader output without changing frozen labels or inputs."""
import csv
import gzip
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
name = sys.argv[2] if len(sys.argv) > 2 else 'verification-run.json'
path = root / name
if not path.exists():
    path = root / (name + '.gz')
    data = json.loads(gzip.decompress(path.read_bytes()))
else:
    data = json.loads(path.read_text())
cases = json.loads((root / 'cases.json').read_text())['cases']
rows = {(r['group'], r['id']): r for r in data['results']}
changes = {'gained_hits': [], 'lost_hits': [], 'lower_gold_ranks': [], 'remaining_misses': [], 'new_candidates_on_boundary_cases': []}
with (root / 'ranks.csv').open('w') as file:
    writer = csv.writer(file)
    writer.writerow(['id', 'split', 'help_type', 'expected_pages'] + [f'{g}_expected_ranks' for g in 'ABCD'] + ['D_conditional_mock_outcomes'])
    for c in cases:
        group_rows = [rows[g, c['id']] for g in 'ABCD']
        outcomes = {p['path']: p['conditionalMockConsumption']['outcome'] for p in group_rows[3]['candidates'] if p['conditionalMockConsumption']}
        writer.writerow([c['id'], c['split'], c['help_type'], json.dumps(c['expected_pages'], ensure_ascii=False)] + [json.dumps(r['expectedRanks'], ensure_ascii=False) for r in group_rows] + [json.dumps(outcomes, ensure_ascii=False)])
        a, d = group_rows[0], group_rows[3]
        if a['hit20'] is False and d['hit20'] is True:
            changes['gained_hits'].append(c['id'])
        if a['hit20'] is True and d['hit20'] is False:
            changes['lost_hits'].append(c['id'])
        if d['hit20'] is False:
            changes['remaining_misses'].append(c['id'])
        for p, rank in a['expectedRanks'].items():
            after = d['expectedRanks'][p]
            if rank is not None and after is not None and after > rank:
                changes['lower_gold_ranks'].append(dict(id=c['id'], path=p, before=rank, after=after))
        if not c['expected_pages']:
            original = {p['sourcePath'] for p in a['candidates']}
            for p in d['candidates']:
                if p['sourcePath'] not in original:
                    changes['new_candidates_on_boundary_cases'].append(dict(id=c['id'], rank=p['rank'], path=p['sourcePath'], matchedFields=p['matchedFields']))
(root / 'changes.json').write_text(json.dumps(changes, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: len(v) for k, v in changes.items()}, ensure_ascii=False))
