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
          content: contentParts.length === 1 ? (contentParts[0].text ?? '') : contentParts,
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
                  arguments: JSON.stringify(part.input),
                },
              });
              break;
            }

            case 'file': {
              throw new Error('File content is not yet supported by Inkeep provider');
            }

            case 'reasoning': {
              // Reasoning parts can be treated as text content
              text += part.text;
              break;
            }

            case 'tool-result': {
              // Tool results are handled separately in tool role messages
              throw new Error('Tool result content should not appear in assistant messages');
            }

            default: {
              const _exhaustiveCheck: never = part;
              throw new Error(`Unsupported content part type: ${_exhaustiveCheck}`);
            }
          }
        }

        const assistantMessage: InkeepChatMessage = {
          role: 'assistant',
          content: text || '',
        };

        if (toolCalls.length > 0) {
          assistantMessage.tool_calls = toolCalls;
        }

        messages.push(assistantMessage);

        break;
      }

      case 'tool': {
        for (const toolResponse of content) {
          let contentStr: string;
          const output = toolResponse.output as any;

          if (output && typeof output === 'object' && 'type' in output) {
            if (output.type === 'text' || output.type === 'error-text') {
              contentStr = String(output.value ?? '');
            } else if (output.type === 'json' || output.type === 'error-json') {
              contentStr =
                typeof output.value === 'string' ? output.value : JSON.stringify(output.value);
            } else {
              contentStr = JSON.stringify(output);
            }
          } else if (typeof output === 'string') {
            contentStr = output;
          } else {
            contentStr = JSON.stringify(output);
          }

          messages.push({
            role: 'tool',
            content: contentStr,
            name: toolResponse.toolName,
            tool_call_id: toolResponse.toolCallId,
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
