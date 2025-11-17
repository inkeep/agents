# Branch Integration Example

This document shows a complete example of how to update existing pages and API functions to support branch-aware operations.

## Example: Updating the Agents Page

### Step 1: Update the API Function

**File**: `/src/lib/api/agents.ts` (or similar)

```typescript
// BEFORE
export async function fetchAgents(
  tenantId: string,
  projectId: string
): Promise<ListResponse<Agent>> {
  return makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/agents`
  );
}

// AFTER - Add ApiRequestOptions parameter
import type { ApiRequestOptions } from './api-config';

export async function fetchAgents(
  tenantId: string,
  projectId: string,
  options?: ApiRequestOptions  // ← Add this parameter
): Promise<ListResponse<Agent>> {
  return makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/agents`,
    options  // ← Pass options through
  );
}
```

### Step 2: Update Server Component Pages

**File**: `/src/app/[tenantId]/projects/[projectId]/agents/page.tsx`

```typescript
// BEFORE
async function AgentsPage({
  params
}: PageProps<'/[tenantId]/projects/[projectId]/agents'>) {
  const { tenantId, projectId } = await params;

  const agents = await fetchAgents(tenantId, projectId);

  return <AgentList agents={agents} />;
}

// AFTER - Add searchParams to read ref
async function AgentsPage({
  params,
  searchParams  // ← Add searchParams
}: PageProps<'/[tenantId]/projects/[projectId]/agents'>) {
  const { tenantId, projectId } = await params;
  const { ref } = await searchParams;  // ← Extract ref

  const agents = await fetchAgents(
    tenantId,
    projectId,
    { queryParams: { ref } }  // ← Pass ref to API
  );

  return <AgentList agents={agents} />;
}
```

### Step 3: Update Client Components

**File**: `/src/components/agents/agents-list.tsx` (if it fetches data)

```typescript
// BEFORE
'use client';

import { useEffect, useState } from 'react';
import { fetchAgents } from '@/lib/api/agents';

function AgentsList({ tenantId, projectId }: Props) {
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    async function loadAgents() {
      const response = await fetchAgents(tenantId, projectId);
      setAgents(response.data);
    }
    loadAgents();
  }, [tenantId, projectId]);

  return <div>{/* ... */}</div>;
}

// AFTER - Use useRefOptions hook
'use client';

import { useEffect, useState } from 'react';
import { fetchAgents } from '@/lib/api/agents';
import { useRefOptions } from '@/hooks/use-current-ref';  // ← Import hook

function AgentsList({ tenantId, projectId }: Props) {
  const [agents, setAgents] = useState([]);
  const refOptions = useRefOptions();  // ← Get ref options

  useEffect(() => {
    async function loadAgents() {
      const response = await fetchAgents(
        tenantId,
        projectId,
        refOptions  // ← Pass ref options
      );
      setAgents(response.data);
    }
    loadAgents();
  }, [tenantId, projectId, refOptions]);  // ← Add refOptions to deps

  return <div>{/* ... */}</div>;
}
```

### Step 4: Update Server Actions

**File**: `/src/lib/actions/agents.ts`

```typescript
// BEFORE
'use server';

export async function createAgentAction(
  tenantId: string,
  projectId: string,
  data: AgentFormData
) {
  return createAgent(tenantId, projectId, data);
}

// AFTER - Add ref parameter
'use server';

export async function createAgentAction(
  tenantId: string,
  projectId: string,
  data: AgentFormData,
  ref?: string  // ← Add ref parameter
) {
  return createAgent(
    tenantId,
    projectId,
    data,
    { queryParams: { ref } }  // ← Pass ref to API
  );
}
```

**And in the component that calls it**:

```typescript
// BEFORE
const handleSubmit = async (data: AgentFormData) => {
  await createAgentAction(tenantId, projectId, data);
};

// AFTER - Get ref from URL and pass it
import { useCurrentRef } from '@/hooks/use-current-ref';

const ref = useCurrentRef();

const handleSubmit = async (data: AgentFormData) => {
  await createAgentAction(tenantId, projectId, data, ref);
};
```

## Complete Example: Data Components Page

Here's a full example showing all the pieces together:

### API Function (`/src/lib/api/data-components.ts`)

```typescript
'use server';

import type { ApiRequestOptions } from './api-config';
import type { DataComponent } from '../types/data-component';
import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateTenantId } from './resource-validation';

export async function fetchDataComponents(
  tenantId: string,
  projectId: string,
  options?: ApiRequestOptions
): Promise<ListResponse<DataComponent>> {
  validateTenantId(tenantId);

  return makeManagementApiRequest<ListResponse<DataComponent>>(
    `tenants/${tenantId}/projects/${projectId}/components`,
    options
  );
}

export async function createDataComponent(
  tenantId: string,
  projectId: string,
  data: DataComponentFormData,
  options?: ApiRequestOptions
): Promise<SingleResponse<DataComponent>> {
  validateTenantId(tenantId);

  return makeManagementApiRequest<SingleResponse<DataComponent>>(
    `tenants/${tenantId}/projects/${projectId}/components`,
    {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}
```

### Page Component (`/src/app/[tenantId]/projects/[projectId]/components/page.tsx`)

```typescript
import { DataComponentList } from '@/components/data-components/data-component-list';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { PageHeader } from '@/components/layout/page-header';
import { fetchDataComponents } from '@/lib/api/data-components';

export const dynamic = 'force-dynamic';

async function DataComponentsPage({
  params,
  searchParams
}: PageProps<'/[tenantId]/projects/[projectId]/components'>) {
  const { tenantId, projectId } = await params;
  const { ref } = await searchParams;

  let components: Awaited<ReturnType<typeof fetchDataComponents>>;

  try {
    components = await fetchDataComponents(
      tenantId,
      projectId,
      { queryParams: { ref } }
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="data components" />;
  }

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Data Components', href: `/${tenantId}/projects/${projectId}/components` }
      ]}
    >
      <PageHeader
        title="Data Components"
        description="Manage your data components across branches"
      />
      <DataComponentList
        tenantId={tenantId}
        projectId={projectId}
        components={components.data}
      />
    </BodyTemplate>
  );
}

export default DataComponentsPage;
```

### Client Component with Form (`/src/components/data-components/new-component-dialog.tsx`)

```typescript
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createDataComponent } from '@/lib/api/data-components';
import { useCurrentRef } from '@/hooks/use-current-ref';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

interface NewComponentDialogProps {
  tenantId: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewComponentDialog({
  tenantId,
  projectId,
  open,
  onOpenChange,
}: NewComponentDialogProps) {
  const router = useRouter();
  const ref = useCurrentRef();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const onSubmit = async (data: any) => {
    try {
      setIsSubmitting(true);

      await createDataComponent(
        tenantId,
        projectId,
        data,
        { queryParams: { ref } }  // ← Include current ref
      );

      toast.success('Component created successfully');
      onOpenChange(false);
      router.refresh();  // Refresh to show new component
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create component');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Create Data Component</DialogTitle>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isSubmitting} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

## Key Takeaways

1. **Always pass `ApiRequestOptions`** to API functions as an optional last parameter
2. **Server components** read `ref` from `searchParams` and pass via `queryParams`
3. **Client components** use `useCurrentRef()` or `useRefOptions()` hooks
4. **Server actions** accept `ref` as a parameter from the calling component
5. **URL updates** automatically trigger re-renders with new branch context

## Migration Checklist

For each feature/page:

- [ ] Update API function signatures to accept `ApiRequestOptions`
- [ ] Update server components to read and pass `searchParams.ref`
- [ ] Update client components to use `useRefOptions()` hook
- [ ] Update server actions to accept and forward `ref` parameter
- [ ] Update form submissions to include current ref
- [ ] Test creating/updating/deleting data on different branches
- [ ] Verify data is isolated between branches

## Common Patterns

### Pattern 1: Read-only Display (Server Component)

```typescript
async function MyPage({ params, searchParams }) {
  const { tenantId, projectId } = await params;
  const { ref } = await searchParams;

  const data = await fetchData(tenantId, projectId, { queryParams: { ref } });

  return <Display data={data} />;
}
```

### Pattern 2: Interactive Component (Client)

```typescript
function MyComponent({ tenantId, projectId }) {
  const refOptions = useRefOptions();
  const [data, setData] = useState([]);

  useEffect(() => {
    loadData();
  }, [refOptions]);

  async function loadData() {
    const result = await fetchData(tenantId, projectId, refOptions);
    setData(result.data);
  }

  return <div>{/* ... */}</div>;
}
```

### Pattern 3: Mutations (Forms)

```typescript
function MyForm({ tenantId, projectId }) {
  const ref = useCurrentRef();
  const router = useRouter();

  async function handleSubmit(data) {
    await createItem(tenantId, projectId, data, { queryParams: { ref } });
    router.refresh();
  }

  return <form onSubmit={handleSubmit}>{/* ... */}</form>;
}
```
