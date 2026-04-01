---
title: SpiceDB Schema and Anonymous User Analysis
description: Current SpiceDB authorization model and analysis of whether/how anonymous end-users can be represented as principals.
created: 2026-03-02
last-updated: 2026-03-02
---

## Current SpiceDB Schema

**File:** `packages/agents-core/spicedb/schema.zed`

### Principal Types
- `user` — the only subject type. Represents authenticated human users of the manage/admin interface.

### Resource Types
- `organization` — tenant boundary. Relations: owner, admin, member.
- `project` — workload container. Relations: project_admin, project_member, project_viewer.

### Permission Model
- Organization: `view` (all roles), `manage` (owner + admin)
- Project: `view` (org→manage + all project roles), `use` (org→manage + admin + member), `edit` (org→manage + admin)

### Future Extensibility (noted in schema comments)
- Groups: `| group#member`
- Service Accounts: `| service_account`
- Custom Roles: `relation custom_role: role`

**Confidence:** CONFIRMED (read from source)

## Can Anonymous Users Be a SpiceDB Principal?

### Option A: Add `anonymous_user` definition type
```spicedb
definition anonymous_user {}

definition project {
    relation app_credential: app_credential
    // ...
}

definition app_credential {
    relation project: project
    permission invoke = project->use  // or a new permission
}
```

**Pro:** Clean separation from authenticated users. No risk of anonymous users accidentally gaining admin permissions.
**Con:** Adds complexity to the schema. Anonymous users don't need fine-grained project permissions — the app credential itself is the authorization boundary.

### Option B: Use `user:anon_<uuid>` with existing `user` type
**Pro:** No schema changes.
**Con:** Dangerous — anonymous UUIDs would need explicit SpiceDB relations to do anything, but they'd share the `user` type with admin users. Accidental grants could be catastrophic. NOT RECOMMENDED.

### Option C: Don't put anonymous users in SpiceDB at all
The authorization question for an anonymous end-user is: "does this app credential allow anonymous access, and does it grant access to this agent?" That's a configuration check on the app credential itself, not a SpiceDB permission check.

SpiceDB is for multi-tenant access control (which users can see which projects). End-user access via app credentials is a different authorization domain.

**Pro:** Simplest. SpiceDB remains focused on admin/member access control. App credential config handles end-user authorization.
**Con:** Two authorization systems to reason about.

### Option D: Model app credentials as SpiceDB resources (without anonymous users as principals)
```spicedb
definition app_credential {
    relation project: project
    relation allowed_agent: agent  // if agent becomes a SpiceDB resource
}
```

This would let SpiceDB answer "which agents can this app credential access?" but doesn't help with "can this anonymous user chat?" — that's still a config check.

**Analysis:** Option C is likely the right choice for v1. The app credential's own configuration (which agents, which domains, anonymous allowed?) is the authorization check for end-users. SpiceDB remains the admin-facing authorization system. These are orthogonal concerns.

**Confidence:** INFERRED (based on SpiceDB documentation patterns and current schema design)

## Current Permission Bypass Patterns

**File:** `agents-api/src/middleware/projectAccess.ts`

The middleware already bypasses SpiceDB checks for:
- System users (`userId === "system"`)
- API key users (`userId.startsWith("apikey:")`) — ALL API key auth skips project access checks
- Org admins/owners (via `tenantRole`)
- Test environment

This means today's API keys effectively bypass SpiceDB entirely. The authorization is: "is this a valid API key for this project?" — validated by the key hash, not by SpiceDB.

**Confidence:** CONFIRMED (read from source — `agents-api/src/middleware/projectAccess.ts`)
