---
name: Existing Join Table and Sub-Resource Patterns
description: How join tables, sub-resource endpoints, and set/replace semantics work in the current codebase
type: evidence
---

## Join Table Patterns

All join tables in the codebase follow this pattern:
- `projectScoped` or `agentScoped` columns (tenantId, projectId, etc.)
- Composite primary key including scope + id
- FK references with CASCADE delete
- `createdAt`, `updatedAt` timestamps
- Dedicated data access functions: list, create, delete (single + by parent)

Examples:
- `evaluationSuiteConfigEvaluatorRelations` (manage-schema.ts:837-865)
- `datasetRunConfigAgentRelations` (manage-schema.ts:1315-1336)
- `subAgentToolRelations`, `subAgentExternalAgentRelations` (manage-schema.ts:527-607)

## Sub-Resource Endpoint Patterns

**Evaluation suite config evaluator relations** (canonical pattern):
- `GET /{configId}/evaluators` — list
- `POST /{configId}/evaluators/{evaluatorId}` — add
- `DELETE /{configId}/evaluators/{evaluatorId}` — remove

**Project GitHub access** (set/replace pattern):
- `PUT /projects/{projectId}/github-access` — set/replace entire collection
- Implementation: delete all + insert new (transactional)
- Uses `openapiRegisterPutPatchRoutesForLegacy()` for PUT/PATCH dual registration

## Project Membership

- Managed via SpiceDB relationships, NOT a SQL join table
- Routes in `projectMembers.ts`: add/update/remove via SpiceDB
- No event system or hooks when project permissions change
- Only org-level member removal (`beforeRemoveMember`) triggers cleanup

## Key Patterns for New Join Table

The `scheduled_trigger_users` table should follow:
1. Use `tenantScoped` (tenantId) since triggers are tenant-scoped
2. Composite PK: `(tenantId, scheduledTriggerId, userId)`
3. FK to `user.id` with CASCADE delete
4. Sub-resource endpoints: GET (list), POST (add), DELETE (remove), PUT (set/replace)
5. Data access: standard list/create/delete functions using scope helpers
