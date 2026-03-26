import { createHash } from 'node:crypto';
import { getExtensionFromMimeType } from '@inkeep/agents-core/constants/allowed-file-formats';
import { getLogger } from '../../../../logger';
import { parseDataUri } from '../../utils/message-parts';
import { getBlobStorageProvider, isBlobUri, toBlobUri } from './index';
import { buildStorageKey } from './storage-keys';

const logger = getLogger('artifact-binary-sanitizer');

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
    v.data.length > 1 &&
    !isBlobUri(v.data) &&
    !v.data.startsWith('http')
  );
}

async function uploadInlinePart(
  part: InlineBinaryPart,
  ctx: ArtifactBinaryContext
): Promise<InlineBinaryPart> {
  const storage = getBlobStorageProvider();
  const parsed = parseDataUri(part.data);
  const base64Data = parsed ? parsed.base64Data : part.data;
  const mimeType = parsed?.mimeType ?? part.mimeType ?? 'application/octet-stream';
  const buffer = Buffer.from(base64Data, 'base64');
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

  try {
    await storage.upload({ key, data: buffer, contentType: mimeType });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        tenantId: ctx.tenantId,
        projectId: ctx.projectId,
        artifactId: ctx.artifactId,
        mimeType,
        size: buffer.length,
      },
      'Failed to upload artifact binary data to blob storage, returning original inline data'
    );
    return part;
  }

  return { ...part, data: toBlobUri(key) };
}

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

export function stripBinaryDataForObservability(value: unknown): unknown {
  const inStack = new WeakSet<object>();

  const visit = (current: unknown): unknown => {
    if (isInlineBinaryPart(current)) {
      const part = current;
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
