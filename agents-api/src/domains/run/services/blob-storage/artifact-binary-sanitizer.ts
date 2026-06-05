import { isBlobUri } from './index';

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
    !isBlobUri(v.data) &&
    !v.data.startsWith('http')
  );
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
