import type { Tool } from 'ai';
import { isToolResultDenied } from '../../utils/tool-result';

const MAX_TOOL_RESULT_TEXT_PART_CHARS = 100_000;

type ToolResultForModelInput = Awaited<ReturnType<NonNullable<Tool['toModelOutput']>>>;
type ToolResultModelInputContentPart = Extract<
  ToolResultForModelInput,
  { type: 'content' }
>['value'][number];
type ToolResultModelInputJsonValue = Extract<ToolResultForModelInput, { type: 'json' }>['value'];

function truncateToolResultTextForModelInput(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_TEXT_PART_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_TOOL_RESULT_TEXT_PART_CHARS)}\n…[truncated]`;
}

function safeSerializeToolResultValueForModelInput(value: unknown): string {
  try {
    return truncateToolResultTextForModelInput(JSON.stringify(value));
  } catch {
    return '[unserializable tool result value]';
  }
}

function mapMcpContentItemToModelInputPart(item: unknown): ToolResultModelInputContentPart | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const contentItem = item as Record<string, unknown>;
  const type = contentItem.type;

  if (type === 'text') {
    if (typeof contentItem.text === 'string') {
      return {
        type: 'text',
        text: contentItem.text,
      };
    }

    if (contentItem.text !== undefined) {
      return {
        type: 'text',
        text: safeSerializeToolResultValueForModelInput(contentItem.text),
      };
    }

    return null;
  }

  if (type === 'image') {
    if (typeof contentItem.data === 'string' && contentItem.data.trim() !== '') {
      return {
        type: 'image-data',
        data: contentItem.data as string,
        mediaType:
          typeof contentItem.mimeType === 'string' && contentItem.mimeType.trim() !== ''
            ? contentItem.mimeType
            : 'image/*',
      };
    }

    if (typeof contentItem.url === 'string' && contentItem.url.trim() !== '') {
      return {
        type: 'image-url',
        url: contentItem.url as string,
      };
    }

    return null;
  }

  return {
    type: 'text',
    text: safeSerializeToolResultValueForModelInput(contentItem),
  };
}

export function buildToolResultForModelInput(output: unknown): ToolResultForModelInput {
  if (isToolResultDenied(output)) {
    return {
      type: 'execution-denied',
      reason: output.reason,
    };
  }

  if (!output || typeof output !== 'object') {
    return {
      type: 'json',
      value: output as ToolResultModelInputJsonValue,
    };
  }

  const outputRecord = output as Record<string, unknown>;
  const content = outputRecord.content;
  if (!Array.isArray(content)) {
    return {
      type: 'json',
      value: output as ToolResultModelInputJsonValue,
    };
  }

  const mappedContent = content
    .map((item) => mapMcpContentItemToModelInputPart(item))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (mappedContent.length === 0) {
    return {
      type: 'json',
      value: output as ToolResultModelInputJsonValue,
    };
  }

  const meta: Record<string, unknown> = {};
  if ('_toolCallId' in outputRecord) meta._toolCallId = outputRecord._toolCallId;
  if ('_structureHints' in outputRecord) meta._structureHints = outputRecord._structureHints;

  const metaPart: ToolResultModelInputContentPart | null =
    Object.keys(meta).length > 0
      ? { type: 'text', text: safeSerializeToolResultValueForModelInput(meta) }
      : null;

  return {
    type: 'content',
    value: metaPart ? [metaPart, ...mappedContent] : mappedContent,
  };
}
