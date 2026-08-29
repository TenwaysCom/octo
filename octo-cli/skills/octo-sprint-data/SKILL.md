---
name: octo-sprint-data
description: Read synchronized Sprint burn-down and work-item task status through octo-cli. Use for Octo Sprint progress questions, not live Meegle writes or direct Meegle API calls.
---

# Octo Sprint Data

Before querying, read `octo-cli skills read octo-shared` for setup, Profile, diagnostics, and error-handling rules.

Use Octo's synchronized Sprint projection:

```bash
octo-cli sprint burndown --project-key <project-key> --sprint-id <sprint-id>
octo-cli sprint tasks --project-key <project-key> --sprint-id <sprint-id>
```

Report snapshot timestamps, membership-source labels, and whether Sprint history is inferred or observed when the response includes them. A missing or incomplete Octo snapshot is not proof that Meegle lacks the work item. Do not direct-call Meegle to compensate.
