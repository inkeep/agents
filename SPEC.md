# SPEC: Organization Members Page

## Problem Statement

Organization members management is currently buried inside the Settings page (`/[tenantId]/settings`), making it feel like an afterthought. The goal is to make member management a first-class experience that **encourages** admins to add users. Additionally, there is no way to remove members from an organization through the UI, despite the backend infrastructure being fully wired up.

## Goals

1. **Elevate Members to a top-level page** — Move the members table out of Settings into its own page with a dedicated sidebar navigation item below Settings.
2. **Make adding members feel easy** — Replace the current "Add button → full modal" flow with an inline email input bar that makes inviting users feel lightweight. The modal appears only after clicking Add, pre-populated with the entered emails and showing role/auth method options.
3. **Enable member removal** — Add the ability for admins to remove members from the organization with a confirmation dialog, including cleanup of project-level memberships.
4. **Simplify Settings** — The Settings page retains only organization info (name, ID).

## Non-Goals

- Changing how the invite/accept flow works on the backend (Better Auth handles this)
- Adding new org settings to the Settings page
- Changing the project-level members page
- User account deletion (only org membership removal)

## Requirements

### R1: New Members Page Route

- Create `/[tenantId]/members` page route
- Add "Members" item to the sidebar Organization section, below Settings, using the `Users` icon
- Page renders when no project is selected (organization-level navigation)

### R2: Email Input Bar (Inline Add)

- At the top of the Members page, render an inline email input bar (visually similar to the project members search bar)
- Admin types an email and presses Enter or comma to add it as a chip/badge
- Multiple email chips can be accumulated before clicking "Add"
- Each chip has an X button to remove it
- Clicking "Add" opens the existing InviteMemberDialog, pre-populated with the entered emails
- Only visible to org admins
- The input bar should have a `UserPlus` icon and placeholder text like "Invite by email..."

### R3: Members Table (Moved from Settings)

- Reuse the existing `MembersTable` component on the new page
- Remove the `MembersTable` from the Settings page
- The "Add" button currently in the MembersTable header should be removed (replaced by the inline email bar above the table)

### R4: Remove Member from Organization

- Add a "Remove from organization" option in the actions dropdown menu (MoreVertical) for each member row
- Only visible to org admins, not for the current user or owners
- Clicking triggers a confirmation dialog: "Remove [name] from [org]? This will revoke their organization membership and all project access."
- On confirm, call `authClient.organization.removeMember({ memberIdOrEmail, organizationId })`
- Show success/error toast

### R4a: SpiceDB Cleanup on Member Removal (Backend Fix)

**Current bug:** The `afterRemoveMember` hook in `auth.ts` only removes the org-level SpiceDB relationship (e.g., `organization#member`). It does NOT revoke project-level memberships (`project#project_admin`, `project#project_member`, `project#project_viewer`). This means a removed user retains orphaned project access in SpiceDB.

**Fix:** Update the `afterRemoveMember` hook in `packages/agents-core/src/auth/auth.ts` to also call `revokeAllProjectMemberships()` after removing the org relationship. This function already exists (used during role promotions) and efficiently bulk-deletes all 3 project role types in parallel.

```typescript
afterRemoveMember: async ({ member, organization: org }) => {
  try {
    const { syncOrgMemberToSpiceDb, revokeAllProjectMemberships } = await import('./authz/sync');
    // Remove org-level relationship
    await syncOrgMemberToSpiceDb({
      tenantId: org.id,
      userId: member.userId,
      role: member.role as OrgRole,
      action: 'remove',
    });
    // Also revoke all project memberships (prevents orphaned access)
    await revokeAllProjectMemberships({
      tenantId: org.id,
      userId: member.userId,
    });
  } catch (error) {
    console.error('SpiceDB sync failed for member removal:', error);
  }
}
```

**No SpiceDB schema changes needed** — the schema already defines the correct relationships. This is purely a hook logic fix.

### R5: Settings Page Simplification

- Remove the `MembersTable` import and rendering from the Settings page
- Settings page shows only: Organization name (copyable) and Organization ID (copyable)

## Technical Design

### File Changes

| File | Change |
|---|---|
| `agents-manage-ui/src/app/[tenantId]/members/page.tsx` | **New** — Members page |
| `agents-manage-ui/src/app/[tenantId]/members/loading.tsx` | **New** — Loading skeleton |
| `agents-manage-ui/src/components/sidebar-nav/app-sidebar.tsx` | Add Members nav item to `orgNavItems` |
| `agents-manage-ui/src/constants/theme.ts` | No change needed — `members` label already exists |
| `agents-manage-ui/src/app/[tenantId]/settings/page.tsx` | Remove MembersTable, keep only org info |
| `agents-manage-ui/src/components/settings/members-table.tsx` | Add "Remove" action, accept optional `initialEmails` to control invite dialog |
| `agents-manage-ui/src/components/settings/invite-member-dialog.tsx` | Accept optional `initialEmails` prop to pre-populate the email textarea |
| `agents-manage-ui/src/components/settings/remove-member-dialog.tsx` | **New** — Confirmation dialog for member removal |
| `packages/agents-core/src/auth/auth.ts` | **Fix** — Update `afterRemoveMember` hook to also call `revokeAllProjectMemberships()` |

### Navigation Change

```
Organization (sidebar section, no project selected):
  Settings    ← existing
  Members     ← NEW (Users icon)
```

### Email Input Bar Behavior

```
┌─────────────────────────────────────────────────────────────┐
│ 👤+ │ alice@co.com ✕ │ bob@co.com ✕ │ Invite by email... │ [Add] │
└─────────────────────────────────────────────────────────────┘
```

- Enter/comma/tab = commit current text as email chip
- Paste = split by comma/newline, create chips for each
- Backspace on empty input = remove last chip
- "Add" button → opens InviteMemberDialog pre-populated with emails

### Member Removal Flow

1. Admin clicks MoreVertical → "Remove from organization"
2. Confirmation dialog appears with member name and warning about access revocation
3. On confirm:
   a. Call `authClient.organization.removeMember()`
   b. Better Auth's `afterRemoveMember` hook fires and:
      - Removes org-level SpiceDB relationship (`organization#member/admin`)
      - Revokes ALL project-level SpiceDB relationships (`project#project_admin/member/viewer`) via `revokeAllProjectMemberships()`
4. Refresh the members list
5. Show toast

### SpiceDB Relationships Affected by Member Removal

No schema changes needed. The existing schema in `packages/agents-core/spicedb/schema.zed` already defines the correct relationships. The fix is in the hook logic only.

| Relationship | Removed by |
|---|---|
| `organization#member user:X` (or `#admin`) | `syncOrgMemberToSpiceDb(action: 'remove')` — already exists |
| `project#project_admin user:X` | `revokeAllProjectMemberships()` — **NEW: added to afterRemoveMember** |
| `project#project_member user:X` | `revokeAllProjectMemberships()` — **NEW: added to afterRemoveMember** |
| `project#project_viewer user:X` | `revokeAllProjectMemberships()` — **NEW: added to afterRemoveMember** |

### Authorization Rules

- Only org admins/owners can see the email input bar and the "Remove" action
- Admins cannot remove owners
- Users cannot remove themselves
- Same rules as existing role change permissions (`canEditMember` logic)

## Test Cases

### TC1: Members page renders with all members
- Navigate to `/[tenantId]/members`
- Verify members table renders with correct data
- Verify pending invitations appear

### TC2: Email input bar creates chips
- Type an email and press Enter → chip appears
- Type another email with comma → chip appears
- Click X on a chip → chip removed
- Click Add → InviteMemberDialog opens with emails pre-populated

### TC3: Email validation in input bar
- Type invalid text (no @ symbol) and press Enter → no chip created or error shown
- Paste multiple comma-separated emails → all valid ones become chips

### TC4: Remove member confirmation and execution
- Click MoreVertical → "Remove from organization" on a member row
- Confirmation dialog appears with member name
- Click Cancel → dialog closes, no action
- Click Remove → member is removed, toast shows, list refreshes

### TC5: Remove member not shown for self or owners
- Current user's row has no "Remove" option
- Owner rows have no "Remove" option (when current user is admin, not owner)

### TC6: SpiceDB cleanup on member removal
- When a member is removed from the org, the `afterRemoveMember` hook should:
  - Remove the org-level SpiceDB relationship
  - Revoke all project-level SpiceDB relationships (project_admin, project_member, project_viewer)
- Verify `revokeAllProjectMemberships()` is called with the correct tenantId and userId

### TC7: Settings page shows only org info
- Navigate to `/[tenantId]/settings`
- Only org name and ID are displayed
- No members table visible

### TC8: Sidebar shows Members below Settings
- When no project selected, sidebar shows Settings and Members under Organization
- Members links to `/[tenantId]/members`

## Acceptance Criteria

- [ ] Members page at `/[tenantId]/members` renders the members table with pending invitations
- [ ] Sidebar shows "Members" item below "Settings" in the Organization section
- [ ] Email input bar allows typing emails that appear as chips
- [ ] Clicking "Add" with email chips opens the invite dialog pre-populated
- [ ] Org admins can remove members (not self, not owners) via confirmation dialog
- [ ] Removed members lose both org and project access (SpiceDB cleanup in `afterRemoveMember` hook)
- [ ] Settings page shows only org name and ID (no members table)
- [ ] All existing members table functionality preserved (role change, project access, password reset)
