# SPEC: Enforce Authentication for App Access

## Problem Statement

Web client apps currently support asymmetric JWT authentication via public key configuration. When authentication keys are configured, the `allowAnonymous` flag controls whether users without a valid JWT can still access the app anonymously. However:

1. **No UI control exists** for the `allowAnonymous` setting — it defaults to `true` implicitly (via `allowAnonymous !== false` in `runAuth.ts:632`), meaning all apps allow anonymous access even when auth keys are configured.
2. **Builders have no way** to enforce that all app users must present a valid JWT — a critical requirement for apps handling sensitive data or requiring user identity.

The `allowAnonymous` field already exists in `WebClientAuthConfigSchema` and the runtime enforcement logic works correctly in `runAuth.ts`. This feature surfaces that control in the UI and ensures the datamodel is explicit.

## Goals

- Allow app builders to toggle "Require Authentication" for web client apps in the manage UI
- When enabled, anonymous access is blocked — only users with valid JWTs can access the app
- The toggle should only be available when at least one public key is configured (you can't require auth without keys to verify against)
- Persist the setting via the existing `allowAnonymous` field in `app.config.webClient.auth`

## Non-Goals

- Changing the runtime auth enforcement logic (it already works correctly)
- Adding new API endpoints (the existing app update endpoint accepts config changes)
- Modifying the `allowAnonymous` default behavior for existing apps (backward compatible)
- Adding auth enforcement for `api` type apps (out of scope)

## Technical Design

### Data Model

The `allowAnonymous` field already exists in `WebClientAuthConfigSchema` (`packages/agents-core/src/validation/schemas.ts:1944`):

```typescript
export const WebClientAuthConfigSchema = z.object({
  publicKeys: z.array(PublicKeyConfigSchema).default([]),
  audience: z.string().optional(),
  validateScopeClaims: z.boolean().optional(),
  allowAnonymous: z.boolean().optional(), // already exists
});
```

**No schema changes needed.** The field is optional and defaults to `true` when not set (via `!== false` check in runtime). Setting it to `false` enforces authentication.

### API Layer

The existing `PATCH /tenants/{tenantId}/projects/{projectId}/apps/{id}` endpoint already accepts `config` in the body via `AppApiUpdateSchema`. The UI will send the `allowAnonymous` value as part of the `config.webClient.auth` object, merged with existing auth config (preserving `publicKeys`, `audience`, etc.).

**No API changes needed.**

### UI Changes

#### 1. Auth Keys Section Enhancement (`agents-manage-ui/src/components/apps/auth-keys-section.tsx`)

Add a "Require Authentication" toggle to the `AuthKeysSection` component. This toggle:

- **Appears only when keys are configured** (keys.length > 0)
- **Reads initial state** from the app's `config.webClient.auth.allowAnonymous` field
- **Updates via a new server action** that PATCHes the app config with `allowAnonymous: true/false`
- **UI pattern**: Switch component (matching the existing "Enabled" toggle pattern in `app-update-form.tsx:128-138`)
- **Label**: "Require Authentication"
- **Description**: "When enabled, all users must present a valid signed JWT. Anonymous access is blocked."
- **Position**: Between the key list and the "Add Key" button area, visible only when keys exist

#### 2. Server Action (`agents-manage-ui/src/lib/actions/app-auth-keys.ts`)

Add a new server action `updateAppAuthSettingsAction` that:
- Takes `tenantId`, `projectId`, `appId`, and `allowAnonymous: boolean`
- Calls the existing app update API with the merged config
- Revalidates the apps path

#### 3. Data Flow

The `AuthKeysSection` component currently manages its own state independently from the parent form. The `allowAnonymous` toggle follows this same pattern — it updates immediately via server action (not through the parent form submit), matching how key add/delete already works.

To read the initial `allowAnonymous` value, the component needs access to the current auth config. Options:
- **Option A**: Pass `allowAnonymous` as a prop from the parent form (which already has `webConfig`)
- **Option B**: Fetch it alongside keys from a new or existing endpoint

**Decision: Option A** — simpler, no new endpoints, parent already has the data.

### Runtime Enforcement (No Changes)

The existing logic in `runAuth.ts:631-645` already handles this correctly:

```typescript
if (!asymResult.ok) {
  const allowAnonymous = config.webClient.auth?.allowAnonymous !== false;
  if (!allowAnonymous) {
    throw createApiError({ code: 'unauthorized', message: asymResult.failureMessage });
  }
  // Fall through to anonymous path
}
```

## Acceptance Criteria

1. **Toggle visible when keys configured**: When a web client app has at least one public key, a "Require Authentication" switch appears in the auth section
2. **Toggle hidden when no keys**: When no public keys are configured, the toggle is not shown
3. **Toggle reflects current state**: The switch reflects the current `allowAnonymous` value from the app config (off = allowAnonymous true/undefined, on = allowAnonymous false)
4. **Toggle persists on change**: Toggling the switch immediately saves the setting via server action and shows a success toast
5. **Backward compatible**: Apps without `allowAnonymous` set continue to allow anonymous access (existing behavior unchanged)
6. **Runtime enforcement works**: When `allowAnonymous` is `false` and a request comes in with an invalid/missing JWT, the API returns 401

## Test Cases

1. **Unit test**: `AuthKeysSection` renders the toggle only when keys are present
2. **Unit test**: Toggle state reflects the `allowAnonymous` prop value
3. **Unit test**: Toggling calls the server action with correct parameters
4. **Integration test**: App update API correctly persists `allowAnonymous` in config JSONB
5. **Integration test**: Runtime auth correctly blocks anonymous access when `allowAnonymous: false`

## Files to Modify

| File | Change |
|------|--------|
| `agents-manage-ui/src/components/apps/auth-keys-section.tsx` | Add Require Authentication toggle |
| `agents-manage-ui/src/components/apps/form/app-update-form.tsx` | Pass `allowAnonymous` prop to AuthKeysSection |
| `agents-manage-ui/src/lib/actions/app-auth-keys.ts` | Add `updateAppAuthSettingsAction` server action |
| `agents-manage-ui/src/lib/api/app-auth-keys.ts` | Add API call for updating auth settings (if needed) |

## Risk Assessment

- **Low risk**: No schema migration needed, no API changes, runtime logic unchanged
- **UI-only change** with server action that uses existing update endpoint
- **Backward compatible**: Optional field, existing apps unaffected
