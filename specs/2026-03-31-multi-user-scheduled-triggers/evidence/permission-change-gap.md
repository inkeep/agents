---
name: Permission Change Propagation Gap
description: No cleanup happens when a user loses project access — only on full org removal. Critical for multi-user trigger design.
type: evidence
---

## Current Cleanup Flow

**User removed from org** (`auth.ts` beforeRemoveMember hook):
1. `cleanupUserTriggers()` runs — deletes ALL triggers where runAsUserId = user
2. `revokeAllUserRelationships()` runs — removes all SpiceDB relationships
3. FK CASCADE on `scheduled_triggers.runAsUserId → user.id` also fires

**User removed from project** (`projectMembers.ts` DELETE endpoint):
1. `revokeProjectAccess()` called on SpiceDB — removes relationship
2. **NO trigger cleanup happens**
3. Triggers with `runAsUserId = removed user` still exist and will fail at next execution
4. Current behavior: execution-time check `canUseProjectStrict()` catches this and fails the invocation

## Gap

There is NO existing pattern for "cascade cleanup when permission changes." The system only handles:
- Full user deletion (FK CASCADE + explicit cleanup)
- Full org removal (beforeRemoveMember hook)
- Resource deletion (cascade-delete utilities)

SpiceDB has no event/webhook system — you can't subscribe to permission changes.

## Where to Hook Cleanup

The project member removal route (`projectMembers.ts:243-254`) calls `revokeProjectAccess()` directly. This is where cleanup logic should be added:

```
DELETE /projects/{projectId}/members/{userId}
  → revokeProjectAccess() (existing)
  → removeUserFromScheduledTriggers() (NEW)
```

Similarly, `changeProjectRole()` might need a hook if role downgrade removes 'use' permission.
