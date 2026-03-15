import { createHash } from 'node:crypto';
import { getExtensionFromMimeType } from '@inkeep/agents-core/constants/allowed-image-formats';
import { getBlobStorageProvider, isBlobUri, toBlobUri } from './index';
import { buildStorageKey } from './storage-keys';

export interface ArtifactBinaryContext {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

type InlineBinaryPart = {
  type: 'image' | 'file';
  data: string;
  mimeType?: string;
  [key: string]: unknown;
};

const CIRCULAR_REFERENCE_PLACEHOLDER = '[Circular Reference]';

function isInlineBinaryPart(value: unknown): value is InlineBinaryPart {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.type === 'image' || v.type === 'file') &&
    typeof v.data === 'string' &&
    v.data.length > 100 &&
    !isBlobUri(v.data) &&
    !v.data.startsWith('http') &&
    !v.data.startsWith('data:')
  );
}

async function uploadInlinePart(
  part: InlineBinaryPart,
  ctx: ArtifactBinaryContext
): Promise<InlineBinaryPart> {
  const storage = getBlobStorageProvider();
  const buffer = Buffer.from(part.data, 'base64');
  const mimeType = part.mimeType ?? 'application/octet-stream';
  const contentHash = createHash('sha256').update(buffer).digest('hex');
  const ext = getExtensionFromMimeType(mimeType);

  const key = buildStorageKey({
    category: 'artifact-data',
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    artifactId: ctx.artifactId,
    contentHash,
    ext,
  });

  await storage.upload({ key, data: buffer, contentType: mimeType });

  return { ...part, data: toBlobUri(key) };
}

/**
 * Recursively walk `value` and upload any inline binary image/file parts
 * (i.e. objects with `{ type: "image"|"file", data: "<base64>" }`) to blob
 * storage, replacing the raw base64 with a `blob://` URI.
 *
 * Safe to call on already-sanitized data — parts whose `data` is already a
 * `blob://` URI are left untouched.
 */
export async function sanitizeArtifactBinaryData(
  value: unknown,
  ctx: ArtifactBinaryContext
): Promise<unknown> {
  const inStack = new WeakSet<object>();

  const visit = async (current: unknown): Promise<unknown> => {
    if (isInlineBinaryPart(current)) {
      return uploadInlinePart(current, ctx);
    }
    if (Array.isArray(current)) {
      if (inStack.has(current)) {
        return CIRCULAR_REFERENCE_PLACEHOLDER;
      }
      inStack.add(current);
      try {
        return Promise.all(current.map((item) => visit(item)));
      } finally {
        inStack.delete(current);
      }
    }
    if (current !== null && typeof current === 'object') {
      if (inStack.has(current)) {
        return CIRCULAR_REFERENCE_PLACEHOLDER;
      }
      inStack.add(current);
      try {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(current as Record<string, unknown>)) {
          result[k] = await visit(v);
        }
        return result;
      } finally {
        inStack.delete(current);
      }
    }
    return current;
  };

  return visit(value);
}

/**
 * Synchronously walk `value` and replace any inline binary data strings with
 * a human-readable placeholder. Use this before writing to OTEL span
 * attributes or LLM prompts where raw base64 is useless noise.
 */
export function stripBinaryDataForObservability(value: unknown): unknown {
  const inStack = new WeakSet<object>();

  const visit = (current: unknown): unknown => {
    if (isInlineBinaryPart(current)) {
      const part = current as InlineBinaryPart;
      const approxBytes = Math.round(part.data.length * 0.75);
      return {
        ...part,
        data: `[binary data ~${approxBytes} bytes, mimeType: ${part.mimeType ?? 'unknown'}]`,
      };
    }
    if (Array.isArray(current)) {
      if (inStack.has(current)) {
        return CIRCULAR_REFERENCE_PLACEHOLDER;
      }
      inStack.add(current);
      try {
        return current.map(visit);
      } finally {
        inStack.delete(current);
      }
    }
    if (current !== null && typeof current === 'object') {
      if (inStack.has(current)) {
        return CIRCULAR_REFERENCE_PLACEHOLDER;
      }
      inStack.add(current);
      try {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(current as Record<string, unknown>)) {
          result[k] = visit(v);
        }
        return result;
      } finally {
        inStack.delete(current);
      }
    }
    return current;
  };

  return visit(value);
}
