import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import type { InkeepChatMessage } from './inkeep-chat-prompt';

export function convertToInkeepChatMessages(
  prompt: LanguageModelV2Prompt
): Array<InkeepChatMessage> {
  const messages: Array<InkeepChatMessage> = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content });
        break;
      }

      case 'user': {
        const contentParts: Array<{ type: string; text?: string }> = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              contentParts.push({ type: 'text', text: part.text });
              break;
            }

            case 'image': {
              throw new Error('Image content is not yet supported by Inkeep provider');
            }

            case 'file': {
              throw new Error('File content is not yet supported by Inkeep provider');
            }

            default: {
              const _exhaustiveCheck: never = part;
              throw new Error(`Unsupported content part type: ${_exhaustiveCheck}`);
            }
          }
        }

        messages.push({
          role: 'user',
          content: contentParts.length === 1 ? contentParts[0].text ?? '' : contentParts,
        });
        break;
      }

      case 'assistant': {
        let text = '';
        const toolCalls: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              text += part.text;
              break;
            }

            case 'tool-call': {
              toolCalls.push({
                id: part.toolCallId,
                type: 'function',
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.args),
                },
              });
              break;
            }

            default: {
              const _exhaustiveCheck: never = part;
              throw new Error(`Unsupported content part type: ${_exhaustiveCheck}`);
            }
          }
        }

        messages.push({
          role: 'assistant',
          content: text || '',
        });

        break;
      }

      case 'tool': {
        for (const toolResponse of content) {
          messages.push({
            role: 'tool',
            content: JSON.stringify(toolResponse.result),
            name: toolResponse.toolName,
          });
        }
        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported message role: ${_exhaustiveCheck}`);
      }
    }
  }

  return messages;
}
