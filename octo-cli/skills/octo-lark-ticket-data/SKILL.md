---
name: octo-lark-ticket-data
description: Read the current synchronized Lark Ticket projection through octo-cli. Use for Octo ticket context, not Lark ticket updates or direct Lark API calls.
---

# Octo Lark Ticket Data

Before querying, read `octo-cli skills read octo-shared` for setup, Profile, diagnostics, and error-handling rules.

Read an Octo-synchronized Lark Ticket:

```bash
octo-cli lark ticket --base-id <base-id> --table-id <table-id> --record-id <record-id>
```

Distinguish the returned Octo snapshot timestamp from live Lark state. A missing snapshot or unavailable field should be reported as an Octo data limitation, not treated as evidence that the underlying Lark record is empty or deleted.
