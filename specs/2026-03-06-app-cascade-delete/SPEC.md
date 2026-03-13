# SPEC: App Entity Cascade Delete on Agent/Project Deletion

## Status: APPROVED
## Date: 2026-03-06
## Author: Co-authored (human + AI)

---

## 1. Problem Statement

The `apps` table in the runtime database has three cross-DB foreign key references to manage DB entities (`projectId`, `defaultProjectId`, `defaultAgentId`). When an agent or project is deleted from the manage DB, the apps table is not cleaned up, leaving stale/orphaned references. Other runtime entities (Slack workspaces, channel configs, API keys) already handle this via `cascade-delete.ts` — apps needs the same treatment.

## 2. Scope

**In scope:**
- Nulling out `defaultAgentId` on apps when the referenced agent is deleted
- Nulling out `defaultProjectId` on apps when the referenced project is deleted
- Deleting apps entirely when their owning project (`projectId`) is deleted
- Unit tests for the new cleanup functions
- Wiring into existing `cascadeDeleteByAgent()` and `cascadeDeleteByProject()`

**Out of scope:**
- UI changes (no new surfaces)
- API route changes (existing delete endpoints are unchanged)
- Schema migrations (no column changes)
- Future many-to-many app-to-project/agent relationships

## 3. Design

### 3.1 Behavior Rules

| Event | Column Matched | Action |
|---|---|---|
| Project deleted | `projectId` | **Delete** the app entirely |
| Project deleted | `defaultProjectId` | **Null out** `defaultProjectId` (and null `defaultAgentId` if it belonged to that project) |
| Agent deleted | `defaultAgentId` | **Null out** `defaultAgentId` |

### 3.2 Implementation

Follow the established pattern from `clearWorkspaceDefaultsByAgent` / `clearWorkspaceDefaultsByProject` in `workAppSlack.ts`.

#### New functions in `packages/agents-core/src/data-access/runtime/apps.ts`:

```typescript
/** Delete apps owned by a project (projectId match). */
export const deleteAppsByProject =
  (db: AgentsRunDatabaseClient) =>
  async (tenantId: string, projectId: string): Promise<number> => {
    const result = await db
      .delete(apps)
      .where(
        and(
          eq(apps.tenantId, tenantId),
          eq(apps.projectId, projectId)
        )
      )
      .returning();
    return result.length;
  };

/** Null out defaultProjectId (and defaultAgentId) on apps referencing a deleted project. */
export const clearAppDefaultsByProject =
  (db: AgentsRunDatabaseClient) =>
  async (tenantId: string, projectId: string): Promise<number> => {
    const result = await db
      .update(apps)
      .set({
        defaultProjectId: null,
        defaultAgentId: null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(apps.tenantId, tenantId),
          eq(apps.defaultProjectId, projectId)
        )
      )
      .returning();
    return result.length;
  };

/** Null out defaultAgentId on apps referencing a deleted agent. */
export const clearAppDefaultsByAgent =
  (db: AgentsRunDatabaseClient) =>
  async (tenantId: string, agentId: string): Promise<number> => {
    const result = await db
      .update(apps)
      .set({
        defaultAgentId: null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(apps.tenantId, tenantId),
          eq(apps.defaultAgentId, agentId)
        )
      )
      .returning();
    return result.length;
  };
```

#### Wiring into `cascade-delete.ts`:

- `cascadeDeleteByProject()`: Call `deleteAppsByProject()` first (deletes owned apps), then `clearAppDefaultsByProject()` (nulls defaults on remaining apps).
- `cascadeDeleteByAgent()`: Call `clearAppDefaultsByAgent()`.
- Update `CascadeDeleteResult` type to include `appsDeleted` and `appDefaultsCleared` counts.

### 3.3 Ordering

In `cascadeDeleteByProject()`:
1. `deleteAppsByProject()` — removes apps owned by the project
2. `clearAppDefaultsByProject()` — clears defaults on apps owned by other projects

This order matters: step 1 removes rows that step 2 would otherwise unnecessarily update.

### 3.4 `clearAppDefaultsByProject` nulls both `defaultProjectId` and `defaultAgentId`

When a project is deleted, any `defaultAgentId` on the affected apps is also stale (agents cascade-delete with their project in the manage DB). Nulling both in one UPDATE avoids a second pass.

## 4. Decision Log

| # | Decision | Type | Reversibility |
|---|---|---|---|
| D1 | Apps with matching `projectId` are **deleted** on project deletion | Product | Reversible (could change to null-out later) |
| D2 | Apps with matching `defaultProjectId` get both `defaultProjectId` and `defaultAgentId` nulled | Technical | Reversible |
| D3 | Apps with matching `defaultAgentId` get only `defaultAgentId` nulled | Technical | Reversible |
| D4 | Follow existing pattern (functions in data-access, wired via cascade-delete.ts) | Technical | Reversible |

## 5. Files to Modify

| File | Change |
|---|---|
| `packages/agents-core/src/data-access/runtime/apps.ts` | Add `deleteAppsByProject`, `clearAppDefaultsByProject`, `clearAppDefaultsByAgent` |
| `packages/agents-core/src/data-access/runtime/cascade-delete.ts` | Import new functions, call in `cascadeDeleteByAgent` and `cascadeDeleteByProject`, update result type |
| `packages/agents-core/src/data-access/__tests__/apps.test.ts` | Add tests for the three new functions |

## 6. Test Plan

1. **deleteAppsByProject**: Create apps with `projectId=P1`, delete by project, verify apps are gone
2. **clearAppDefaultsByProject**: Create apps with `defaultProjectId=P1`, clear by project, verify `defaultProjectId` and `defaultAgentId` are null, other fields untouched
3. **clearAppDefaultsByAgent**: Create apps with `defaultAgentId=A1`, clear by agent, verify `defaultAgentId` is null, `defaultProjectId` untouched
4. **Ordering**: Create app with `projectId=P1` AND `defaultProjectId=P1`, delete by project, verify app is deleted (not just updated)
5. **No false positives**: Verify apps with non-matching IDs are unaffected

## 7. Risks

| Risk | Mitigation |
|---|---|
| Existing orphaned apps in production | Low impact — stale defaults just mean the app would fail to route to a default agent/project, which is already the case with a deleted entity. Can run a one-time cleanup query if needed. |
| Performance on large app tables | App count per tenant is small. No index needed beyond the existing `apps_tenant_project_idx`. |

## 8. Phase Plan

**Single phase** — this is a small, well-scoped addition following an established pattern. No phasing needed.

## 9. Assumptions

| Assumption | Confidence | Verification |
|---|---|---|
| Agents always cascade-delete with their project in the manage DB | HIGH | Verified: `agent_project_fk` has `.onDelete('cascade')` in manage schema |
| App count per tenant is small (< 1000) | HIGH | Apps are manually configured integrations |
| No other runtime tables reference apps | HIGH | Verified: no FK references to apps table |
