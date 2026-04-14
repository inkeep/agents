import type { FilePart } from '@inkeep/agents-core';
import {
  isOfficeDocumentMimeType,
  normalizeMimeType,
} from '@inkeep/agents-core/constants/allowed-file-formats';

export function supportsOfficeDocuments(modelId: string): boolean {
  if (!modelId) return false;
  const lower = modelId.toLowerCase();
  return lower.startsWith('openai/') || /^(gpt-|o1-|o3-|o4-|chatgpt-)/.test(lower);
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

export function buildStrippedPartsNote(stripped: StrippedFilePart[], modelId: string): string {
  return stripped
    .map(({ mimeType, filename }) => {
      const label = filename ? JSON.stringify(filename) : '"(unnamed)"';
      return `[Attachment omitted: ${label} (${mimeType}) — this file type is not supported by the configured model (${modelId}).]`;
    })
    .join('\n');
}
