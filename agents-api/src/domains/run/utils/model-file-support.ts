import type { FilePart } from '@inkeep/agents-core';
import {
  isOfficeDocumentMimeType,
  normalizeMimeType,
} from '@inkeep/agents-core/constants/allowed-file-formats';

export function supportsOfficeDocuments(modelId: string): boolean {
  if (!modelId) return false;
  const lower = modelId.toLowerCase();
  return (
    lower.startsWith('openai/') ||
    lower.startsWith('azure/') ||
    /^(gpt-|o1-|o3-|o4-|chatgpt-)/.test(lower)
  );
}

export interface StrippedFilePart {
  mimeType: string;
  filename: string | undefined;
}

export function stripIncompatibleOfficeParts(
  fileParts: FilePart[],
  modelId: string
): { compatible: FilePart[]; stripped: StrippedFilePart[] } {
  if (supportsOfficeDocuments(modelId)) {
    return { compatible: fileParts, stripped: [] };
  }

  const compatible: FilePart[] = [];
  const stripped: StrippedFilePart[] = [];

  for (const part of fileParts) {
    const mimeType = normalizeMimeType(part.file.mimeType ?? '');
    if (isOfficeDocumentMimeType(mimeType)) {
      stripped.push({
        mimeType,
        filename: typeof part.metadata?.filename === 'string' ? part.metadata.filename : undefined,
      });
    } else {
      compatible.push(part);
    }
  }

  return { compatible, stripped };
}

export function buildStrippedPartsNote(stripped: StrippedFilePart[]): string {
  return stripped
    .map(({ mimeType, filename }) => {
      const label = filename ? JSON.stringify(filename) : '(unnamed)';
      return `[Attachment omitted: ${label} (${mimeType}) — this file type is not supported in the current configuration. Please tell the user you are unable to access this file because the current assistant configuration does not support this file type.]`;
    })
    .join('\n');
}
