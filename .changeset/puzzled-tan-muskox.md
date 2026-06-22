---
"@inkeep/agents-core": minor
"@inkeep/agents-api": minor
---

Security: scope the user-providers lookup to an organization, fixing a cross-tenant IDOR in POST /manage/api/users/providers. getUserProvidersFromDb now requires an organizationId and returns providers only for members of that org, so an org admin can no longer enumerate auth providers of users in other orgs.
