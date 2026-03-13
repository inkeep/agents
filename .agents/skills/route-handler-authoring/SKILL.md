---
name: route-handler-authoring
description: "Conventions for writing Hono route handlers that forward validated bodies to DAL functions, and CRUD test requirements for round-trip field persistence. Triggers on: creating new routes, modifying handlers, adding CRUD tests, route handler patterns, field-picking, spread pattern, DAL forwarding, check:route-handler-patterns, CI check failure."
---

# Route Handler Authoring Guide

Conventions for writing route handlers in `agents-api/src/domains/**/routes/` and their corresponding CRUD tests.

---

## Spread Pattern (Required)

When forwarding a validated request body to a DAL function, **always spread the body**. Never use explicit field-picking.

### Correct Pattern

```typescript
const body = c.req.valid('json');

const result = await createEntity(db)({
  ...body,
  id: body.id || generateId(),
});
```

Spread the full body first, then override specific fields with transformations.

### Incorrect Pattern (Anti-Pattern)

```typescript
const body = c.req.valid('json');

const result = await createEntity(db)({
  name: body.name,
  description: body.description,
  config: body.config,
  id: body.id || generateId(),
});
```

Explicit field-picking silently drops any field not listed. When new columns are added to the schema, the handler will not forward them — causing data loss bugs that are invisible until discovered in production.

---

## Field Transformation Overrides

Some fields require transformation before storage. Place these **after** the spread so they override the raw values:

```typescript
const body = c.req.valid('json');

const result = await createTrigger(db)({
  ...body,
  id: generateId(),
  hashedAuthentication: body.authentication
    ? await hashAuthentication(body.authentication)
    : null,
  createdBy: c.get('userId'),
});
```

Common transformations to preserve as overrides:
- ID generation: `id: body.id || generateId()`
- Null coercion: `expiresAt: body.expiresAt || undefined`
- Type coercion: `position: String(body.position)`
- Default values: `enabled: body.enabled ?? true`
- Authentication hashing: `hashedAuthentication: await hashAuthentication(...)`
- Computed fields: `createdBy: c.get('userId')`

---

## CI Enforcement

The `scripts/check-route-handler-patterns.mjs` script runs in CI as part of `pnpm check`. It detects handlers that call `c.req.valid('json')` and access the body variable via explicit field-picking without a corresponding spread.

### Allowlisting Exceptions

If a handler legitimately needs explicit field-picking (rare), add the comment:

```typescript
// allow-field-picking
```

within the object literal block that requires the exception. Use this sparingly — most handlers should use the spread pattern.

### Running Locally

```bash
pnpm check:route-handler-patterns
```

---

## CRUD Test Requirements

Every entity with a route handler must have round-trip field persistence tests covering ALL schema fields.

### Required Test Coverage

1. **Create with all fields** → GET → verify all fields match
2. **Update each field individually** → GET → verify updated value
3. **Round-trip with all optional fields simultaneously** → verify all persist
4. **Null/undefined handling** for optional fields
5. **Field clearing** (set to null) for nullable fields
6. **Default values** are applied and returned correctly

### Test File Location

Tests live in `agents-api/src/__tests__/manage/routes/crud/` and use `makeRequest()` from `agents-api/src/__tests__/utils/testRequest.ts`.

### Exemplary Test Files

Use these as patterns for comprehensive field coverage:

- `contextConfigs.test.ts` — demonstrates full round-trip testing for all schema fields
- `credentialReferences.test.ts` — demonstrates create/update/read cycle for every field

### Test Data Factories

Use helpers from `agents-api/src/__tests__/utils/testHelpers.ts`:

- `createTestAgentData()` — agent entity test data
- `createTestToolData()` — tool entity test data
- Additional helpers for other entity types

### Example Test Pattern

```typescript
it('should persist imageUrl field on create', async () => {
  const toolData = createTestToolData({
    imageUrl: 'https://example.com/icon.png',
  });

  const createRes = await makeRequest('POST', '/tools', toolData);
  expect(createRes.status).toBe(200);

  const getRes = await makeRequest('GET', `/tools/${createRes.body.id}`);
  expect(getRes.status).toBe(200);
  expect(getRes.body.imageUrl).toBe('https://example.com/icon.png');
});

it('should update imageUrl field', async () => {
  const createRes = await makeRequest('POST', '/tools', createTestToolData());

  const updateRes = await makeRequest('PATCH', `/tools/${createRes.body.id}`, {
    imageUrl: 'https://example.com/new-icon.png',
  });
  expect(updateRes.status).toBe(200);

  const getRes = await makeRequest('GET', `/tools/${updateRes.body.id}`);
  expect(getRes.body.imageUrl).toBe('https://example.com/new-icon.png');
});
```

---

## Route Definition Pattern

All routes must use `createProtectedRoute()` with explicit authorization. See the `createProtectedRoute` section in CLAUDE.md for details on permission helpers.

```typescript
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { requireProjectPermission } from '../../middleware/projectAccess';

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    permission: requireProjectPermission('edit'),
    request: { body: { content: { 'application/json': { schema: CreateEntitySchema } } } },
    responses: { 200: { content: { 'application/json': { schema: EntitySchema } } } },
  }),
  async (c) => {
    const body = c.req.valid('json');
    const result = await createEntity(db)({ ...body, id: generateId() });
    return c.json(result);
  },
);
```

---

## HTTP Method Conventions

Use the correct HTTP method for each CRUD operation. See the "CRUD HTTP Method Conventions" section in AGENTS.md for the full table and RFC references.

- **PATCH** is the canonical method for partial/sparse update operations
- **PUT** is reserved for full-resource replacement — existing PUT routes remain but new update routes must use PATCH
- When adding a PATCH route alongside an existing PUT route, extract the handler and route config to shared variables, register PATCH with the canonical `operationId`, and register PUT with a `-put` suffixed `operationId` and `'x-speakeasy-ignore': true`
