---
"@inkeep/agents-core": minor
"@inkeep/agents-api": minor
"@inkeep/agents-manage-ui": minor
"@inkeep/agents-work-apps": minor
---

Upgrade Better Auth to 1.7.16 for the 2026-11-03 security release; this requires zod `^4.6.7` and the runtime database migration, which adds the new OAuth provider tables and columns, rekeys Microsoft accounts to the Entra `oid` claim, and removes sign-in links left behind by deleted SSO providers (GHSA-prpr-5gj3-qqhg). Before upgrading, set each SSO provider's `issuer` column and `oidc_config.issuer` in the database to exactly the `issuer` in its discovery document, since sign-in now verifies it and issuer edits are refused once users have signed in, and note that a first SSO sign-in no longer links to an existing account with the same email.
