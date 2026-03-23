import type { FilePart, MessageContent, Part } from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import {
  makeMessageContentParts,
  type UploadContext,
  uploadFilePart,
} from '../../services/blob-storage/image-upload';
import { isToolResultDenied } from '../../utils/tool-result';
import type { AgentRunContext } from '../agent-types';

const logger = getLogger('tool-result-for-conversation-history');

function filterNonTextToolResultContentForConversationHistory(result: any): any {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return result;
  }

  if (!Array.isArray(result.content)) {
    return result;
  }

  const textContent = result.content.filter((item: any) => item?.type === 'text' && 'text' in item);

  return {
    ...result,
    content: textContent,
  };
}

function formatToolResultForConversationHistory(
  toolName: string,
  args: any,
  result: any,
  toolCallId: string
): string {
  const input = args ? JSON.stringify(args, null, 2) : 'No input';

  if (isToolResultDenied(result)) {
    return [
      `## Tool: ${toolName}`,
      '',
      `### 🔧 TOOL_CALL_ID: ${toolCallId}`,
      '',
      `### Output`,
      result.reason,
    ].join('\n');
  }

  let parsedResult = result;
  if (typeof result === 'string') {
    try {
      parsedResult = JSON.parse(result);
    } catch (_e) {}
  }

  const cleanResult =
    parsedResult && typeof parsedResult === 'object' && !Array.isArray(parsedResult)
      ? {
          ...parsedResult,
          result:
            parsedResult.result &&
            typeof parsedResult.result === 'object' &&
            !Array.isArray(parsedResult.result)
              ? Object.fromEntries(
                  Object.entries(parsedResult.result).filter(([key]) => key !== '_structureHints')
                )
              : parsedResult.result,
        }
      : parsedResult;

  const textOnlyResult = filterNonTextToolResultContentForConversationHistory(cleanResult);
  const output =
    typeof textOnlyResult === 'string' ? textOnlyResult : JSON.stringify(textOnlyResult, null, 2);

  return `## Tool: ${toolName}

### 🔧 TOOL_CALL_ID: ${toolCallId}

### Input
${input}

### Output
${output}`;
}

function mapMcpContentItemToConversationHistoryPart(item: any): Part | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  if (item.type === 'text') {
    if (typeof item.text === 'string') {
      return { kind: 'text', text: item.text };
    }
    if (item.text !== undefined) {
      return { kind: 'text', text: JSON.stringify(item.text, null, 2) };
    }
    return null;
  }

  if (item.type === 'image' && typeof item.data === 'string') {
    return {
      kind: 'file',
      file: {
        bytes: item.data,
        ...(typeof item.mimeType === 'string' ? { mimeType: item.mimeType } : {}),
      },
      metadata: {
        type: 'image',
      },
    };
  }

  if (item.type === 'image' && typeof item.url === 'string') {
    return {
      kind: 'file',
      file: {
        uri: item.url,
        ...(typeof item.mimeType === 'string' ? { mimeType: item.mimeType } : {}),
      },
      metadata: {
        type: 'image',
      },
    };
  }

  return {
    kind: 'data',
    data: item as Record<string, unknown>,
  };
}

function getIndexedPartsForConversationHistory(
  result: any
): Array<{ originalIndex: number; part: Part }> {
  if (!result || typeof result !== 'object' || !Array.isArray(result.content)) {
    return [];
  }

  const indexedParts: Array<{ originalIndex: number; part: Part }> = [];
  for (let i = 0; i < result.content.length; i++) {
    const item = result.content[i];
    const part = mapMcpContentItemToConversationHistoryPart(item);
    if (part !== null) {
      indexedParts.push({ originalIndex: i, part });
    }
  }
  return indexedParts;
}

export function formatInvalidToolCallForHistory(
  toolName: string,
  toolCallId: string,
  input: unknown,
  error: unknown
): string {
  const inputStr =
    input !== undefined
      ? JSON.stringify(input, null, 2)
      : 'No input (validation failed before parsing)';
  const errorMessage = error instanceof Error ? error.message : String(error);
  return `## Tool: ${toolName}

### 🔧 TOOL_CALL_ID: ${toolCallId}

### Input
${inputStr}

### Error
${errorMessage}`;
}

export async function buildToolResultForConversationHistory(
  ctx: AgentRunContext,
  toolName: string,
  args: any,
  result: any,
  toolCallId: string,
  conversationId: string,
  messageId: string
): Promise<{ messageContent: MessageContent; indexToBlobUri: Map<number, string> }> {
  const text = formatToolResultForConversationHistory(toolName, args, result, toolCallId);
  const indexedParts = getIndexedPartsForConversationHistory(result);

  if (indexedParts.length === 0) {
    return { messageContent: { text }, indexToBlobUri: new Map() };
  }

  const hasFileParts = indexedParts.some(({ part }) => part.kind === 'file');
  if (!hasFileParts) {
    return {
      messageContent: {
        text,
        parts: makeMessageContentParts(indexedParts.map(({ part }) => part)),
      },
      indexToBlobUri: new Map(),
    };
  }

  const uploadCtx: UploadContext = {
    tenantId: ctx.config.tenantId,
    projectId: ctx.config.projectId,
    conversationId,
    messageId,
  };

  const indexToBlobUri = new Map<number, string>();
  const uploadedParts: (Part | null)[] = new Array(indexedParts.length).fill(null);

  await Promise.all(
    indexedParts.map(async ({ originalIndex, part }, arrayIndex) => {
      if (part.kind !== 'file') {
        uploadedParts[arrayIndex] = part;
        return;
      }
      try {
        const uploaded = await uploadFilePart(part as FilePart, uploadCtx, originalIndex);
        const file = uploaded.file;
        if ('uri' in file && file.uri) {
          indexToBlobUri.set(originalIndex, file.uri);
        }
        uploadedParts[arrayIndex] = uploaded;
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error), originalIndex },
          'Failed to upload file part, dropping from persisted message'
        );
      }
    })
  );

  const finalParts = uploadedParts.filter((p): p is Part => p !== null);
  return {
    messageContent: { text, parts: makeMessageContentParts(finalParts) },
    indexToBlobUri,
  };
}
