# Configurable Webhook HMAC Signature Verification

## Overview

Implement fully configurable HMAC signature verification for triggers, allowing users to specify how different webhook providers sign requests (signature header, encoding, algorithm, signed components) and store signing secrets securely via credential references.

## Problem

The current trigger implementation only supports a single hardcoded signature pattern (`X-Signature-256` header, `sha256={hex}` format, body-only signing). Different webhook providers use different patterns:

| Provider | Signature Header | Timestamp Header | Format | What's Signed | Docs |
|----------|------------------|------------------|--------|---------------|------|
| GitHub | `X-Hub-Signature-256` | N/A | `sha256={hex}` | body | [Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) |
| Zendesk | `X-Zendesk-Webhook-Signature` | `X-Zendesk-Webhook-Signature-Timestamp` | base64 | timestamp + body | [Verifying webhook authenticity](https://developer.zendesk.com/documentation/webhooks/verifying/) |
| Slack | `X-Slack-Signature` | `X-Slack-Request-Timestamp` | `v0={hex}` | `v0:{timestamp}:{body}` | [Verifying requests from Slack](https://api.slack.com/authentication/verifying-requests-from-slack) |
| Stripe | `Stripe-Signature` | (embedded in header) | hex | timestamp + body | [Check the signatures](https://docs.stripe.com/webhooks#verify-official-libraries) |

## Solution

Replace the simple `signingSecret` field with:

1. A `signingSecretCredentialReferenceId` that references a credential stored securely in the credential store
2. A `signatureVerification` JSON configuration object with all customizable parameters

## Data Model

```typescript
// Fully generalized SignatureVerificationConfig schema
{
  // HMAC algorithm - uses Node.js built-in crypto.createHmac()
  // See "Algorithm Support" section for details on each
  algorithm: "sha256" | "sha512" | "sha384" | "sha1" | "md5";
  encoding: "hex" | "base64";        // Output encoding of computed signature
  
  // Where to extract the signature from the request
  signature: {
    source: "header" | "query" | "body";
    key: string;                     // Header name, query param, or JMESPath for body
    prefix?: string;                 // Strip this prefix before comparison (e.g., "sha256=", "v0=")
    regex?: string;                  // Extract signature using regex capture group (for complex formats like Stripe)
  };
  
  // Ordered array of components to hash
  signedComponents: Array<{
    source: "header" | "body" | "literal";
    key?: string;                    // Header name or JMESPath selector (for header/body)
    value?: string;                  // Static value (for literal)
    regex?: string;                  // Extract value using regex capture group (for complex header formats)
    required?: boolean;              // Default: true. If false, missing component treated as empty string
  }>;
  
  // Component joining configuration - REQUIRED, be explicit
  componentJoin: {
    strategy: "concatenate";         // How to join components before hashing
                                     // "concatenate" - join with separator string
                                     // Future: "json_array", "custom" for extensibility
    separator: string;               // REQUIRED - the string to join components with
                                     // Use "" for direct concatenation (Zendesk)
                                     // Use ":" for colon-separated (Slack)
                                     // Use "." for dot-separated (Stripe)
  };
  
  // Validation options for edge case handling
  validation?: {
    headerCaseSensitive?: boolean;   // Default: false (HTTP headers are case-insensitive)
    allowEmptyBody?: boolean;        // Default: true (some webhooks send empty bodies)
    normalizeUnicode?: boolean;      // Default: false (apply NFC normalization before hashing)
  };
}
```

This schema is fully generalized:

- **signature.source**: Extract signature from any header, query param, or body field (via JMESPath)
- **signedComponents[].source**: Each component can come from a header, body field (JMESPath), or be a literal string
- No hardcoded "timestamp" type - timestamps are just headers like any other

## Security & Edge Case Handling

### Critical: Timing Attack Prevention

The existing `verifySigningSecret()` in `trigger-auth.ts` properly uses `crypto.timingSafeEqual()`. The new `verifySignatureWithConfig()` implementation **MUST** maintain this protection:

```typescript
import { timingSafeEqual } from 'crypto';

function verifySignatureWithConfig(
  computedSignature: string,
  providedSignature: string
): boolean {
  // CRITICAL: Always use timing-safe comparison
  const computedBuffer = Buffer.from(computedSignature, 'utf8');
  const providedBuffer = Buffer.from(providedSignature, 'utf8');
  
  // Length check must also be constant-time
  if (computedBuffer.length !== providedBuffer.length) {
    // Still do a comparison to maintain constant time
    return timingSafeEqual(computedBuffer, computedBuffer) && false;
  }
  
  return timingSafeEqual(computedBuffer, providedBuffer);
}
```

### Edge Cases

| Edge Case | Default Behavior | Configurable? |
|-----------|------------------|---------------|
| **Header case sensitivity** | Case-insensitive lookup (HTTP standard) | `validation.headerCaseSensitive` |
| **Missing required component** | Fail verification with 401 | `signedComponents[].required` |
| **Missing optional component** | Treat as empty string `""` | `signedComponents[].required: false` |
| **Empty request body** | Allow (some webhooks send empty) | `validation.allowEmptyBody` |
| **Unicode normalization** | No normalization (raw bytes) | `validation.normalizeUnicode` |
| **Missing signature header** | Fail with 401 "Missing signature" | N/A (always required) |
| **Invalid regex pattern** | Fail at config validation time | N/A (validate on save) |
| **Malformed JMESPath** | Fail at config validation time | N/A (validate on save) |

### Error Response Patterns

```typescript
// Consistent error responses for signature verification failures
type SignatureVerificationError = {
  success: false;
  status: 401 | 403;
  message: string;
  code: 
    | 'MISSING_SIGNATURE'           // Signature header/param not present
    | 'MISSING_COMPONENT'           // Required signed component not found
    | 'INVALID_SIGNATURE_FORMAT'    // Couldn't parse signature (regex failed, etc.)
    | 'SIGNATURE_MISMATCH'          // Computed != provided (use generic message for security)
    | 'CREDENTIAL_RESOLUTION_FAILED'; // Couldn't retrieve signing secret
};

// IMPORTANT: For SIGNATURE_MISMATCH, use generic message to avoid leaking info
// Bad:  "Expected sha256=abc123, got sha256=xyz789"
// Good: "Invalid signature"
```

## Implementation Architecture

### JMESPath Handling

**Dependency**: Use existing [`jmespath`](https://github.com/jmespath/jmespath.js) package (already in codebase at `^0.16.0`).

**Performance Considerations**:
```typescript
// Pre-compile JMESPath expressions at config save time, not at request time
import jmespath from 'jmespath';

// During trigger create/update - validate JMESPath syntax
function validateSignedComponent(component: SignedComponent): ValidationResult {
  if (component.source === 'body' && component.key) {
    try {
      // Validate JMESPath syntax at config time by doing a test search
      // jmespath.js throws on invalid expressions
      jmespath.search({}, component.key);
      return { valid: true };
    } catch (e) {
      return { valid: false, error: `Invalid JMESPath: ${e.message}` };
    }
  }
  return { valid: true };
}

// At request time - use jmespath.search()
// The library is lightweight and fast for typical webhook payloads
// For simple dot-notation paths like "payload.data", lodash.get() is also an option
```

**Security**: JMESPath is read-only and cannot modify data, so user-provided expressions are safe. However, deeply nested or complex expressions could be slow - consider adding a complexity limit.

### Regex Handling

**Security Considerations**:
```typescript
// Validate regex at config save time
function validateRegex(pattern: string): ValidationResult {
  try {
    new RegExp(pattern);
    // Check for ReDoS vulnerability (catastrophic backtracking)
    // Consider using 'safe-regex' package or limiting pattern complexity
    return { valid: true };
  } catch (e) {
    return { valid: false, error: `Invalid regex: ${e.message}` };
  }
}

// At request time - always use with timeout protection
function extractWithRegex(value: string, pattern: string): string | null {
  const regex = new RegExp(pattern);
  const match = regex.exec(value);
  return match?.[1] ?? null; // Return first capture group
}
```

### Credential Resolution Integration

The existing flow in `TriggerService.ts` needs modification:

```typescript
// Current flow (simplified):
// 1. Get trigger from DB
// 2. Call verifySigningSecret(signingSecret, body)

// New flow:
class TriggerService {
  private credentialCache: Map<string, { secret: string; expiresAt: number }> = new Map();
  
  async processWebhook(trigger: Trigger, request: Request): Promise<Response> {
    // 1. Resolve signing secret from credential reference
    const signingSecret = await this.resolveSigningSecret(trigger);
    
    // 2. Check which verification method to use
    if (trigger.signatureVerification) {
      // New configurable verification
      const result = await verifySignatureWithConfig(
        request,
        signingSecret,
        trigger.signatureVerification
      );
      if (!result.success) {
        return new Response(result.message, { status: result.status });
      }
    } else if (trigger.signingSecret) {
      // Legacy verification (deprecated)
      const result = verifySigningSecret(c, trigger.signingSecret, body);
      if (!result.success) {
        return new Response(result.message, { status: result.status });
      }
    }
    
    // 3. Continue processing...
  }
  
  private async resolveSigningSecret(trigger: Trigger): Promise<string | null> {
    if (!trigger.signingSecretCredentialReferenceId) {
      return trigger.signingSecret ?? null; // Fallback to legacy field
    }
    
    // Check cache first
    const cached = this.credentialCache.get(trigger.signingSecretCredentialReferenceId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.secret;
    }
    
    // Resolve from credential store
    try {
      const credential = await this.credentialStore.resolve(
        trigger.signingSecretCredentialReferenceId
      );
      
      // Cache for 5 minutes (configurable)
      this.credentialCache.set(trigger.signingSecretCredentialReferenceId, {
        secret: credential.value,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      
      return credential.value;
    } catch (error) {
      logger.error('Failed to resolve signing secret credential', {
        credentialReferenceId: trigger.signingSecretCredentialReferenceId,
        error,
      });
      throw new SignatureVerificationError('CREDENTIAL_RESOLUTION_FAILED');
    }
  }
}
```

### Header Lookup Normalization

```typescript
// HTTP headers are case-insensitive per RFC 7230
function getHeader(headers: Headers, key: string, caseSensitive: boolean): string | null {
  if (caseSensitive) {
    return headers.get(key);
  }
  
  // Normalize to lowercase for comparison
  const normalizedKey = key.toLowerCase();
  for (const [name, value] of headers.entries()) {
    if (name.toLowerCase() === normalizedKey) {
      return value;
    }
  }
  return null;
}
```

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
    - Algorithm dropdown: sha256 (default), sha512, sha384, sha1⚠️, md5⚠️
      - Show deprecation warning for sha1/md5: "This algorithm is considered weak"
    - Encoding dropdown (hex, base64)
    - Signature source configuration
    - Signed components builder (add/remove/reorder)
    - Component join configuration:
      - Strategy dropdown (concatenate, with future options)
      - Separator input (required, with clear labeling for "" = direct concatenation)

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

## Provider Examples

### GitHub

**Example Request:**
```http
POST /webhook HTTP/1.1
Host: example.com
Content-Type: application/json
X-Hub-Signature-256: sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17
X-GitHub-Event: push
X-GitHub-Delivery: 72d3162e-cc78-11e3-81ab-4c9367dc0958

{"action":"opened","issue":{"number":1,"title":"Test"}}
```

**How it's signed:** `HMAC-SHA256(secret, body)` → hex encoded with `sha256=` prefix

**Signature Config:**
```typescript
{
  algorithm: "sha256",
  encoding: "hex",
  signature: {
    source: "header",
    key: "X-Hub-Signature-256",
    prefix: "sha256=",
  },
  signedComponents: [
    { source: "body" },
  ],
  componentJoin: {
    strategy: "concatenate",
    separator: "",  // Single component, separator doesn't matter
  },
}
```

---

### Zendesk

**Example Request:**
```http
POST /webhook HTTP/1.1
Host: example.com
Content-Type: application/json
X-Zendesk-Webhook-Signature: t4hmyqtP0tED7M3B4jGOwQ7BG1EGhKYpn0tz64ul8zw=
X-Zendesk-Webhook-Signature-Timestamp: 2021-03-18T19:25:00Z

{"ticket":{"id":12345,"subject":"Help needed"}}
```

**How it's signed:** `HMAC-SHA256(secret, timestamp + body)` → base64 encoded

**Signature Config:**
```typescript
{
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
  componentJoin: {
    strategy: "concatenate",
    separator: "",  // Direct concatenation: timestamp + body
  },
}
```

---

### Slack

**Example Request:**
```http
POST /webhook HTTP/1.1
Host: example.com
Content-Type: application/x-www-form-urlencoded
X-Slack-Signature: v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503
X-Slack-Request-Timestamp: 1531420618

token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&channel_id=C12345
```

**How it's signed:** `HMAC-SHA256(secret, "v0:" + timestamp + ":" + body)` → hex encoded with `v0=` prefix

**Signature Config:**
```typescript
{
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
  componentJoin: {
    strategy: "concatenate",
    separator: ":",  // Colon-separated: "v0:{timestamp}:{body}"
  },
}
```

---

### Stripe

**Example Request:**
```http
POST /webhook HTTP/1.1
Host: example.com
Content-Type: application/json
Stripe-Signature: t=1492774577,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd

{"id":"evt_123","type":"payment_intent.succeeded"}
```

**How it's signed:** `HMAC-SHA256(secret, timestamp + "." + body)` → hex encoded, header format `t={timestamp},v1={signature}`

**Signature Config:**
```typescript
{
  algorithm: "sha256",
  encoding: "hex",
  signature: {
    source: "header",
    key: "Stripe-Signature",
    // Note: Stripe's format requires custom parsing to extract v1 value
    // The header is: t=1492774577,v1=5257a869...
    // We need to parse out the v1= portion
    regex: "v1=([a-f0-9]+)",  // Extract signature using regex
  },
  signedComponents: [
    { source: "header", key: "Stripe-Signature", regex: "t=([0-9]+)" },  // Extract timestamp
    { source: "body" },
  ],
  componentJoin: {
    strategy: "concatenate",
    separator: ".",  // Dot-separated: "{timestamp}.{body}"
  },
}
```

> **Note:** Stripe's format is more complex with embedded timestamp. This may require adding a `regex` option to extract values from composite header formats, or we document that Stripe requires a specialized handler.

---

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
    componentJoin: {
      strategy: "concatenate",
      separator: "",  // Single component, separator not used
    },
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
    componentJoin: {
      strategy: "concatenate",
      separator: "",  // Direct concatenation: timestamp + body
    },
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
    componentJoin: {
      strategy: "concatenate",
      separator: ":",  // Colon-separated: "v0:{timestamp}:{body}"
    },
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
    componentJoin: {
      strategy: "concatenate",
      separator: "",  // Single component, separator not used
    },
  },
});
```

## Migration Strategy

1. New fields are additive; existing `signingSecret` continues to work
2. When `signatureVerification` is present, use new configurable logic
3. When only `signingSecret` is set, use legacy hardcoded logic (`X-Signature-256` header, `sha256={hex}` format)
4. Deprecation warning in docs for `signingSecret` field

## Implementation Tasks

### Core Implementation
- [ ] Add `signatureVerification` and `signingSecretCredentialReferenceId` to triggers table schema
- [ ] Generate database migration for new trigger columns
- [ ] Create `SignatureVerificationConfigSchema` and update trigger schemas
  - Include `validation` options (headerCaseSensitive, allowEmptyBody, normalizeUnicode)
  - Include `required` field on signedComponents
- [ ] Implement configurable `verifySignatureWithConfig()` in `trigger-auth.ts`
  - **CRITICAL**: Use `crypto.timingSafeEqual()` for all signature comparisons
  - Implement case-insensitive header lookup (default behavior)
  - Handle missing required vs optional components
  - Add Unicode normalization option (NFC)
- [ ] Update `TriggerService` to resolve credentials and use new verification
  - Implement credential caching (5 min TTL)
  - Handle credential resolution failures gracefully
- [ ] Update `trigger()` SDK builder to accept new configuration options
- [ ] Handle new fields in trigger create/update API routes
- [ ] Add credential selector and verification config to trigger form UI
- [ ] Add unit and integration tests for configurable signature verification

### Security & Validation
- [ ] Validate JMESPath expressions at config save time (not request time)
  - Use existing `jmespath` package (already in codebase)
  - Return clear error messages for invalid expressions
- [ ] Validate regex patterns at config save time
  - Consider ReDoS protection (safe-regex or complexity limits)
- [ ] Implement consistent error response codes (see Error Response Patterns)
  - Never leak signature details in error messages
- [ ] Add edge case tests:
  - Missing signature header → 401 MISSING_SIGNATURE
  - Missing required component → 401 MISSING_COMPONENT  
  - Invalid signature format → 401 INVALID_SIGNATURE_FORMAT
  - Signature mismatch → 403 SIGNATURE_MISMATCH (generic message)
  - Empty body with allowEmptyBody: true/false
  - Unicode content with normalizeUnicode: true/false
  - Case-sensitive vs case-insensitive header lookup

### Documentation Updates
- [ ] Update `agents-docs/content/typescript-sdk/triggers.mdx` with new configuration options and provider examples
- [ ] Update `packages/agents-sdk/README.md` with signature verification examples
- [ ] Add inline JSDoc comments to new schema types and functions
- [ ] Document migration path from deprecated `signingSecret` field

### Package Versioning
- [ ] Create changeset for affected packages using `pnpm bump` command:
  - `agents-core` (minor) - new schema, validation, and verification logic
  - `agents-sdk` (minor) - new trigger builder options
  - `agents-manage-ui` (patch) - UI updates for signature config

### Algorithm Support (RESOLVED)

**Decision**: Support the **5 most common** HMAC algorithms used by webhook providers.

**Implementation**: Use Node.js built-in `crypto` module (`crypto.createHmac(algorithm, secret)`). 
- ✅ No third-party packages required
- ✅ Stable across Node.js versions (LTS supported)
- ✅ Well-maintained by Node.js core team
- ✅ FIPS-compliant when needed

**Supported Algorithms:**

| Algorithm | Usage | Notes |
|-----------|-------|-------|
| `sha256` | ⭐ Primary | Most common - GitHub, Slack, Stripe, Zendesk, Shopify, etc. |
| `sha512` | High security | Used by security-focused systems |
| `sha384` | Moderate security | TLS cipher suites, some enterprise systems |
| `sha1` | ⚠️ Legacy | Older GitHub webhooks, Twilio, Facebook (legacy). **Show deprecation warning in UI** |
| `md5` | ⚠️ Legacy | Some very old systems. **Show deprecation warning in UI** |

**Excluded algorithms** (not commonly used for webhooks):
- SHA-3 variants (sha3-256, sha3-384, sha3-512) - Rarely used by webhook providers
- BLAKE2 variants - Not used by any major webhook provider
- RIPEMD - Not used for webhooks

**Security warnings**: When users select `sha1` or `md5`, display a warning in the UI:
> "This algorithm is considered weak for new implementations. Consider using sha256 or sha512 if your webhook provider supports it."

## References

- [GitHub Webhook Signature Verification](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [Zendesk Webhook Verification](https://developer.zendesk.com/documentation/webhooks/verifying/)
- [Slack Request Verification](https://api.slack.com/authentication/verifying-requests-from-slack)
