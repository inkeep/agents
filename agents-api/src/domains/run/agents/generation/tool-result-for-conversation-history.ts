import type { MessageContent, Part } from '@inkeep/agents-core';
import { makeMessageContentParts } from '../../services/blob-storage/image-upload';
import { buildPersistedMessageContent } from '../../services/blob-storage/image-upload-helpers';
import { isToolResultDenied } from '../../utils/tool-result';
import type { AgentRunContext } from '../agent-types';

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

function getToolResultPartsForConversationHistory(result: any): Array<Part> | undefined {
  if (!result || typeof result !== 'object' || !Array.isArray(result.content)) {
    return undefined;
  }

  const parts = result.content
    .map((item: any) => mapMcpContentItemToConversationHistoryPart(item))
    .filter((part: Part | null): part is Part => part !== null);

  return parts.length > 0 ? parts : undefined;
}

export async function buildToolResultForConversationHistory(
  ctx: AgentRunContext,
  toolName: string,
  args: any,
  result: any,
  toolCallId: string,
  conversationId: string,
  messageId: string
): Promise<MessageContent> {
  const text = formatToolResultForConversationHistory(toolName, args, result, toolCallId);
  const parts = getToolResultPartsForConversationHistory(result);

  if (!parts || parts.length === 0) {
    return { text };
  }

  const hasFileParts = parts.some((part) => part.kind === 'file');
  if (!hasFileParts) {
    return { text, parts: makeMessageContentParts(parts) };
  }

  return buildPersistedMessageContent(text, parts, {
    tenantId: ctx.config.tenantId,
    projectId: ctx.config.projectId,
    conversationId,
    messageId,
  });
}
