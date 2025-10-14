# Agent Builder Library

This library provides server actions and types for interacting with the AgentFull API from the inkeep-chat backend. It imports the original schemas from the inkeep-chat package to avoid duplication and ensure consistency.

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
  createFullAgentAction,
  deleteFullAgentAction,
  getFullAgentAction,
  updateFullAgentAction,
  validateAgentData,
  FullAgentDefinitionSchema,
  type FullAgentDefinition,
  type ActionResult,
} from '@/lib';
```

### Create a new agent

```typescript
const result = await createFullAgentAction('tenant-123', {
  id: 'my-agent',
  name: 'My Customer Service Agent',
  description: 'An agent for customer service operations',
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
  console.log('Agent created:', result.data);
} else {
  console.error('Error:', result.error);
}
```

### Get an existing agent

```typescript
const result = await getFullAgentAction('tenant-123', 'my-agent');

if (result.success) {
  console.log('Agent retrieved:', result.data);
} else {
  console.error('Error:', result.error);
}
```

### Update an agent

```typescript
const updatedAgent = {
  id: 'my-agent',
  name: 'Updated Customer Service Agent',
  // ... other properties
};

const result = await updateFullAgentAction('tenant-123', 'my-agent', updatedAgent);

if (result.success) {
  console.log('Agent updated:', result.data);
} else {
  console.error('Error:', result.error);
}
```

### Delete an agent

```typescript
const result = await deleteFullAgentAction('tenant-123', 'my-agent');

if (result.success) {
  console.log('Agent deleted successfully');
} else {
  console.error('Error:', result.error);
}
```

### Validate agent data

Use this for form validation before submitting:

```typescript
const result = await validateAgentData(formData);

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

- `not_found`: Agent not found
- `bad_request`: Invalid request data
- `internal_server_error`: Server error
- `conflict`: Agent already exists (on create)
- `validation_error`: Client-side validation failed
- `unknown_error`: Unexpected error occurred