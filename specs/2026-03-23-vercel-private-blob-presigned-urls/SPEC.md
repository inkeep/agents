# S3 Presigned URLs for Private Media Delivery — Spec

**Status:** Final
**Owner(s):** Andrew
**Last updated:** 2026-03-27
**Links:**
- Evidence: `./evidence/vercel-blob-capabilities.md`, `./evidence/current-implementation.md`, `./evidence/cost-comparison.md`, `./evidence/same-domain-security-risks.md`
- Supersedes: `specs/2026-03-19-run-media-signed-proxy/SPEC.md` (HMAC-signed proxy — no longer needed)

---

## 1) Problem statement

**Situation:** The agents platform stores file attachments (images, PDFs) in blob storage with a multi-backend strategy (Vercel Blob, S3, local). Private blobs are served through an authenticated proxy on the `/manage` domain. A prior spec (`2026-03-19-run-media-signed-proxy`) designs an HMAC-signed URL proxy on the `/run` domain to solve the end-user client rendering problem.

**Complication:** Three compounding issues make the current approach untenable:

1. **No presigned URL support:** Vercel Private Blob Storage does NOT support native presigned URLs (no SDK method exists — confirmed via docs, SDK API surface, and GitHub issues #544/#594/#816). The only delivery mechanism is a serverless function proxy — adding latency, cost, and a scaling bottleneck.
2. **Auth model mismatch:** `<img src={url}>` makes a plain GET with no Authorization header. In the cross-origin widget/SDK context, cookie-based auth is unreliable (third-party cookie restrictions), and the Vercel AI SDK renders image URLs directly — there's no hook to inject custom auth. The URL itself must carry authentication.
3. **Same-domain security risk:** Serving user-uploaded media from the same domain as the authenticated API creates cookie leakage and XSS attack vectors. Session cookies are automatically sent with every same-origin media request. If an attacker uploads a malicious SVG/HTML file, embedded scripts execute in the API's origin and can make authenticated API calls using the session cookie — acting as the logged-in user (see `evidence/same-domain-security-risks.md`).

**Resolution:** Adopt S3 with native presigned URLs. This solves all three problems: presigned URLs are self-authenticating (no proxy needed), the URL carries auth (works with `<img src>`), and media is served from a separate domain (`*.s3.amazonaws.com`) — providing automatic cookie isolation and XSS sandboxing.

## 2) Goals
- G1: ~~Understand Vercel Private Blob's capabilities and constraints for media delivery~~ ✅ Done — see evidence files
- G2: ~~Determine the optimal delivery architecture~~ ✅ Decided — Option D (Hybrid: S3 presigned + manage proxy fallback)
- G3: Ensure media delivery has proper domain isolation for security (cookie leakage, XSS sandboxing)
- G4: ~~Align with the existing HMAC-signed proxy spec or identify a better path~~ ✅ Superseded
- G5: Implement S3 presigned URL generation in `resolveMessageBlobUris()`
- G6: Add `getPresignedUrl()` to `BlobStorageProvider` interface for S3

## 3) Non-goals
- **[NEVER]** NG1: Exposing `BLOB_READ_WRITE_TOKEN` or S3 credentials to clients
- **[NOT NOW]** NG2: CDN edge caching of private media — Revisit if: media serving becomes a performance bottleneck
- **[NOT NOW]** NG3: Migrating existing stored blobs between backends — Revisit if: backend migration is decided

## 4) Current state (how it works today)

### Vercel Private Blob — No Presigned URLs

Vercel Blob's private storage model requires ALL read operations to be authenticated with the `BLOB_READ_WRITE_TOKEN`. The SDK provides `get()` which returns a stream — there is no `getSignedUrl()`, `createPresignedUrl()`, or any method to generate time-limited access URLs.

This is fundamentally different from S3/GCS which offer native presigned URL generation where the storage service itself validates the signature and serves the content directly.

### Vercel's Recommended Pattern

```
Client request → Serverless function (your auth) → get() with token → stream to client
```

The function acts as a proxy: authenticates the request, fetches the blob server-side, and streams it back. Vercel docs suggest `Cache-Control: private, no-cache` with ETag-based conditional requests for efficiency.

### Dedicated Project Pattern (from Vercel docs)

Vercel docs explicitly describe creating a **dedicated Vercel project** for blob delivery:
1. Create new Vercel project with a route handler
2. Connect the private Blob store to it
3. Assign a custom domain (e.g., `content.mywebsite.com`)

**Purpose:** Custom domain for media + separation from main app's function budget.

### Our Current Architecture

- **Storage:** Multi-backend (`BlobStorageProvider` interface) — Vercel Blob, S3, or local
- **Proxy:** `/manage/.../media/{key}` route with admin RBAC auth
- **Designed (not yet implemented):** HMAC-signed URLs on `/run/v1/media/{key}?expires=X&sig=Y`
- **Problem:** Current proxy buffers entire file into memory (`Uint8Array`), not streaming

## 5) Architecture options considered

### Option A: HMAC-Signed Proxy on Same API (Existing Spec)

The existing `2026-03-19-run-media-signed-proxy` spec already designs this:
- `/run/v1/media/{key}?expires=X&sig=Y` with `noAuth()`
- HMAC-SHA256 signing using `INKEEP_ANON_JWT_SECRET`
- 1-hour default expiry
- Same `agents-api` deployment serves media

**Pros:**
- Simplest operational model — no new projects/deployments
- Application-layer "presigned URLs" work identically regardless of backend (Vercel Blob, S3, local)
- Backend-agnostic — switching storage providers doesn't change the URL format
- Already fully designed and spec'd

**Cons:**
- Every media request consumes `agents-api` function resources (CPU, memory, concurrency)
- Current implementation buffers entire file (not streaming) — memory pressure for larger files
- No custom domain for media without additional infra
- Shared function budget with API requests — media traffic competes with chat/agent traffic
- **Security: Same-domain risk.** Media served from the API domain means session cookies are sent with every request. Malicious uploaded files (SVG/HTML) execute in the API's origin and can make authenticated API calls using the session cookie. Would require additional mitigations: `Content-Security-Policy: default-src 'none'`, `X-Content-Type-Options: nosniff`, strict MIME allowlist, and ideally a separate registrable domain.

### Option B: Dedicated Vercel Project for Media Proxy

A separate Vercel project (e.g., `inkeep-media`) with:
- A single route handler that validates HMAC signatures and streams blobs
- Connected to the same private Blob store
- Optional custom domain (e.g., `media.inkeep.com`)
- `agents-api` generates signed URLs pointing to this project's domain

**Pros:**
- Isolated function budget — media traffic can't starve the API
- Custom domain for media (professional, cacheable)
- Can scale independently (different Vercel plan/limits if needed)
- Smaller function — only does signature validation + blob streaming (fast cold starts)

**Cons:**
- Operational overhead: separate deployment, separate monitoring, separate env vars
- Need to share signing secret across two projects
- Need to share `BLOB_READ_WRITE_TOKEN` across two projects (supported by Vercel — same token works)
- More moving parts to break
- Only helps for Vercel Blob — if using S3 backend, this project can't serve those files
- **Security: Subdomain is NOT sufficient.** If using `media.inkeep.com` and `cookieDomain=.inkeep.com`, session cookies are still shared across all subdomains. Only a completely separate registrable domain provides true cookie isolation.

### Option C: S3-Compatible Presigned URLs

If using S3 (or S3-compatible) as the storage backend:
- Use `@aws-sdk/s3-request-presigner` to generate native presigned `GetObject` URLs
- Client fetches directly from S3 — no proxy function needed
- Zero function invocations for media reads

**Pros:**
- Truly zero-proxy: client talks directly to storage
- Native S3 capability — battle-tested, CDN-friendly
- No function cost or latency for reads
- Best performance and scalability
- **Security: Automatic domain isolation.** S3 URLs point to `*.s3.amazonaws.com` — a completely separate registrable domain. No API cookies are sent. Even if a malicious SVG executes, it runs in S3's origin with zero access to API cookies, localStorage, or same-origin API endpoints. This is a free security benefit requiring no additional configuration.

**Cons:**
- Only works with S3 backend, not Vercel Blob
- Exposes S3 bucket domain to clients (acceptable but visible)
- Requires S3-specific URL generation path
- Doesn't help when Vercel Blob is the backend

### Option D: Hybrid — manage proxy fallback, native presigned for S3 ✅ SELECTED

Backend-aware URL generation in `resolveMessageBlobUris()`:
- When backend is S3: generate native S3 presigned URLs (direct client-to-S3)
- When backend is not S3 (Vercel Blob, local): fall back to existing manage media proxy

**Pros:**
- Best performance when S3 is available
- Falls back gracefully to manage proxy for non-S3 backends
- Future-proof: if Vercel adds presigned URLs, easy to add a third path
- No new infrastructure for local dev — existing proxy works as-is

**Cons:**
- Different URL formats depending on backend (clients shouldn't care, but it's observable)

## 6) Requirements

| Priority | ID | Requirement | Acceptance criteria | Notes |
|---|---|---|---|---|
| Must | R1 | S3 presigned URL generation | `resolveMessageBlobUris()` produces S3 presigned `GetObject` URLs when backend is S3 | Uses `@aws-sdk/s3-request-presigner` |
| Must | R2 | Async blob URI resolution | `resolveMessageBlobUris()` / `resolveMessagesListBlobUris()` become async | Presigned URL generation is async |
| Must | R3 | `BlobStorageProvider.getPresignedUrl()` | New optional method on provider interface; S3 provider implements it | Other providers return `null` → falls back to manage proxy |
| Must | R4 | Manage proxy backward compat | Existing `/manage/.../media/{key}` route remains functional | Fallback when S3 is not configured (local dev, Vercel Blob) |
| Must | R5 | 1-hour default expiry | Presigned URLs expire after 3600 seconds | Configurable via env var |
| Should | R6 | Unit tests for presigned URL generation | Tests for S3 presigned path, fallback path, expiry behavior | |
| Should | R7 | Update existing resolve-blob-uris tests | Adapt to async signatures, test both S3 and proxy URL outcomes | |

## 7) Implementation design

**Decision: Option D — Hybrid.** When S3 env vars are configured (`BLOB_STORAGE_S3_BUCKET`), generate presigned URLs for direct client-to-S3 reads. When S3 is not configured (local dev, Vercel Blob), fall back to the existing manage media proxy.

### 7.1 Interface change: `BlobStorageProvider.getPresignedUrl()`

Add an optional `getPresignedUrl` method to the provider interface:

```typescript
// types.ts
export interface BlobStorageProvider {
  upload(params: BlobStorageUploadParams): Promise<void>;
  download(key: string): Promise<BlobStorageDownloadResult>;
  delete(key: string): Promise<void>;
  /** Generate a presigned URL for direct client access. Returns null if not supported. */
  getPresignedUrl?(key: string, expiresInSeconds?: number): Promise<string>;
}
```

- **S3BlobStorageProvider:** Implements using `@aws-sdk/s3-request-presigner` → `getSignedUrl(client, GetObjectCommand, { expiresIn })`
- **VercelBlobStorageProvider:** Does not implement (returns `undefined` via optional method)
- **LocalBlobStorageProvider:** Does not implement

### 7.2 S3 presigned URL generation

```typescript
// s3-provider.ts — new method
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_PRESIGNED_EXPIRY_SECONDS = 3600; // 1 hour

async getPresignedUrl(key: string, expiresInSeconds?: number): Promise<string> {
  const expiry = expiresInSeconds ?? DEFAULT_PRESIGNED_EXPIRY_SECONDS;
  return getSignedUrl(
    this.client,
    new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    { expiresIn: expiry }
  );
}
```

New dependency: `@aws-sdk/s3-request-presigner`

### 7.3 Update `resolveMessageBlobUris()` → async

The function becomes async because `getPresignedUrl()` is async (local signing, no network call — fast but still a Promise):

```typescript
// resolve-blob-uris.ts
export async function resolveMessageBlobUris(
  content: MessageContent,
  baseUrl?: string
): Promise<MessageContent> {
  if (!content.parts || content.parts.length === 0) {
    return content;
  }

  const provider = getBlobStorageProvider();
  const apiBaseUrl = baseUrl || env.INKEEP_AGENTS_API_URL;

  const resolvedParts = await Promise.all(
    content.parts.map(async (part) => {
      if (part.kind === 'file' && typeof part.data === 'string' && isBlobUri(part.data)) {
        const key = fromBlobUri(part.data);

        // Try presigned URL first (S3)
        if (provider.getPresignedUrl) {
          const presignedUrl = await provider.getPresignedUrl(key);
          return { ...part, data: presignedUrl };
        }

        // Fall back to manage proxy URL (Vercel Blob, local)
        const parsed = parseMediaStorageKey(key);
        if (parsed) {
          const proxyUrl = `${apiBaseUrl}/manage/tenants/${parsed.tenantId}/projects/${parsed.projectId}/conversations/${parsed.conversationId}/media/${encodeURIComponent(parsed.tail)}`;
          return { ...part, data: proxyUrl };
        }

        logger.warn({ key }, 'Malformed blob storage key, filtering part out');
        return null;
      }
      return part;
    })
  );

  return { ...content, parts: resolvedParts.filter((p): p is NonNullable<typeof p> => p !== null) };
}

export async function resolveMessagesListBlobUris<T extends { content: MessageContent }>(
  messages: T[],
  baseUrl?: string
): Promise<T[]> {
  return Promise.all(
    messages.map(async (msg) => ({
      ...msg,
      content: await resolveMessageBlobUris(msg.content, baseUrl),
    }))
  );
}
```

### 7.4 Call site updates

Both call sites are already in async route handlers — just add `await`:

| File | Line | Change |
|---|---|---|
| `agents-api/src/domains/run/routes/conversations.ts` | ~349 | `const resolvedMessages = await resolveMessagesListBlobUris(...)` |
| `agents-api/src/domains/manage/routes/conversations.ts` | ~184 | `const resolvedMessages = await resolveMessagesListBlobUris(...)` |

### 7.5 Local development

No additional local dev infrastructure needed. When S3 env vars are not set, the existing `LocalBlobStorageProvider` is used for storage, and `resolveMessageBlobUris()` falls back to the manage media proxy URL. This is the same behavior as today — presigned URLs are a production-only optimization.

### 7.6 Manage proxy — backward compatibility

The existing `/manage/tenants/{tenantId}/projects/{projectId}/conversations/{id}/media/{mediaKey}` route is **kept as-is**:

- Continues to work for local and Vercel Blob backends (which don't support presigned URLs)
- Serves as fallback if presigned URL generation ever fails
- No code changes needed — it already works
- Existing bookmarked/cached manage URLs continue to resolve

### 7.7 Files to change

| File | Change | Type |
|---|---|---|
| `agents-api/src/domains/run/services/blob-storage/types.ts` | Add optional `getPresignedUrl` to interface | Modify |
| `agents-api/src/domains/run/services/blob-storage/s3-provider.ts` | Implement `getPresignedUrl` using `@aws-sdk/s3-request-presigner` | Modify |
| `agents-api/src/domains/run/services/blob-storage/resolve-blob-uris.ts` | Make async, try presigned URL first, fall back to proxy | Modify |
| `agents-api/src/domains/run/routes/conversations.ts` | Add `await` to `resolveMessagesListBlobUris` call | Modify |
| `agents-api/src/domains/manage/routes/conversations.ts` | Add `await` to `resolveMessagesListBlobUris` call | Modify |
| `agents-api/package.json` | Add `@aws-sdk/s3-request-presigner` dependency | Modify |
| `agents-api/src/domains/run/services/__tests__/resolve-blob-uris.test.ts` | Update to async, test both presigned and proxy paths | Modify |
| `agents-api/src/domains/run/services/__tests__/s3-provider.test.ts` | Add presigned URL tests | Modify |

## 8) Decision log

| ID | Decision | Type | Status | 1-way door? | Rationale |
|---|---|---|---|---|---|
| D1 | Vercel Blob has no native presigned URL support | T | LOCKED | N/A | Verified from SDK docs, GitHub issues. Platform constraint. |
| D2 | Same-domain media proxy has unacceptable security risks | T | LOCKED | N/A | Cookie leakage + XSS via uploaded content. See `evidence/same-domain-security-risks.md`. |
| D3 | Subdomain isolation (e.g., `media.inkeep.com`) is insufficient | T | LOCKED | N/A | `cookieDomain=.inkeep.com` shares cookies across all subdomains. Only a separate registrable domain provides true isolation. |
| D4 | S3 presigned URLs provide automatic domain isolation | T | LOCKED | N/A | `*.s3.amazonaws.com` is a completely separate origin — no cookie leakage, XSS sandboxed. |
| D5 | S3 is the storage backend for private media | X | DECIDED | Yes | Cost (2-3x cheaper), security (domain isolation), performance (zero-proxy), implementation simplicity. |
| D6 | Option D — Hybrid: S3 presigned URLs with manage proxy fallback | X | DECIDED | No | Direct client-to-S3 when S3 is configured; existing manage proxy for local dev and non-S3 backends. |
| D7 | This spec supersedes `2026-03-19-run-media-signed-proxy` | X | DECIDED | No | S3 presigned URLs eliminate the need for HMAC-signed proxy. |
| D8 | Keep `/manage` media proxy for backward compatibility | X | DECIDED | No | Existing route remains as fallback when S3 is not configured (local dev, Vercel Blob). |
| D9 | Local dev uses manage proxy — no S3 mock needed | X | DECIDED | No | Presigned URLs are a production optimization. Local dev uses the existing local filesystem + manage proxy path. No additional Docker services required. |
| D10 | `getPresignedUrl()` is optional on `BlobStorageProvider` interface | T | DECIDED | No | Only S3 implements it; other providers fall back to manage proxy. |

## 9) Open questions

| ID | Question | Type | Priority | Blocking? | Status |
|---|---|---|---|---|---|
| Q1 | ~~Which architecture option (A/B/C/D)?~~ | X | P0 | ~~Yes~~ | ✅ Resolved → D6: Option D (Hybrid) |
| Q2 | ~~Is Vercel Blob the primary backend?~~ | T | P0 | ~~Yes~~ | ✅ Resolved — S3 provider is fully implemented, Vercel Blob not configured in production. S3 is the path forward. |
| Q3 | ~~Should this spec supersede the HMAC proxy spec?~~ | X | P0 | ~~Yes~~ | ✅ Resolved → D7: Yes, superseded |
| Q4 | ~~Are S3 storage keys a different format than Vercel Blob keys?~~ | T | P1 | ~~Yes~~ | ✅ Resolved — No. All backends use the same key format: `v1/t_{tenantId}/media/p_{projectId}/conv/c_{conversationId}/m_{messageId}/sha256-{hash}.{ext}`. DB stores `blob://{key}` which is backend-agnostic. `getPresignedUrl(key)` works with no translation. |
| Q5 | Should presigned URL expiry be configurable via env var? | X | P2 | No | 1-hour default is fine for now; can add `BLOB_PRESIGNED_URL_EXPIRY_SECONDS` later if needed |

## 10) Assumptions

| ID | Assumption | Confidence | Verification | Status |
|---|---|---|---|---|
| A1 | Vercel Blob will not add presigned URL support in the near term | MEDIUM | Feature was requested 2+ years ago; Vercel resolved by shipping Private Storage instead | Active |
| A2 | `BLOB_READ_WRITE_TOKEN` can be shared across Vercel projects on the same team | HIGH | Verified in Vercel docs | Active |
| A3 | Short presigned URL expiries (1hr) are not a problem for `/run/api/v1/chat` | HIGH | Endpoint generates fresh presigned URLs on every response. Each conversation history request mints new URLs. No scenario where a client holds stale URLs. | Active |
| A4 | Session cookies in production use `cookieDomain` set to a shared domain (`.inkeep.com`) | HIGH | Verified in `packages/agents-core/src/auth/auth.ts` Better Auth config | Active |
