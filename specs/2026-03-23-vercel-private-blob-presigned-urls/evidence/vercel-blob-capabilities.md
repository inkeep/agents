# Vercel Private Blob Storage — Capability Assessment

**Date:** 2026-03-23
**Sources:** Vercel docs, @vercel/blob SDK docs, GitHub issues #544, #594, #816

## 1. Private Storage Model

Vercel Blob has two access modes: **public** and **private** (private shipped Feb 2026, public beta).

- **Public:** Files get a CDN-backed URL (`*.public.blob.vercel-storage.com`) accessible to anyone
- **Private:** Files get a URL (`*.private.blob.vercel-storage.com`) that is NOT publicly accessible. Access requires:
  - SDK `get()` method with `BLOB_READ_WRITE_TOKEN`, OR
  - Direct fetch with `Authorization: Bearer $BLOB_READ_WRITE_TOKEN` header

## 2. SDK API Surface (`@vercel/blob` >= 2.3)

| Method | Purpose | Returns |
|--------|---------|---------|
| `put()` | Upload a blob | `{ pathname, url, downloadUrl, contentType, etag }` |
| `get()` | Retrieve blob content as stream | `{ statusCode, stream, blob: { contentType, etag } }` or `null` |
| `del()` | Delete blob(s) | void |
| `list()` | List blobs | paginated blob list |
| `head()` | Get blob metadata | metadata object |
| `copy()` | Copy blob | new blob reference |

**Critical finding: There is NO presigned URL method.**
- No `getSignedUrl()`, `getDownloadUrl()`, `createPresignedUrl()`, or equivalent
- No way to generate time-limited access URLs natively
- The `url` and `downloadUrl` fields from `put()` are NOT accessible without the token

## 3. GitHub Feature Request Status

| Issue | Request | Resolution |
|-------|---------|------------|
| #544 (Dec 2023) | Signed URLs for Vercel Blob | Closed as "Completed" — resolved by shipping Private Storage (not signed URLs) |
| #594 (Jan 2024) | `downloadUrl` with expiration token or stream | Closed as "Completed" — same resolution |
| #816 (Jun 2024) | Blob access control | Closed as "Completed" — same resolution |

All three issues were resolved by the Private Storage launch, NOT by adding presigned URL support.
Community workarounds discussed:
- Edge function proxy streaming
- Next.js `rewrite()` to mask blob URLs
- Encrypted query parameters with iron-session (custom TTL)

## 4. Recommended Delivery Pattern (from Vercel docs)

Vercel's official recommendation for serving private blobs:

```
Client → Your serverless function (auth check) → get() → stream response to client
```

- Function authenticates the request (your auth logic)
- Function calls `get()` with the read-write token
- Function streams the blob body to the client
- Client never sees the blob storage URL or token

### Caching Recommendations
- `Cache-Control: private, no-cache` for general private content (allows 304 with ETags)
- `Cache-Control: private, no-store` for sensitive content (PII, tokens)
- CDN caching (`s-maxage`) explicitly warned against for private blobs
- Supports conditional requests via `ifNoneMatch` parameter

## 5. Dedicated Project Pattern (from Vercel docs)

Vercel docs explicitly suggest:
> "A common pattern is to create a dedicated Vercel project (e.g. 'assets') for blob delivery"

Steps from docs:
1. Create new Vercel project with route handler for serving private blobs
2. Connect private Blob store to this project
3. Assign custom domain (e.g., `content.mywebsite.com`)

**Purpose:** Custom domain for media delivery + separation of concerns.
**Not required** — the proxy can live on the same project/domain as the main API.

## 6. Cost Model

Private blob delivery has double-hop costs:
1. **Function → Blob store:** Blob Data Transfer + Fast Origin Transfer (on CDN cache miss)
2. **Function → Browser:** Fast Data Transfer + Fast Origin Transfer

Vercel recommends:
- Private blobs for **smaller sensitive files** or **precise auth control**
- NOT recommended for files >100MB unless traffic is low
- Public blobs are 3x cheaper for data transfer (BDT vs FDT rates)

## 7. Limitations

- No native presigned/signed URL support
- Server functions have resource limits (edge: ~4MB body, serverless: larger but bounded)
- Every request incurs a function invocation (latency + cost)
- `BLOB_READ_WRITE_TOKEN` is all-or-nothing (read + write) — no read-only tokens
- Token can be shared across projects on the same Vercel team
