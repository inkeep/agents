# Current Blob Storage Implementation

**Date:** 2026-03-23
**Source:** Codebase exploration of agents-api

## 1. Storage Provider Architecture

Multi-backend storage with provider strategy pattern:

| Priority | Provider | Trigger | Location |
|----------|----------|---------|----------|
| 1 | S3 | `BLOB_STORAGE_S3_BUCKET` set | `blob-storage/s3-provider.ts` |
| 2 | Vercel Blob | `BLOB_READ_WRITE_TOKEN` set | `blob-storage/vercel-blob-provider.ts` |
| 3 | Local FS | Default fallback | `blob-storage/local-provider.ts` |

All providers implement `BlobStorageProvider`:
```typescript
interface BlobStorageProvider {
  upload(params: BlobStorageUploadParams): Promise<void>;
  download(key: string): Promise<BlobStorageDownloadResult>;
  delete(key: string): Promise<void>;
}
```

## 2. Vercel Blob Provider Details

- Uses `access: 'private'` for all uploads
- `addRandomSuffix: false`, `allowOverwrite: true`
- 30s timeout on all operations
- Downloads buffer entire file into `Uint8Array` (not streaming)

## 3. Blob URI System

- Internal prefix: `blob://`
- Storage key format: `v1/t_{tenantId}/media/p_{projectId}/conv/c_{conversationId}/m_{messageId}/sha256-{hash}.{ext}`
- Content-addressed via SHA256 hash

## 4. Current Media Serving (Manage Proxy)

Route: `GET /manage/tenants/{tenantId}/projects/{projectId}/conversations/{conversationId}/media/{mediaKey}`
Auth: `requireProjectPermission('view')` (admin/builder RBAC)
Cache: `Cache-Control: private, max-age=31536000, immutable`

Flow:
1. `resolveMessageBlobUris()` converts `blob://` URIs to manage proxy URLs
2. Client fetches the proxy URL
3. Server validates auth, reconstructs storage key, downloads from blob provider
4. Streams response with Content-Type

## 5. Existing Signed URL Spec

A prior spec exists at `specs/2026-03-19-run-media-signed-proxy/SPEC.md` that designs:
- HMAC-SHA256 signed URLs on `/run/v1/media/{key}?expires=X&sig=Y`
- Uses `INKEEP_ANON_JWT_SECRET` for signing
- 1-hour default expiry
- `noAuth()` route — signature IS the auth
- Solves the problem of end-user clients (useChat, widgets) needing to render `<img src>` without auth headers

## 6. S3 Provider — Already Has Presigned URL Capability

The S3 provider uses `@aws-sdk/client-s3` which natively supports `GetObjectCommand` + `@aws-sdk/s3-request-presigner` for generating presigned URLs. However, the current implementation does NOT use presigned URLs — it downloads and proxies like the Vercel provider.
