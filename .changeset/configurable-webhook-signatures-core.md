---
"@inkeep/agents-core": minor
---

BREAKING: Replace hardcoded webhook signature verification with flexible, provider-agnostic configuration

This major version removes the legacy `signingSecret` field from triggers and replaces it with a flexible signature verification system that supports GitHub, Slack, Stripe, Zendesk, and other webhook providers.

**Breaking Changes:**

- Removed `signingSecret` column from triggers table (database migration required)
- Removed `signingSecret` parameter from TriggerInsertSchema, TriggerUpdateSchema, and TriggerApiInsert
- Removed `verifySigningSecret()` function from trigger-auth.ts
- Triggers now require `signingSecretCredentialReferenceId` and `signatureVerification` configuration for signature verification

**New Features:**

- Added `SignatureVerificationConfig` type supporting:
  - Multiple HMAC algorithms: sha256, sha512, sha384, sha1, md5
  - Multiple encodings: hex, base64
  - Flexible signature extraction from headers, query parameters, or body
  - Multi-component signing with configurable separators
  - Regex extraction for complex signature formats
  - Advanced validation options (case sensitivity, empty body handling, Unicode normalization)
- Added `verifySignatureWithConfig()` function with timing-safe signature comparison
- Added validation utilities: `validateJMESPath()`, `validateRegex()`
- Added comprehensive unit tests and integration tests
- Added credential resolution with 5-minute caching in TriggerService

**Migration Guide:**

Before (deprecated):
```typescript
const trigger = {
  signingSecret: 'my-secret'
};
```

After:
```typescript
const trigger = {
  signingSecretCredentialReferenceId: 'credential-ref-id',
  signatureVerification: {
    algorithm: 'sha256',
    encoding: 'hex',
    signature: { source: 'header', key: 'X-Hub-Signature-256', prefix: 'sha256=' },
    signedComponents: [{ source: 'body', required: true }],
    componentJoin: { strategy: 'concatenate', separator: '' }
  }
};
```

See SDK documentation for complete examples for GitHub, Slack, Stripe, and Zendesk webhooks.
