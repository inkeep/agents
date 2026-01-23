---
"@inkeep/agents-sdk": minor
---

BREAKING: Replace hardcoded webhook signature verification with flexible, provider-agnostic configuration

This major version removes the legacy `signingSecret` parameter from the `trigger()` builder function and replaces it with a flexible signature verification system.

**Breaking Changes:**

- Removed `signingSecret` parameter from `trigger()` builder function
- Triggers now require `signingSecretCredentialReference` and `signatureVerification` configuration for signature verification

**New Features:**

- Added `signatureVerification` parameter to `trigger()` with validation
- Exported `SignatureVerificationConfig`, `SignatureSource`, and `SignedComponent` types
- Added validation at trigger creation time for JMESPath and regex patterns
- Added comprehensive JSDoc documentation with examples for GitHub, Slack, Stripe, and Zendesk

**Migration Guide:**

Before (deprecated):
```typescript
export const webhook = trigger({
  id: 'my-webhook',
  signingSecret: 'my-secret' // ❌ No longer supported
});
```

After:
```typescript
export const webhook = trigger({
  id: 'my-webhook',
  signingSecretCredentialReference: credentialReference({
    id: 'webhook-secret'
  }),
  signatureVerification: {
    algorithm: 'sha256',
    encoding: 'hex',
    signature: { source: 'header', key: 'X-Hub-Signature-256', prefix: 'sha256=' },
    signedComponents: [{ source: 'body', required: true }],
    componentJoin: { strategy: 'concatenate', separator: '' }
  }
});
```

See README.md for complete configuration reference and provider-specific examples.
