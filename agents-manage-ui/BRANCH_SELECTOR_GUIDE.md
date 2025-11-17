# Branch Selector Implementation Guide

## Overview

The branch selector allows users to switch between different branches of their project data in the agents-manage-ui. This enables version control workflows where users can:

- View different branches of their project
- Create new branches
- Work on changes independently
- View read-only snapshots via tags or commits

## Components Created

### 1. API Layer (`/src/lib/api/branches.ts`)

Provides functions to interact with the branches API:

```typescript
- fetchBranches(tenantId, projectId) - List all branches
- fetchBranch(tenantId, projectId, branchName) - Get specific branch
- createBranch(tenantId, projectId, data) - Create new branch
- deleteBranch(tenantId, projectId, branchName) - Delete branch
```

### 2. Branch Selector Component (`/src/components/branches/branch-selector.tsx`)

A dropdown component that:
- Displays available branches
- Shows the current branch
- Allows switching between branches
- Has an option to create a new branch
- Automatically appears in the header when viewing a project

### 3. New Branch Dialog (`/src/components/branches/new-branch-dialog.tsx`)

A modal dialog for creating new branches with:
- Branch name input with validation
- Option to select source branch
- Automatic switch to newly created branch

### 4. API Config Updates (`/src/lib/api/api-config.ts`)

Extended the API client to support query parameters:

```typescript
export interface ApiRequestOptions extends RequestInit {
  queryParams?: Record<string, string | number | boolean | undefined>;
}
```

### 5. Hooks (`/src/hooks/use-current-ref.ts`)

Provides utilities for working with the current ref:

```typescript
- useCurrentRef() - Get current ref from URL
- useRefOptions() - Get API request options with ref included
```

## How It Works

### URL-Based Branch State

The current branch is stored in the URL as a query parameter:

```
/tenant123/projects/proj456/agents?ref=feature/my-branch
```

This provides:
- ✅ Shareable URLs
- ✅ Bookmarkable states
- ✅ Browser back/forward support
- ✅ Persistence across page refreshes

### API Middleware Integration

The backend `refMiddleware` automatically:

1. Reads the `ref` query parameter from API requests
2. Resolves it to a branch/tag/commit
3. Checks out that ref in the database client
4. Defaults to `{tenantId}_main` if no ref is specified

### Branch Naming Convention

- **Main branch for tenant**: `{tenantId}_main`
- **Project branches**: `{tenantId}_{projectId}_{branchName}`
- **Feature branches**: Can use any naming like `feature/my-feature`, `bugfix/issue-123`

## Usage Example

### For API Calls (Server Components)

When making API calls that should respect the current branch, pass the ref as a query parameter:

```typescript
// pages/[tenantId]/projects/[projectId]/agents/page.tsx
import { makeManagementApiRequest } from '@/lib/api/api-config';

async function AgentsPage({ params, searchParams }: PageProps) {
  const { tenantId, projectId } = await params;
  const ref = searchParams.ref;

  const agents = await makeManagementApiRequest('/agents', {
    queryParams: { ref },
  });

  return <AgentList agents={agents} />;
}
```

### For API Calls (Client Components)

Use the `useRefOptions` hook:

```typescript
'use client';

import { useRefOptions } from '@/hooks/use-current-ref';
import { fetchAgents } from '@/lib/api/agents';

function AgentsList({ tenantId, projectId }: Props) {
  const refOptions = useRefOptions();
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    async function loadAgents() {
      const response = await fetchAgents(
        tenantId,
        projectId,
        refOptions
      );
      setAgents(response.data);
    }
    loadAgents();
  }, [tenantId, projectId, refOptions]);

  return <div>{/* Render agents */}</div>;
}
```

### Updating Existing API Functions

Update API functions to accept and forward the ref parameter:

```typescript
// Before
export async function fetchAgents(
  tenantId: string,
  projectId: string
): Promise<ListResponse<Agent>> {
  return makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/agents`
  );
}

// After
export async function fetchAgents(
  tenantId: string,
  projectId: string,
  options?: ApiRequestOptions
): Promise<ListResponse<Agent>> {
  return makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/agents`,
    options
  );
}
```

## Branch Creation Flow

1. User clicks branch dropdown in header
2. Selects "Create new branch"
3. Dialog opens with:
   - Branch name input
   - Source branch selector (defaults to current branch)
4. User enters name and clicks "Create branch"
5. API creates the branch
6. URL updates to `?ref=new-branch-name`
7. Page refreshes with new branch context
8. All subsequent API calls use the new branch

## Write Protection

The backend middleware includes write protection:

- ✅ **Branches**: Allow read and write operations
- ❌ **Tags**: Read-only (immutable snapshots)
- ❌ **Commits**: Read-only (historical points)

If a user tries to modify data while viewing a tag or commit, they'll receive an error:

```
Cannot perform write operation on tag. Tags and commits are immutable. Write to a branch instead.
```

## Integration Checklist

To fully integrate branch support in a page:

- [ ] Update server component to read `searchParams.ref`
- [ ] Pass ref to API calls via `queryParams: { ref }`
- [ ] Test viewing different branches
- [ ] Test creating new branches
- [ ] Test that writes work on branches
- [ ] Test that writes are blocked on tags/commits

## Files Modified

1. `/src/lib/api/api-config.ts` - Added query parameter support
2. `/src/components/layout/site-header.tsx` - Added branch selector
3. Created `/src/lib/api/branches.ts` - Branch API functions
4. Created `/src/components/branches/branch-selector.tsx` - Dropdown component
5. Created `/src/components/branches/new-branch-dialog.tsx` - Creation dialog
6. Created `/src/hooks/use-current-ref.ts` - Helper hooks

## Future Enhancements

Potential improvements:

1. **Branch management UI**: Dedicated page for managing branches (merge, delete, etc.)
2. **Tag creation**: UI for creating tags from current state
3. **Commit history**: View commit log for a branch
4. **Visual diff**: Compare branches side-by-side
5. **Merge UI**: Interface for merging branches
6. **Conflict resolution**: UI for handling merge conflicts

## Testing

To test the branch selector:

1. Navigate to any project: `/tenant123/projects/proj456/agents`
2. Click the branch dropdown in the header (git branch icon)
3. Select "Create new branch"
4. Enter a name like `feature/test` and create
5. URL should update to `?ref=feature/test`
6. Create/modify data - changes go to this branch
7. Switch back to main branch via dropdown
8. Data should revert to main branch state
9. Switch to feature branch again - your changes are there

## Troubleshooting

**Branch selector not appearing**
- Ensure you're on a project page (URL has `/projects/[projectId]`)
- Check browser console for errors

**Changes not persisting**
- Verify the `ref` parameter is in the URL
- Check that API calls include `queryParams: { ref }`
- Ensure the backend middleware is enabled (not in test mode)

**Cannot create branch**
- Check branch name follows the regex: `/^[a-zA-Z0-9_\-\/]+$/`
- Verify the source branch exists
- Check API logs for errors

**Writes failing on branch**
- Ensure you're on an actual branch, not a tag or commit hash
- Check that the ref resolves to type `'branch'`
