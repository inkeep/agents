# Agent Builder Library

This library provides server actions and types for interacting with the GraphFull API from the inkeep-chat backend. It imports the original schemas from the inkeep-chat package to avoid duplication and ensure consistency.

## Configuration

Set the following environment variable in your `.env.local` file:

```bash
INKEEP_AGENTS_RUN_API_URL="http://localhost:3003"
INKEEP_AGENTS_MANAGE_API_URL="http://localhost:3002"
```

## Usage

### Import the server actions and types

```typescript
import {
  createFullGraphAction,
  getFullGraphAction,
  updateFullGraphAction,
  deleteFullGraphAction,
  validateGraphData,
  FullGraphDefinitionSchema,
  type FullGraphDefinition,
  type ActionResult,
} from '@/lib';
```

### Create a new graph

```typescript
const result = await createFullGraphAction('tenant-123', {
  id: 'my-graph',
  name: 'My Customer Service Graph',
  description: 'A graph for customer service operations',
  defaultSubAgentId: 'support-agent',
  agents: {
    'support-agent': {
      id: 'support-agent',
      name: 'Support Agent',
      description: 'Handles customer support',
      tools: ['email-tool'],
    }
  },
  tools: {
    'email-tool': {
      id: 'email-tool',
      name: 'Email Tool',
      type: 'mcp',
      config: {}
    }
  }
});

if (result.success) {
  console.log('Graph created:', result.data);
} else {
  console.error('Error:', result.error);
}
```

### Get an existing graph

```typescript
const result = await getFullGraphAction('tenant-123', 'my-graph');

if (result.success) {
  console.log('Graph retrieved:', result.data);
} else {
  console.error('Error:', result.error);
}
```

### Update a graph

```typescript
const updatedGraph = {
  id: 'my-graph',
  name: 'Updated Customer Service Graph',
  // ... other properties
};

const result = await updateFullGraphAction('tenant-123', 'my-graph', updatedGraph);

if (result.success) {
  console.log('Graph updated:', result.data);
} else {
  console.error('Error:', result.error);
}
```

### Delete a graph

```typescript
const result = await deleteFullGraphAction('tenant-123', 'my-graph');

if (result.success) {
  console.log('Graph deleted successfully');
} else {
  console.error('Error:', result.error);
}
```

### Validate graph data

Use this for form validation before submitting:

```typescript
const result = await validateGraphData(formData);

if (result.success) {
  // Data is valid, proceed with submission
  const validatedData = result.data;
} else {
  // Show validation errors
  console.error('Validation error:', result.error);
}
```

## Type Safety

All functions return an `ActionResult<T>` type that ensures proper error handling:

```typescript
type ActionResult<T = void> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
  code?: string;
};
```

## Error Codes

The API may return the following error codes:

- `not_found`: Graph not found
- `bad_request`: Invalid request data
- `internal_server_error`: Server error
- `conflict`: Graph already exists (on create)
- `validation_error`: Client-side validation failed
- `unknown_error`: Unexpected error occurred