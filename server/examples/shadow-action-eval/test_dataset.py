"""Synthetic extraction checks; no customer data, models or platform access."""
import tempfile
from pathlib import Path
import unittest

import dataset


def transcript(messages, thread='thread-1', complete=True, ingested='2026-10-01', suffix=''):
    return f'''---
ingested: {ingested}
source_updated_at: "2026-10-01T00:00:00Z"
thread_id: {thread}
history_complete: {str(complete).lower()}
ticket_title: "LATER SOLUTION MUST NOT ENTER INPUT"
---
## Ticket 源字段
status: Finish
## 线程消息({len(messages)} 条,已脱敏 prepared_messages)
''' + '\n\n'.join(f'- **[{at}] 用户 {speaker}**(user): {text}' for at, speaker, text in messages) + '\n\n## Shadow AI\nFUTURE DIAGNOSIS\n' + suffix


class PreparationTests(unittest.TestCase):
    def test_inclusive_boundary_and_exclusion_of_later_fields(self):
        messages = [('2026-01-01T00:00:00Z', 1, 'Initial question'),
                    ('2026-01-01T00:10:00Z', 2, 'Boundary reply'),
                    ('2026-01-01T00:10:00.001Z', 2, 'FUTURE REPLY')]
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            (root / 'ticket-1.md').write_text(transcript(messages))
            rows, _ = dataset.extract(root)
        self.assertEqual(len(rows), 1)
        self.assertEqual([m['text'] for m in rows[0]['input']['messages']], ['Initial question', 'Boundary reply'])
        self.assertEqual(rows[0]['excluded_later_messages'], 1)
        self.assertNotIn('LATER SOLUTION', dataset.canonical(rows[0]['input']))
        self.assertNotIn('FUTURE', dataset.canonical(rows[0]['input']))

    def test_latest_incomplete_export_does_not_fall_back_to_old_complete(self):
        message = [('2026-01-01T00:00:00Z', 1, 'Question')]
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            (root / 'ticket-1.old.md').write_text(transcript(message, ingested='2026-09-01'))
            (root / 'ticket-1.md').write_text(transcript(message, complete=False))
            rows, profile = dataset.extract(root)
        self.assertEqual(rows, [])
        self.assertEqual(profile['excluded_tickets'], {'history_not_complete': 1})

    def test_duplicate_threads_do_not_become_independent_cases(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            (root / 'ticket-1.md').write_text(transcript([('2026-01-01T00:00:00Z', 1, 'A')]))
            (root / 'ticket-2.md').write_text(transcript([('2026-01-01T00:00:00Z', 1, 'B')]))
            rows, profile = dataset.extract(root)
        self.assertEqual(len(rows), 1)
        self.assertEqual(profile['excluded_tickets']['duplicate_thread_or_text'], 1)

    def test_count_mismatch_missing_time_and_nonchronological_are_rejected(self):
        base = transcript([('2026-01-01T00:00:00Z', 1, 'Question')])
        self.assertEqual(dataset.parse(base.replace('消息(1 条', '消息(2 条'))[1], 'message_count_mismatch')
        self.assertEqual(dataset.parse(base.replace('2026-01-01T00:00:00Z', 'unknown'))[1], 'invalid_timestamp')
        reversed_text = transcript([('2026-01-01T00:01:00Z', 1, 'Later'), ('2026-01-01T00:00:00Z', 2, 'Earlier')])
        self.assertEqual(dataset.parse(reversed_text)[1], 'nonchronological_messages')

    def test_heading_format_retains_attachment_and_maps_only_visible_parent(self):
        text = '''---
ingested: 2026-10-01
thread_id: thread
history_complete: true
---
## 线程消息（2条）
### 2026-01-01T00:00:00Z 用户 1
- message_id: source1
- has_artifact: true

Only attachment summary
### 2026-01-01T00:01:00Z 用户 2
- message_id: source2
- reply_to: source1
- has_artifact: false

Reply
'''
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            (root / 'ticket-1.md').write_text(text)
            rows, _ = dataset.extract(root)
        first, second = rows[0]['input']['messages']
        self.assertTrue(first['attachments_unavailable'])
        self.assertEqual(second['reply_to'], 'M1')
        self.assertNotIn('source1', dataset.canonical(rows[0]['input']))

    def test_mention_redaction_preserves_following_region_and_document_prefix(self):
        self.assertEqual(dataset.redact('@Alice Smith EU Odoo'), '@Alice Smith EU Odoo')
        self.assertEqual(dataset.redact('@Alice Smith INV/2026/1'), '@Alice Smith INV/2026/1')
        self.assertEqual(dataset.redact('@Alice Done'), '@Alice Done')
        self.assertIn('[电话已隐去]', dataset.redact('Mobile: +49 151 12345678'))


if __name__ == '__main__':
    unittest.main()
