import type { FilePart, Part } from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';

const logger = getLogger('tool-result-images');

interface ExtractionResult {
  strippedResult: any;
  fileParts: FilePart[];
}

function isImageMimeType(mimeType?: string): boolean {
  return mimeType?.startsWith('image/') === true;
}

function extractMcpImageParts(
  content: any[],
  indexOffset: number
): { stripped: any[]; fileParts: FilePart[] } {
  const stripped: any[] = [];
  const fileParts: FilePart[] = [];
  let idx = indexOffset;

  for (const item of content) {
    if (item?.type === 'image' && typeof item.data === 'string' && item.mimeType) {
      fileParts.push({
        kind: 'file',
        file: { bytes: item.data, mimeType: item.mimeType },
      });
      stripped.push({
        type: 'image',
        _imageRef: idx,
        mimeType: item.mimeType,
      });
      idx++;
    } else {
      stripped.push(item);
    }
  }

  return { stripped, fileParts };
}

function extractA2aParts(
  parts: any[],
  indexOffset: number
): { stripped: any[]; fileParts: FilePart[] } {
  const stripped: any[] = [];
  const fileParts: FilePart[] = [];
  let idx = indexOffset;

  for (const part of parts) {
    if (part?.kind === 'file' && part.file && isImageMimeType(part.file.mimeType)) {
      fileParts.push(part as FilePart);
      stripped.push({
        kind: 'file',
        file: { _imageRef: idx, mimeType: part.file.mimeType },
        ...(part.metadata && { metadata: part.metadata }),
      });
      idx++;
    } else {
      stripped.push(part);
    }
  }

  return { stripped, fileParts };
}

export function extractImagesFromToolResult(result: any): ExtractionResult {
  if (result == null || typeof result !== 'object') {
    return { strippedResult: result, fileParts: [] };
  }

  try {
    if (Array.isArray(result.content)) {
      const hasImages = result.content.some(
        (item: any) => item?.type === 'image' && typeof item.data === 'string'
      );
      if (hasImages) {
        const { stripped, fileParts } = extractMcpImageParts(result.content, 0);
        return { strippedResult: { ...result, content: stripped }, fileParts };
      }
    }

    if (result.result && typeof result.result === 'object') {
      if (Array.isArray(result.result.parts)) {
        const hasImageFiles = result.result.parts.some(
          (p: any) => p?.kind === 'file' && isImageMimeType(p?.file?.mimeType)
        );
        if (hasImageFiles) {
          const { stripped, fileParts } = extractA2aParts(result.result.parts, 0);
          return {
            strippedResult: { ...result, result: { ...result.result, parts: stripped } },
            fileParts,
          };
        }
      }

      if (Array.isArray(result.result.artifacts)) {
        let allFileParts: FilePart[] = [];
        const strippedArtifacts = result.result.artifacts.map((artifact: any) => {
          if (!Array.isArray(artifact.parts)) return artifact;
          const hasImageFiles = artifact.parts.some(
            (p: any) => p?.kind === 'file' && isImageMimeType(p?.file?.mimeType)
          );
          if (!hasImageFiles) return artifact;
          const { stripped, fileParts } = extractA2aParts(artifact.parts, allFileParts.length);
          allFileParts = [...allFileParts, ...fileParts];
          return { ...artifact, parts: stripped };
        });
        if (allFileParts.length > 0) {
          return {
            strippedResult: {
              ...result,
              result: { ...result.result, artifacts: strippedArtifacts },
            },
            fileParts: allFileParts,
          };
        }
      }
    }

    return { strippedResult: result, fileParts: [] };
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to extract images from tool result, returning result as-is'
    );
    return { strippedResult: result, fileParts: [] };
  }
}

export function injectUploadedImageUrls(strippedResult: any, urls: string[]): any {
  if (strippedResult == null || typeof strippedResult !== 'object' || urls.length === 0) {
    return strippedResult;
  }

  try {
    const json = JSON.stringify(strippedResult);
    const replaced = json.replace(/"_imageRef"\s*:\s*(\d+)/g, (_match, idxStr) => {
      const idx = Number.parseInt(idxStr, 10);
      const url = urls[idx];
      if (url) {
        return `"url":${JSON.stringify(url)}`;
      }
      return `"url":"[image not available]"`;
    });
    return JSON.parse(replaced);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to inject uploaded image URLs into stripped result'
    );
    return strippedResult;
  }
}

export function getUrlsFromUploadedParts(
  uploadedParts: Part[],
  resolveUrl?: (blobUri: string) => string | null
): string[] {
  const urls: string[] = [];
  for (const part of uploadedParts) {
    if (part.kind === 'file') {
      const file = (part as FilePart).file;
      if ('uri' in file && file.uri) {
        const resolved = resolveUrl ? resolveUrl(file.uri) : file.uri;
        urls.push(resolved || file.uri);
      }
    }
  }
  return urls;
}
