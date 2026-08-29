---
name: octo-odoo-devops-data
description: Read Odoo EU, UK, or US branch and build status through octo-cli. Use for synchronized Odoo DevOps context, not for direct Odoo ORM, SQL, Odoo.sh, or configuration changes.
---

# Octo Odoo DevOps Data

Before querying, read `octo-cli skills read octo-shared` for setup, Profile, diagnostics, and error-handling rules.

Read the Octo server's Odoo DevOps projection:

```bash
octo-cli odoo branches --environment <eu|uk|us>
```

This is a read-only Octo response. It can include cached data and represents branch/build state, not a real-time Odoo database query. Report `fetchedAt` and `cached` when present. Do not retry with Odoo.sh, XML-RPC, JSON-RPC, raw SQL, or browser session cookies.

The EU, UK, and US readonly PostgreSQL databases are server-only sources. Do not expose their URLs, credentials, generic Odoo ORM, SQL, or table browsing. For business data such as orders, inventory, invoices, or partners, require a separately approved, server-owned named report API. Never use an arbitrary model/domain or SQL query through this skill.
