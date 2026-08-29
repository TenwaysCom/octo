---
name: octo-github-pr-data
description: Read a synchronized GitHub pull request and its linked Meegle work items through octo-cli. Use for Octo PR context, not GitHub writes or direct GitHub API calls.
---

# Octo GitHub PR Data

Before querying, read `octo-cli skills read octo-shared` for setup, Profile, diagnostics, and error-handling rules.

Query the synchronized PR projection:

```bash
octo-cli github pr --owner <owner> --repo <repo> --number <number>
```

Use returned Meegle links and snapshot timestamps as Octo's current projection. If no PR snapshot is found, say that the Octo snapshot is absent; do not infer that the GitHub PR or its Meegle relationship does not exist.
