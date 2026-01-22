# Configurable Webhook HMAC Signature Verification

## Overview

Implement fully configurable HMAC signature verification for triggers, allowing users to specify how different webhook providers sign requests (signature header, encoding, algorithm, signed components) and store signing secrets securely via credential references.

## Problem

The current trigger implementation only supports a single hardcoded signature pattern (`X-Signature-256` header, `sha256={hex}` format, body-only signing). Different webhook providers use different patterns:

| Provider | Signature Header | Timestamp Header | Format | What's Signed |
|----------|------------------|------------------|--------|---------------|
| GitHub | `X-Hub-Signature-256` | N/A | `sha256={hex}` | body |
| Zendesk | `X-Zendesk-Webhook-Signature` | `X-Zendesk-Webhook-Signature-Timestamp` | base64 | timestamp + body |
| Slack | `X-Slack-Signature` | `X-Slack-Request-Timestamp` | `v0={hex}` | `v0:{timestamp}:{body}` |
| Stripe | `t={ts},v1={sig}` in header | (embedded) | hex | timestamp + body |

## Solution

Replace the simple `signingSecret` field with:

1. A `signingSecretCredentialReferenceId` that references a credential stored securely in the credential store
2. A `signatureVerification` JSON configuration object with all customizable parameters

## Data Model

```typescript
// Fully generalized SignatureVerificationConfig schema
{
  algorithm: "sha256" | "sha1";      // HMAC algorithm
  encoding: "hex" | "base64";        // Output encoding of computed signature
  
  // Where to extract the signature from the request
  signature: {
    source: "header" | "query" | "body";
    key: string;                     // Header name, query param, or JMESPath for body
    prefix?: string;                 // Strip this prefix before comparison (e.g., "sha256=", "v0=")
  };
  
  // Ordered array of components to hash
  signedComponents: Array<{
    source: "header" | "body" | "literal";
    key?: string;                    // Header name or JMESPath selector (for header/body)
    value?: string;                  // Static value (for literal)
  }>;
  
  componentSeparator?: string;       // How to join components (default: "")
}
```

This schema is fully generalized:

- **signature.source**: Extract signature from any header, query param, or body field (via JMESPath)
- **signedComponents[].source**: Each component can come from a header, body field (JMESPath), or be a literal string
- No hardcoded "timestamp" type - timestamps are just headers like any other

## Files to Modify

### 1. Database Schema

- `packages/agents-core/src/db/manage/manage-schema.ts`
  - Add `signingSecretCredentialReferenceId` FK column referencing `credential_references`
  - Add `signatureVerification` JSONB column
  - Mark `signingSecret` as deprecated (keep for backward compatibility)

### 2. Migration

- Generate new migration via `pnpm db:generate`

### 3. Validation Schemas

- `packages/agents-core/src/validation/schemas.ts`
  - Add `SignatureVerificationConfigSchema` with Zod
  - Add `SignatureSourceSchema` for signature extraction config
  - Add `SignedComponentSchema` for hash component config
  - Update `TriggerInsertSchema` and `TriggerUpdateSchema`
  - Update `TriggerApiInsertSchema` and `TriggerApiSelectSchema`

### 4. Core Verification Logic

- `packages/agents-core/src/utils/trigger-auth.ts`
  - Add `verifySignatureWithConfig()` function supporting all configurable options
  - Keep existing `verifySigningSecret()` for backward compatibility
  - Use timing-safe comparison (`crypto.timingSafeEqual`)
  - Support JMESPath extraction for body fields

### 5. Trigger Service

- `agents-api/src/domains/run/services/TriggerService.ts`
  - Resolve `signingSecretCredentialReferenceId` via credential store to get actual secret
  - Use new configurable verification when `signatureVerification` is present
  - Fall back to legacy `verifySigningSecret()` when only `signingSecret` is set

### 6. SDK Builder

- `packages/agents-sdk/src/builderFunctions.ts`
  - Update `trigger()` to accept `signingSecretCredentialReference` and `signatureVerification`
- `packages/agents-sdk/src/builders.ts`
  - Update `Trigger` class to handle new configuration

### 7. Manage API Routes

- `agents-api/src/domains/manage/routes/triggers.ts`
  - Handle new fields in create/update operations
  - Validate credential reference exists

### 8. UI Components

- `agents-manage-ui/src/components/triggers/trigger-form.tsx`
  - Add credential reference selector for signing secret
  - Add signature verification configuration section with:
    - Algorithm dropdown (sha256, sha1)
    - Encoding dropdown (hex, base64)
    - Signature source configuration
    - Signed components builder (add/remove/reorder)
    - Component separator input

### 9. Documentation

- `agents-docs/content/typescript-sdk/triggers.mdx`
  - Document new configuration options
  - Add examples for common providers (GitHub, Slack, Zendesk, Stripe)
  - Deprecation notice for `signingSecret` field

### 10. Tests

- `packages/agents-core/src/__tests__/utils/trigger-auth.test.ts` (new file)
  - Unit tests for configurable signature verification
  - Test cases for GitHub, Zendesk, Slack patterns
  - Edge cases (missing headers, invalid signatures, etc.)
- `agents-api/src/__tests__/run/routes/webhooks.test.ts`
  - Integration tests with credential store resolution

## Example SDK Usage

```typescript
import { trigger, credentialReference } from "@inkeep/agents-sdk";

// Create a credential reference for the secret
const githubSecret = credentialReference({
  id: "github-webhook-secret",
  name: "GitHub Webhook Secret",
  type: "api_key",
  credentialStoreId: "env-store",
  retrievalParams: { key: "GITHUB_WEBHOOK_SECRET" },
});

// GitHub - signs body only, signature in X-Hub-Signature-256 header
const githubTrigger = trigger({
  name: "GitHub Events",
  signingSecretCredentialReference: githubSecret,
  signatureVerification: {
    algorithm: "sha256",
    encoding: "hex",
    signature: {
      source: "header",
      key: "X-Hub-Signature-256",
      prefix: "sha256=",
    },
    signedComponents: [
      { source: "body" },  // Raw request body
    ],
  },
});

// Zendesk - signs timestamp+body (concatenated), signature base64-encoded
const zendeskTrigger = trigger({
  name: "Zendesk Events",
  signingSecretCredentialReference: zendeskSecret,
  signatureVerification: {
    algorithm: "sha256",
    encoding: "base64",
    signature: {
      source: "header",
      key: "X-Zendesk-Webhook-Signature",
    },
    signedComponents: [
      { source: "header", key: "X-Zendesk-Webhook-Signature-Timestamp" },
      { source: "body" },
    ],
    componentSeparator: "",  // Direct concatenation
  },
});

// Slack - signs "v0:{timestamp}:{body}" with colon separator
const slackTrigger = trigger({
  name: "Slack Events",
  signingSecretCredentialReference: slackSecret,
  signatureVerification: {
    algorithm: "sha256",
    encoding: "hex",
    signature: {
      source: "header",
      key: "X-Slack-Signature",
      prefix: "v0=",
    },
    signedComponents: [
      { source: "literal", value: "v0" },
      { source: "header", key: "X-Slack-Request-Timestamp" },
      { source: "body" },
    ],
    componentSeparator: ":",
  },
});

// Custom webhook - signature in query param, signs specific body field
const customTrigger = trigger({
  name: "Custom Webhook",
  signingSecretCredentialReference: customSecret,
  signatureVerification: {
    algorithm: "sha256",
    encoding: "hex",
    signature: {
      source: "query",
      key: "sig",
    },
    signedComponents: [
      { source: "body", key: "payload.data" },  // JMESPath selector
    ],
  },
});
```

## Migration Strategy

1. New fields are additive; existing `signingSecret` continues to work
2. When `signatureVerification` is present, use new configurable logic
3. When only `signingSecret` is set, use legacy hardcoded logic (`X-Signature-256` header, `sha256={hex}` format)
4. Deprecation warning in docs for `signingSecret` field

## Implementation Tasks

- [ ] Add `signatureVerification` and `signingSecretCredentialReferenceId` to triggers table schema
- [ ] Generate database migration for new trigger columns
- [ ] Create `SignatureVerificationConfigSchema` and update trigger schemas
- [ ] Implement configurable `verifySignatureWithConfig()` in `trigger-auth.ts`
- [ ] Update `TriggerService` to resolve credentials and use new verification
- [ ] Update `trigger()` SDK builder to accept new configuration options
- [ ] Handle new fields in trigger create/update API routes
- [ ] Add credential selector and verification config to trigger form UI
- [ ] Add unit and integration tests for configurable signature verification
- [ ] Update `triggers.mdx` with new configuration options and provider examples

## References

- [GitHub Webhook Signature Verification](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [Zendesk Webhook Verification](https://developer.zendesk.com/documentation/webhooks/verifying/)
- [Slack Request Verification](https://api.slack.com/authentication/verifying-requests-from-slack)
