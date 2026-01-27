# @inkeep/agents-sdk

SDK for building and managing agents in the Inkeep Agent Framework.

## Installation

```bash
npm install @inkeep/agents-sdk
```

## Usage

```typescript
import { agent, subAgent, tool } from '@inkeep/agents-sdk';

// Create a sub-agent
const mySubAgent = subAgent({
  id: 'my-sub-agent',
  name: 'My Sub Agent',
  description: 'A helpful sub-agent',
  prompt: 'You are a helpful assistant.',
});

// Create an agent
export const myAgent = agent({
  id: 'my-agent',
  name: 'My Agent',
  description: 'My agent',
  defaultSubAgent: mySubAgent,
  subAgents: () => [mySubAgent],
});
```

## Credential Management

The SDK provides a clean abstraction for credential management through `InkeepCredentialProvider`:

```typescript
import { InkeepCredentialProvider, createCredentialProvider } from '@inkeep/agents-sdk';

// Simple memory-based storage (default)
const credentials = new InkeepCredentialProvider();

// Or use the factory function
const credentials = createCredentialProvider({ type: 'memory' });

// Store and retrieve credentials
await credentials.set('my-api-key', 'secret-value');
const key = await credentials.get('my-api-key');

// Environment variables are automatically available
process.env.MY_TOKEN = 'env-token';
const token = await credentials.get('MY_TOKEN'); // Returns 'env-token'
```

### Credential Provider Types

| Type | Description | Requirements |
|------|-------------|--------------|
| `memory` | In-memory storage with env var fallback | None (default) |
| `keychain` | OS keychain storage | `@napi-rs/keyring` package |
| `nango` | OAuth credential management | `@nangohq/node`, `@nangohq/types` |
| `custom` | Your own implementation | Implement `CredentialStore` interface |

### Advanced: Nango Integration

For OAuth-based credentials (requires optional packages):

```bash
npm install @nangohq/node @nangohq/types
```

```typescript
const credentials = new InkeepCredentialProvider({
  type: 'nango',
  secretKey: process.env.NANGO_SECRET_KEY,
});
```

## Telemetry

Telemetry is **opt-in** and disabled by default. The SDK provides abstractions for custom telemetry backends:

```typescript
import {
  InkeepTelemetryProvider,
  createConsoleTelemetryProvider,
  createOpenTelemetryProvider,
} from '@inkeep/agents-sdk';

// No-op (default - no telemetry overhead)
const telemetry = new InkeepTelemetryProvider();

// Console-based logging (for development)
const telemetry = createConsoleTelemetryProvider('my-agent');

// OpenTelemetry (requires @opentelemetry packages)
const telemetry = await createOpenTelemetryProvider({
  serviceName: 'my-agent',
  endpoint: 'http://localhost:4318',
});

// Use the tracer
const tracer = telemetry.getTracer('my-component');
tracer.startActiveSpan('my-operation', (span) => {
  span.setAttribute('key', 'value');
  // ... your code
  span.end();
});
```

### Telemetry Provider Types

| Provider | Description | Requirements |
|----------|-------------|--------------|
| `NoOpTelemetryProvider` | Does nothing (default) | None |
| `ConsoleTelemetryProvider` | Logs to console | None |
| Custom OpenTelemetry | Full observability | `@opentelemetry/*` packages |

## Webhook Triggers with Signature Verification

Webhook triggers allow your agents to be invoked by external services like GitHub, Slack, Stripe, and Zendesk. The SDK provides flexible HMAC signature verification to ensure webhook requests are authentic.

### Basic Webhook Trigger

Create a simple webhook trigger without signature verification:

```typescript
import { trigger, credentialReference } from '@inkeep/agents-sdk';

export const myWebhook = trigger({
  id: 'github-webhook',
  name: 'GitHub Webhook',
  description: 'Triggered by GitHub push events',
});
```

### Webhook Signature Verification

Different webhook providers use different signature patterns. The SDK supports all common patterns through flexible configuration.

#### Quick Examples

**GitHub Webhooks:**

```typescript
import { trigger, credentialReference } from '@inkeep/agents-sdk';

export const githubWebhook = trigger({
  id: 'github-webhook',
  name: 'GitHub Webhook',
  description: 'Verified GitHub webhook',
  signingSecretCredentialReference: credentialReference({
    id: 'github-webhook-secret',
  }),
  signatureVerification: {
    algorithm: 'sha256',
    encoding: 'hex',
    signature: {
      source: 'header',
      key: 'X-Hub-Signature-256',
      prefix: 'sha256=',
    },
    signedComponents: [
      {
        source: 'body',
        required: true,
      },
    ],
    componentJoin: {
      strategy: 'concatenate',
      separator: '',
    },
  },
});
```

**Slack Webhooks:**

```typescript
export const slackWebhook = trigger({
  id: 'slack-webhook',
  name: 'Slack Webhook',
  description: 'Verified Slack webhook',
  signingSecretCredentialReference: credentialReference({
    id: 'slack-signing-secret',
  }),
  signatureVerification: {
    algorithm: 'sha256',
    encoding: 'hex',
    signature: {
      source: 'header',
      key: 'X-Slack-Signature',
      prefix: 'v0=',
    },
    signedComponents: [
      {
        source: 'literal',
        value: 'v0',
        required: true,
      },
      {
        source: 'header',
        key: 'X-Slack-Request-Timestamp',
        required: true,
      },
      {
        source: 'body',
        required: true,
      },
    ],
    componentJoin: {
      strategy: 'concatenate',
      separator: ':',
    },
  },
});
```

**Zendesk Webhooks:**

```typescript
export const zendeskWebhook = trigger({
  id: 'zendesk-webhook',
  name: 'Zendesk Webhook',
  description: 'Verified Zendesk webhook',
  signingSecretCredentialReference: credentialReference({
    id: 'zendesk-signing-secret',
  }),
  signatureVerification: {
    algorithm: 'sha256',
    encoding: 'base64',
    signature: {
      source: 'header',
      key: 'X-Zendesk-Webhook-Signature',
    },
    signedComponents: [
      {
        source: 'header',
        key: 'X-Zendesk-Webhook-Signature-Timestamp',
        required: true,
      },
      {
        source: 'body',
        required: true,
      },
    ],
    componentJoin: {
      strategy: 'concatenate',
      separator: '',
    },
  },
});
```

**Stripe Webhooks:**

```typescript
export const stripeWebhook = trigger({
  id: 'stripe-webhook',
  name: 'Stripe Webhook',
  description: 'Verified Stripe webhook',
  signingSecretCredentialReference: credentialReference({
    id: 'stripe-webhook-secret',
  }),
  signatureVerification: {
    algorithm: 'sha256',
    encoding: 'hex',
    signature: {
      source: 'header',
      key: 'Stripe-Signature',
      regex: 'v1=([a-f0-9]+)',
    },
    signedComponents: [
      {
        source: 'header',
        key: 'Stripe-Signature',
        regex: 't=([0-9]+)',
        required: true,
      },
      {
        source: 'body',
        required: true,
      },
    ],
    componentJoin: {
      strategy: 'concatenate',
      separator: '.',
    },
  },
});
```

### Configuration Reference

#### SignatureVerificationConfig

The `signatureVerification` object configures how webhook signatures are verified.

**Fields:**

- `algorithm` - HMAC algorithm: `'sha256'` | `'sha512'` | `'sha384'` | `'sha1'` | `'md5'`
  - **Recommended:** `'sha256'` (most secure and widely supported)
  - **Warning:** `'sha1'` and `'md5'` are cryptographically weak and only supported for legacy systems

- `encoding` - Signature encoding: `'hex'` | `'base64'`
  - **Default:** `'hex'` (used by most providers)

- `signature` - Where and how to extract the signature from the request

- `signedComponents` - Array of components that make up the signed data

- `componentJoin` - How to join multiple components before verification

- `validation` (optional) - Advanced validation options

#### Signature Source

The `signature` field specifies where to find the signature in the webhook request.

**Fields:**

- `source` - Location: `'header'` | `'query'` | `'body'`
  - `'header'` - Extract from HTTP header (most common)
  - `'query'` - Extract from URL query parameter
  - `'body'` - Extract from request body using JMESPath

- `key` - Identifier for the signature:
  - For headers: Header name (e.g., `'X-Hub-Signature-256'`)
  - For query params: Parameter name (e.g., `'signature'`)
  - For body: JMESPath expression (e.g., `'signature'` or `'headers."X-Signature"'`)

- `prefix` (optional) - Prefix to strip from signature (e.g., `'sha256='`, `'v0='`)

- `regex` (optional) - Regular expression with capture group for complex formats (e.g., `'v1=([a-f0-9]+)'`)

#### Signed Components

The `signedComponents` array specifies what data was signed by the webhook provider. Components are joined in order using the `componentJoin` configuration.

**Component Fields:**

- `source` - Component location: `'header'` | `'body'` | `'literal'`
  - `'header'` - Extract from HTTP header
  - `'body'` - Extract from request body (uses entire body as string)
  - `'literal'` - Use a fixed string value

- `key` (optional) - Identifier:
  - For headers: Header name (e.g., `'X-Slack-Request-Timestamp'`)
  - For body: JMESPath expression (e.g., `'data.timestamp'`)
  - Not used for literal components

- `value` (optional) - Static string value (only for `source: 'literal'`)

- `regex` (optional) - Regex with capture group to extract part of the value

- `required` - Whether component must be present (default: `true`)
  - If `false`, missing components are treated as empty strings

#### Component Join

The `componentJoin` field specifies how to combine multiple signed components.

**Fields:**

- `strategy` - Join strategy: `'concatenate'` (only option currently)

- `separator` - String to insert between components:
  - `''` (empty) - Direct concatenation (GitHub, Zendesk)
  - `':'` - Colon separator (Slack)
  - `'.'` - Dot separator (Stripe)

#### Advanced Validation Options

The optional `validation` field provides fine-grained control over verification behavior.

**Fields:**

- `headerCaseSensitive` (default: `false`) - Whether header names are case-sensitive
  - `false` - Case-insensitive matching (HTTP standard, recommended)
  - `true` - Exact case match required

- `allowEmptyBody` (default: `true`) - Whether to allow requests with empty bodies
  - `true` - Empty bodies are valid (some webhooks send header-only verification requests)
  - `false` - Reject requests with empty bodies

- `normalizeUnicode` (default: `false`) - Whether to normalize Unicode to NFC form
  - `false` - Use raw body bytes
  - `true` - Normalize to NFC before verification (handles different Unicode representations)

**Example with validation options:**

```typescript
signatureVerification: {
  algorithm: 'sha256',
  encoding: 'hex',
  signature: {
    source: 'header',
    key: 'X-Signature',
  },
  signedComponents: [{ source: 'body', required: true }],
  componentJoin: { strategy: 'concatenate', separator: '' },
  validation: {
    headerCaseSensitive: true,
    allowEmptyBody: false,
    normalizeUnicode: true,
  },
},
```

### Migration from Legacy `signingSecret`

**Breaking Change:** The legacy `signingSecret` parameter has been removed. All triggers must use credential references and the new `signatureVerification` configuration.

**Before (deprecated):**

```typescript
export const webhook = trigger({
  id: 'my-webhook',
  signingSecret: 'my-secret-key', // ❌ No longer supported
});
```

**After (current):**

```typescript
export const webhook = trigger({
  id: 'my-webhook',
  signingSecretCredentialReference: credentialReference({
    id: 'webhook-secret',
  }),
  signatureVerification: {
    algorithm: 'sha256',
    encoding: 'hex',
    signature: {
      source: 'header',
      key: 'X-Hub-Signature-256',
      prefix: 'sha256=',
    },
    signedComponents: [{ source: 'body', required: true }],
    componentJoin: { strategy: 'concatenate', separator: '' },
  },
});
```

### Security Best Practices

1. **Always use credential references** - Never hardcode signing secrets in your code
2. **Use strong algorithms** - Prefer `sha256` or stronger; avoid `sha1` and `md5`
3. **Validate all webhooks** - Always configure signature verification for production webhooks
4. **Use HTTPS** - Always receive webhooks over HTTPS to prevent man-in-the-middle attacks
5. **Rotate secrets regularly** - Update signing secrets periodically
6. **Monitor failed verifications** - Failed signature checks may indicate an attack

### Troubleshooting

**Signature verification always fails:**

1. Verify your signing secret is correct in the credential store
2. Check that the `algorithm` matches what the provider uses
3. Verify the `encoding` (hex vs base64)
4. Ensure `signedComponents` match what the provider actually signs
5. Check the `separator` in `componentJoin`
6. For body-based components, ensure you're not modifying the raw body

**Provider-specific tips:**

- **GitHub:** Requires `prefix: 'sha256='` and signs only the raw body
- **Slack:** Signs three components with colons: `v0:{timestamp}:{body}`
- **Stripe:** Uses regex extraction for both signature and timestamp from the same header
- **Zendesk:** Uses base64 encoding instead of hex

## API Reference

### Builders

- `agent()` - Create an agent (top-level container with multiple sub-agents)
- `subAgent()` - Create a sub-agent configuration
- `tool()` - Create a tool configuration
- `trigger()` - Create a webhook trigger configuration
- `mcpServer()` - Create an MCP server configuration
- `mcpTool()` - Create an MCP tool
- `dataComponent()` - Create a data component
- `artifactComponent()` - Create an artifact component
- `externalAgent()` - Create an external agent reference
- `transfer()` - Create a transfer configuration

### Classes

- `Agent` - Agent class for runtime operations
- `AgentGraph` - Graph management and operations
- `Tool` - Base tool class
- `Runner` - Graph execution runner

### Credential Management

- `InkeepCredentialProvider` - Main credential provider class
- `createCredentialProvider()` - Factory function for creating providers

### Telemetry

- `InkeepTelemetryProvider` - Main telemetry provider class
- `createNoOpTelemetryProvider()` - Create disabled telemetry
- `createConsoleTelemetryProvider()` - Create console-based telemetry
- `createOpenTelemetryProvider()` - Create OpenTelemetry-based telemetry

## Version Compatibility

This section documents how SDK versions relate to Inkeep Cloud runtime versions.

### Versioning Strategy

The SDK follows [Semantic Versioning](https://semver.org/):

- **Major versions** (X.0.0): Breaking changes to the SDK API
- **Minor versions** (0.X.0): New features, backward compatible
- **Patch versions** (0.0.X): Bug fixes, backward compatible

### SDK to Runtime Compatibility

| SDK Version | Minimum Runtime Version | Notes |
|-------------|------------------------|-------|
| 0.38.x | 0.38.0 | Current stable |

### Breaking Change Policy

1. **Deprecation Notice**: Features are marked deprecated at least one minor version before removal
2. **Migration Guide**: Breaking changes include migration documentation
3. **Runtime Compatibility**: SDK versions are tested against specific runtime versions

### Upgrade Path

When upgrading the SDK:

1. Check the [CHANGELOG](./CHANGELOG.md) for breaking changes
2. Update any deprecated API usage
3. Test with your target runtime version
4. For major upgrades, follow the migration guide

### Optional Dependencies

The SDK has minimal required dependencies. Advanced features require optional packages:

| Feature | Required Packages |
|---------|------------------|
| Nango credentials | `@nangohq/node`, `@nangohq/types` |
| Keychain storage | `@napi-rs/keyring` |
| OpenTelemetry | `@opentelemetry/api`, `@opentelemetry/sdk-node` |

Install only what you need:

```bash
# Core SDK only (push/pull, memory credentials)
npm install @inkeep/agents-sdk

# With Nango OAuth support
npm install @inkeep/agents-sdk @nangohq/node @nangohq/types

# With OpenTelemetry
npm install @inkeep/agents-sdk @opentelemetry/api @opentelemetry/sdk-node
```
