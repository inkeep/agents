# Normalize headersSchema Property Names to Lowercase

**Status:** Draft
**Scope:** Bug fix

---

## Problem Statement

HTTP header names are case-insensitive per RFC 7230/9110 and are normalized to lowercase by the Fetch API (which Hono uses). When a customer defines a `headersSchema` with camelCase properties (e.g., `mcpToken`), the system silently fails because three downstream operations do case-sensitive comparisons against the lowercased header keys:

1. **AJV schema validation** — `properties: { "mcpToken" }` doesn't match data key `"mcptoken"` → validation fails with 500 "Context validation failed"
2. **`filterByJsonSchema()`** — `key in data` check is case-sensitive → value gets filtered out even if validation were to pass
3. **TemplateEngine JMESPath resolution** — `{{headers.mcpToken}}` looks up property `mcpToken` but stored key is `mcptoken` → resolves to null

A customer (Ilya) hit this exact bug. The current workaround (PR #2936) is documenting "use lowercase" — fragile because every new customer will encounter this.

**Root cause:** `contextValidationMiddleware` (validation.ts:391-394) correctly lowercases incoming header keys (`key.toLowerCase()`), but the `headersSchema` property names and `required` array entries are NOT lowercased before validation. The two sides of the comparison use different casing.

---

## Goals

Fix the casing mismatch so customers can define `headersSchema` with any casing and it works correctly.

---

## Non-Goals

- **NOT NOW:** Case-preserving headers (storing original casing from the request). HTTP/2 mandates lowercase; the Fetch API enforces it. Preserving casing would fight the platform.
- **NEVER:** Making template variable resolution case-insensitive. `{{headers.mcpToken}}` should resolve to the lowercased key `mcptoken`. The fix is at the schema level, not the template level.

---

## Proposed Solution

Normalize the `headersSchema` property names and `required` entries to lowercase before AJV compilation and filtering. This makes the system case-insensitive at the schema boundary.

### Where to fix

**Primary fix: `makeSchemaPermissive()` in `validation.ts`** (line 70-104)

This function already walks the schema to set `additionalProperties: true`. Extend it to also lowercase property names and required entries:

```typescript
function makeSchemaPermissive(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const permissiveSchema = { ...schema };

  if (permissiveSchema.type === 'object') {
    permissiveSchema.additionalProperties = true;

    // Lowercase property names
    if (permissiveSchema.properties && typeof permissiveSchema.properties === 'object') {
      const newProperties: any = {};
      for (const [key, value] of Object.entries(permissiveSchema.properties)) {
        newProperties[key.toLowerCase()] = makeSchemaPermissive(value);
      }
      permissiveSchema.properties = newProperties;
    }

    // Lowercase required entries
    if (Array.isArray(permissiveSchema.required)) {
      permissiveSchema.required = permissiveSchema.required.map(
        (r: string) => typeof r === 'string' ? r.toLowerCase() : r
      );
    }
  }
  // ... rest unchanged (array, oneOf, anyOf, allOf recursion)
  return permissiveSchema;
}
```

**No changes needed elsewhere:**
- `filterByJsonSchema()` iterates `schema.properties` keys — since those are now lowercased, `key in data` matches lowercased header keys.
- TemplateEngine: `{{headers.mcptoken}}` (lowercase) matches stored keys. Customers who previously used `{{headers.mcpToken}}` would need to update templates — but those templates never worked, so there's no backward compatibility concern.
- Schema cache: keyed by `JSON.stringify(schema)` — the ORIGINAL schema is the cache key (before `makeSchemaPermissive`), so normalization doesn't affect caching.

---

## Acceptance Criteria

1. A `headersSchema` with camelCase properties (`mcpToken`) validates successfully against lowercased incoming headers (`mcptoken`).
2. Validated headers are correctly filtered to schema keys (only declared properties returned).
3. `required` properties with non-lowercase names still enforce correctly (e.g., `required: ["mcpToken"]` enforces the presence of `mcptoken`).
4. Existing schemas with lowercase properties continue to work identically (no regression).
5. The schema cache is not broken by normalization (same original schema → same cache entry).
6. The 500 "Context validation failed" error no longer occurs for the camelCase schema case.

---

## Test Cases

1. **camelCase property validates:** Schema `{ properties: { "mcpToken": { type: "string" } } }` + headers `{ "mcptoken": "value" }` → valid, returns `{ "mcptoken": "value" }`.
2. **camelCase required enforces:** Schema `{ properties: { "mcpToken": ... }, required: ["mcpToken"] }` + headers `{ "mcptoken": "value" }` → valid. Same schema + headers `{}` → invalid (missing required).
3. **Lowercase property unchanged:** Schema `{ properties: { "mcptoken": ... } }` + headers `{ "mcptoken": "value" }` → valid (no regression).
4. **Mixed case properties:** Schema `{ properties: { "McpToken": ..., "x-api-key": ... } }` + headers `{ "mcptoken": "a", "x-api-key": "b" }` → valid, both values returned.
5. **Nested object schemas:** Schema with nested object properties using camelCase → properties lowercased at all levels.
6. **Schema cache correctness:** Two calls with the same original schema → second call uses cache. The normalized schema (with lowercased keys) is what AJV compiles, but the cache key is the original schema string.

---

## Files Changed

| File | Change |
|---|---|
| `agents-api/src/domains/run/context/validation.ts` | Extend `makeSchemaPermissive()` to lowercase property names and required entries |
| `agents-api/src/domains/run/context/__tests__/validation.test.ts` | Add test cases for camelCase schema normalization |

---

## Risks

- **Template variable mismatch documentation:** Customers who write `{{headers.mcpToken}}` in their agent-tool relation headers will still see null — because the stored key is `mcptoken`. This is expected behavior (templates are case-sensitive). The docs already say "use lowercase" for template variables. The fix ensures the SCHEMA side is tolerant, not the template side.
