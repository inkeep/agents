# Signed-URL Media Proxy on /run Domain — Spec

**Status:** Draft
**Owner(s):** Andrew
**Last updated:** 2026-03-19
**Links:**
- Predecessor: PR #2782 (FileUIPart output compliance)
- Evidence: `./evidence/auth-infrastructure.md`
- Related: `specs/2026-03-19-file-ui-part-output-compliance/SPEC.md`

---

## 1) Problem statement
- **Who is affected:** End-user clients (Vercel AI SDK `useChat()`, widgets, custom SDK consumers) that load conversation history containing file attachments (images, PDFs)
- **What pain:** PR #2782 fixed the FileUIPart output shape, but the proxy URLs point to `/manage/tenants/.../media/...` which requires `requireProjectPermission('view')` — admin/builder RBAC auth. End-user clients authenticate via anonymous session JWTs or API keys (run-domain auth), not manage-domain credentials. The Vercel AI SDK renders `FileUIPart.url` as `<img src={url}>` — plain GET requests with no `Authorization` header. **Images in conversation history are unfetchable by the intended consumers.**
- **Why now:** PR #2782 made the response shape correct but the URLs inaccessible. File parts (images + PDFs via PR #2709) are now flowing through the system. This is the missing piece for end-to-end file rendering.
- **Current workaround:** None for end-user clients. The manage UI works because it has admin session auth.

## 2) Goals
- G1: End-user clients can render file attachments from conversation history via `<img src={url}>` without custom auth code
- G2: Media URLs are time-limited (expire after a configurable duration)
- G3: Media URLs are tamper-proof (HMAC-signed, can't be modified to access other files)
- G4: No new client-side code required — the URL itself carries auth

## 3) Non-goals
- NG1: Replace the manage-domain media proxy — it stays for admin use
- NG2: Real-time media streaming (video/audio) — this is file download only
- NG3: Upload flow changes — only the read/download path is affected
- NG4: CDN/edge caching of media — proxy serves from blob storage directly

## 4) Personas / consumers
- **P1: Vercel AI SDK client** — Uses `useChat()`, renders `FileUIPart.url` as `<img src>`. Cannot add auth headers. Primary target.
- **P2: Widget embed** — Iframe-embedded widget rendering conversation history. Same constraint as P1.
- **P3: Server-to-server API consumer** — Could use Authorization headers, but benefits from signed URLs for simplicity.

## 5) User journeys

### P1: Render image from conversation history
1. Client calls `GET /run/v1/conversations/{id}` (authenticated via JWT or API key)
2. Response contains `{ type: 'file', mediaType: 'image/png', url: 'https://api.example.com/run/v1/media/{mediaKey}?expires=1711036800&sig=abc123' }`
3. Client renders `<img src={url}>` — browser makes plain GET
4. Server validates signature + expiry → serves image with correct Content-Type
5. Image renders in the UI

### Failure paths
- **Expired URL:** Server returns 403. Client re-fetches conversation (new signed URLs) and re-renders.
- **Tampered URL:** Server returns 403. Attacker cannot modify path/params to access other files.
- **Invalid media key:** Server returns 404.
- **Blob storage failure:** Server returns 502.

## 6) Requirements

### Functional requirements
| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | R1: New media proxy route on `/run` domain | `GET /run/v1/media/:mediaKey` serves files from blob storage | Public route with `noAuth()` — signature IS the auth |
| Must | R2: HMAC-SHA256 URL signing | URLs contain `expires` (unix timestamp) and `sig` (HMAC hex) query params | 1-way door: signing format |
| Must | R3: Signature validation | Proxy rejects expired or tampered URLs with 403 | Security boundary |
| Must | R4: `resolveMessageBlobUris()` generates signed `/run` URLs | File parts in conversation responses have fetchable signed URLs | Replaces current `/manage` URLs |
| Must | R5: Path traversal protection | Same validation as manage proxy — reject `..`, null bytes, backslashes | Existing pattern |
| Should | R6: Configurable expiry duration | Default 1 hour, configurable via env var | Reversible |
| Should | R7: Cache-Control headers on served media | `Cache-Control: private, max-age={remainingTTL}, immutable` where remainingTTL = expires - now | Optimize repeat loads within expiry window |
| Could | R8: Signing secret rotation support | Accept current + previous secret, validate against both | Future-proofing |

### Non-functional requirements
- **Performance:** Signing is <0.1ms per URL (HMAC is fast). No additional latency vs current proxy.
- **Security:** URLs are time-limited and tamper-proof. Blob storage keys are content-addressed (SHA256). An attacker would need both the signing secret AND a valid storage key to forge a URL.
- **Operability:** Log signature validation failures for monitoring.

## 7) Success metrics & instrumentation
- **Metric:** End-user clients can render images from conversation history without 403 errors
- **Instrumentation:** Log and trace span for signature validation (pass/fail/expired), media download (success/not-found/error)

## 8) Current state (how it works today)

### Flow with PR #2782

```
DB: { kind: 'file', data: 'blob://v1/t_{tenant}/media/...', metadata: { mimeType: 'image/png' } }
  │
  ├── resolveMessageBlobUris() → converts blob:// to manage proxy URL
  │     url: https://api.example.com/manage/tenants/{t}/projects/{p}/conversations/{c}/media/{key}
  │
  ├── toVercelMessage() → reshapes to FileUIPart
  │     { type: 'file', url: 'https://.../manage/tenants/...', mediaType: 'image/png' }
  │
  └── Client: <img src="https://.../manage/tenants/...">
        → 403 Forbidden (client has run-domain auth, not manage-domain auth)
```

### Key constraints
- `resolveMessageBlobUris()` is the single point where blob URIs become HTTP URLs — this is where signing happens
- The manage proxy at `/manage/.../media/:mediaKey` uses `requireProjectPermission('view')` — admin auth
- `INKEEP_ANON_JWT_SECRET` exists and is already used for run-domain JWT signing — can be reused for HMAC signing
- `noAuth()` is the established pattern for routes that handle their own auth (webhooks, OAuth callbacks)
- Storage keys contain all identity info: `v1/t_{tenantId}/media/p_{projectId}/conv/c_{conversationId}/m_{messageId}/sha256-{hash}.{ext}`

## 9) Proposed solution (vertical slice)

### URL format

```
/run/v1/media/{encodedStorageKey}?expires={unixTimestamp}&sig={hmacHex}
```

Where:
- `encodedStorageKey` = URL-encoded blob storage key (e.g., `v1%2Ft_tenant%2Fmedia%2Fp_project%2Fconv%2Fc_conv%2Fm_msg%2Fsha256-hash.png`)
- `expires` = Unix timestamp when the URL becomes invalid
- `sig` = HMAC-SHA256 of `{storageKey}:{expires}` using the signing secret, hex-encoded

### Signing utility

```typescript
// agents-api/src/domains/run/services/blob-storage/media-url-signing.ts

import { createHmac } from 'node:crypto';
import { env } from '../../../../env';

const DEFAULT_EXPIRY_SECONDS = 3600; // 1 hour

function getSigningSecret(): string {
  // Reuse the anon JWT secret — it's already required in production
  // and has the same lifecycle as run-domain auth
  const secret = env.INKEEP_ANON_JWT_SECRET;
  if (!secret) {
    if (env.ENVIRONMENT !== 'development' && env.ENVIRONMENT !== 'test') {
      throw new Error('INKEEP_ANON_JWT_SECRET required for media URL signing');
    }
    return 'dev-media-signing-secret';
  }
  return secret;
}

export function signMediaUrl(storageKey: string, baseUrl: string): string {
  const expires = Math.floor(Date.now() / 1000) + DEFAULT_EXPIRY_SECONDS;
  const payload = `${storageKey}:${expires}`;
  const sig = createHmac('sha256', getSigningSecret()).update(payload).digest('hex');
  const encodedKey = encodeURIComponent(storageKey);
  return `${baseUrl}/run/v1/media/${encodedKey}?expires=${expires}&sig=${sig}`;
}

export function verifyMediaSignature(storageKey: string, expires: number, sig: string): boolean {
  if (Math.floor(Date.now() / 1000) > expires) return false;
  const payload = `${storageKey}:${expires}`;
  const expected = createHmac('sha256', getSigningSecret()).update(payload).digest('hex');
  return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
}
```

### Media proxy route

```typescript
// New route in agents-api/src/domains/run/routes/media.ts
// Registered as: app.route('/v1/media', mediaRoutes) in run/index.ts

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/:mediaKey',
    permission: noAuth(), // Signature IS the auth
    security: [],
    // ...
  }),
  async (c) => {
    const encodedKey = c.req.param('mediaKey');
    const expires = Number(c.req.query('expires'));
    const sig = c.req.query('sig');

    // Validate params
    if (!expires || !sig) return c.json({ error: 'Missing signature' }, 403);

    // Decode and validate path
    const storageKey = decodeURIComponent(encodedKey);
    if (hasPathTraversal(storageKey)) return c.json({ error: 'Invalid key' }, 400);

    // Verify signature + expiry
    if (!verifyMediaSignature(storageKey, expires, sig)) {
      return c.json({ error: 'Invalid or expired signature' }, 403);
    }

    // Download and serve (same as manage proxy)
    const storage = getBlobStorageProvider();
    const result = await storage.download(storageKey);
    const remainingTTL = expires - Math.floor(Date.now() / 1000);
    return new Response(result.data, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': `private, max-age=${remainingTTL}, immutable`,
      },
    });
  }
);
```

### Update resolveMessageBlobUris()

Change `resolveMessageBlobUris()` to generate signed `/run` URLs instead of unsigned `/manage` URLs:

```typescript
// Before:
const proxyUrl = `${apiBaseUrl}/manage/tenants/${parsed.tenantId}/...`;
return [{ ...part, data: proxyUrl }];

// After:
const signedUrl = signMediaUrl(key, apiBaseUrl);
return [{ ...part, data: signedUrl }];
```

This is a single-line change — the URL construction moves from inline string interpolation to the `signMediaUrl()` function.

### Files to create/modify

| File | Action | Description |
|---|---|---|
| `agents-api/src/domains/run/services/blob-storage/media-url-signing.ts` | **Create** | `signMediaUrl()` + `verifyMediaSignature()` |
| `agents-api/src/domains/run/routes/media.ts` | **Create** | Proxy route with signature validation |
| `agents-api/src/domains/run/index.ts` | **Modify** | Register media route |
| `agents-api/src/domains/run/services/blob-storage/resolve-blob-uris.ts` | **Modify** | Use `signMediaUrl()` instead of manage proxy URL |
| `agents-api/src/__tests__/run/routes/media.test.ts` | **Create** | Tests for proxy + signing |
| `agents-api/src/__tests__/run/services/resolve-blob-uris.test.ts` | **Modify** | Update assertions for signed URL format |

### Alternatives considered

**Option A: New dedicated `INKEEP_MEDIA_SIGNING_SECRET` env var**
- Pro: Separation of concerns — media signing independent of JWT signing
- Con: Yet another secret to configure, deploy, rotate. Same lifecycle as the JWT secret anyway.
- **Rejected:** Unnecessary operational overhead for the same security posture.

**Option B: Use JWT tokens in URLs instead of HMAC**
- Pro: Could carry richer claims (tenantId, permissions)
- Con: JWTs are ~3-5x longer than HMAC signatures (URL bloat), slower to verify, overkill for this use case
- **Rejected:** HMAC is the standard for URL signing (S3, GCS, Azure all use HMAC).

**Option C: Derive a media-specific key from the JWT secret**
- `mediaSecret = HMAC(JWT_SECRET, "media-signing-v1")`
- Pro: Separates the key material without a new env var
- Con: Adds indirection for no practical benefit
- **Acceptable alternative** but unnecessary complexity.

## 10) Decision log

| ID | Decision | Type | 1-way door? | Status | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Reuse `INKEEP_ANON_JWT_SECRET` for HMAC signing | T | No | Pending | Same lifecycle as run-domain auth; avoids new env var | evidence/auth-infrastructure.md §1 | If JWT secret rotates, media URLs also invalidate (acceptable — they expire anyway) |
| D2 | URL format: `/run/v1/media/{key}?expires=X&sig=Y` | T | Yes (public API) | Pending | Storage key in path, signature in query — standard pattern | — | 1-way door: once clients cache URLs, format can't change |
| D3 | Use `noAuth()` for the media proxy route | T | No | Pending | Signature IS the auth — same pattern as webhooks | evidence/auth-infrastructure.md §6 | Route is publicly accessible; security depends entirely on signature |
| D4 | Default 1-hour expiry | P | No | Pending | Long enough that conversation UIs don't refresh constantly; short enough that shared/leaked URLs expire quickly | — | Configurable later |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | Should the signing secret be derived from `INKEEP_ANON_JWT_SECRET` or used directly? | T | P1 | No | Using directly is simpler. Derivation adds indirection for no practical benefit. | Leaning: use directly |
| Q2 | Should we keep the manage-domain proxy working alongside the new run-domain proxy? | P | P1 | No | Yes — manage UI uses it with admin auth. No reason to remove. | Leaning: keep both |
| Q3 | What happens when the conversation endpoint is called but `INKEEP_ANON_JWT_SECRET` is not set (dev/test)? | T | P1 | No | Fall back to a deterministic dev secret (same pattern as `getAnonJwtSecret`). URLs still work locally. | Resolved in design |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `INKEEP_ANON_JWT_SECRET` is always set in production | HIGH | Env validation already enforces this in production mode | — | Active |
| A2 | Storage keys are safe to expose in URLs (they're content-addressed hashes, not sequential IDs) | HIGH | Verified: keys use SHA256 hashes, not guessable | — | Active |
| A3 | `createHmac` from `node:crypto` is available in all deployment targets | HIGH | Node.js built-in, used elsewhere in the codebase | — | Active |
| A4 | 1-hour expiry is sufficient for typical conversation viewing sessions | MEDIUM | Most sessions are <30 minutes. Client can re-fetch for fresh URLs. | After launch feedback | Active |

## 13) In Scope (implement now)
- R1-R5: Signed media proxy route + signing utility + blob URI resolution update + path traversal protection
- R6: Configurable expiry (env var with default)
- R7: Cache-Control with remaining TTL
- Tests for signing, verification, proxy, and resolve-blob-uris
- Changeset for agents-api

## 14) Risks & mitigations
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Signing secret rotation invalidates all cached URLs | Low | Low | URLs expire naturally (1hr). Rotation only affects in-flight pages — refresh gets new URLs. | — |
| URL format change after launch | Low | Medium | This is a 1-way door. Get format right before shipping. | — |
| Timing attack on HMAC comparison | Low | Low | Use `crypto.timingSafeEqual()` for signature comparison | — |

## 15) Future Work

### Identified
- **Secret rotation support (R8)** — Accept current + previous secret during rotation window
  - What we know: Standard pattern, straightforward implementation
  - Why it matters: Zero-downtime secret rotation without URL invalidation
  - What investigation is needed: Determine rotation cadence and mechanism

### Noted
- **CDN caching** — Could add a CDN layer in front of the proxy for frequently-accessed media. Signed URLs with expiry are CDN-compatible (cache key = full URL including signature).
- **Manage proxy deprecation** — Once the run proxy is stable, evaluate whether the manage proxy is still needed or can be redirected.
