import type { InkeepChatCompletion } from './inkeep-chat-prompt';

export function getResponseMetadata(response: InkeepChatCompletion) {
  return {
    id: response.id,
    modelId: response.model,
    timestamp: new Date(response.created * 1000),
  };
}
