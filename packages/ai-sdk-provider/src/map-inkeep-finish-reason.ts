import type { LanguageModelV2FinishReason } from '@ai-sdk/provider';
import type { InkeepFinishReason } from './inkeep-chat-prompt';

export function mapInkeepFinishReason(
  finishReason: InkeepFinishReason
): LanguageModelV2FinishReason {
  switch (finishReason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
      return 'tool-calls';
    case 'content_filter':
      return 'content-filter';
    case null:
      return 'unknown';
    default:
      return 'unknown';
  }
}
