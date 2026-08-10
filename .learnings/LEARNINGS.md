# Learnings

Record concise, reusable lessons here. Include the context, the durable rule, and the verified outcome; never include secrets or raw credentials.

## [LRN-20260810-001] external-read-proxy-boundary

- **Context:** Octo proxies Odoo DevOps branch status with a server-held external credential.
- **Rule:** Authenticate callers with Octo's opaque Web Session, accept only allowlisted request parameters, and keep external credentials in deployment configuration. Never accept an external Cookie from a request or expose it in responses/logs.
- **Verified outcome:** The branch proxy validates `eu|uk|us`, returns only normalized branch status fields, and caches each environment snapshot independently.

## [LRN-20260810-002] shared-api-redis-cache

- **Context:** The Odoo DevOps branch endpoint was the first Redis-cached API, but Redis will serve future API responses too.
- **Rule:** Create one shared Redis cache at the server HTTP/API layer from `REDIS_URL`; feature services own only a versioned key namespace and TTL.
- **Verified outcome:** The Odoo DevOps service uses the shared cache with a per-environment key and a 600-second TTL.

## [LRN-20260810-003] linked-pr-odoo-build-projection

- **Context:** Meegle linked PR snapshots need Odoo.sh build feedback without exposing the Odoo DevOps credential to the browser.
- **Rule:** Select one Odoo.sh environment before matching: Meegle uses its `system` (`Odoo`/`Odoo EU` → EU, `Odoo UK` → UK, `Odoo US` → US), while GitHub uses its repository name (`Tenways` → EU, `tenways-ukk` → UK, `odoo_tenways` → US). Then match only `GitHub PR headRef === Odoo.sh branch`; unknown or ambiguous mappings show no dot. A failed environment lookup must not fail either list.
- **Verified outcome:** Exact matches return build results in both Meegle linked-PR and GitHub PR lists; UK workitems and `tenways-ukk` PRs request/display only UK, while a similarly named branch, an unknown mapping, or an unavailable environment does not produce a false status or fail the list.
