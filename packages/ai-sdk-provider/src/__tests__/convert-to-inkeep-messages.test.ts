import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { convertToInkeepChatMessages } from '../convert-to-inkeep-messages';

describe('convertToInkeepChatMessages', () => {
  it('should convert system messages', () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'system',
        content: 'You are a helpful assistant.',
      },
    ];

    const result = convertToInkeepChatMessages(prompt);

    expect(result).toEqual([
      {
        role: 'system',
        content: 'You are a helpful assistant.',
      },
    ]);
  });

  it('should convert single user text messages to string content', () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello!' }],
      },
    ];

    const result = convertToInkeepChatMessages(prompt);

    expect(result).toEqual([
      {
        role: 'user',
        content: 'Hello!',
      },
    ]);
  });

  it('should convert assistant messages with text only', () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'I can help with that.' }],
      },
    ];

    const result = convertToInkeepChatMessages(prompt);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'I can help with that.',
      },
    ]);
  });

  it('should preserve toolCalls on assistant messages', () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me look that up.' },
          {
            type: 'tool-call',
            toolCallId: 'call-123',
            toolName: 'search_docs',
            input: { query: 'getting started' },
          },
        ],
      },
    ];

    const result = convertToInkeepChatMessages(prompt);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'Let me look that up.',
        tool_calls: [
          {
            id: 'call-123',
            type: 'function',
            function: {
              name: 'search_docs',
              arguments: JSON.stringify({ query: 'getting started' }),
            },
          },
        ],
      },
    ]);
  });

  it('should convert tool response messages with tool_call_id and stringified content', () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-123',
            toolName: 'search_docs',
            output: { type: 'json', value: { results: ['Doc 1', 'Doc 2'] } },
          },
        ],
      },
    ];

    const result = convertToInkeepChatMessages(prompt);

    expect(result).toEqual([
      {
        role: 'tool',
        content: JSON.stringify({ results: ['Doc 1', 'Doc 2'] }),
        name: 'search_docs',
        tool_call_id: 'call-123',
      },
    ]);
  });

  it('should handle tool response with text output', () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-456',
            toolName: 'get_weather',
            output: { type: 'text', value: 'Sunny and 72F' },
          },
        ],
      },
    ];

    const result = convertToInkeepChatMessages(prompt);

    expect(result).toEqual([
      {
        role: 'tool',
        content: 'Sunny and 72F',
        name: 'get_weather',
        tool_call_id: 'call-456',
      },
    ]);
  });

  it('should convert a full multi-turn conversation with tool calling', () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'system',
        content: 'System prompt',
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Find info about API keys' }],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-789',
            toolName: 'query_api',
            input: { endpoint: '/keys' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-789',
            toolName: 'query_api',
            output: { type: 'json', value: { status: 'active' } },
          },
        ],
      },
    ];

    const result = convertToInkeepChatMessages(prompt);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ role: 'system', content: 'System prompt' });
    expect(result[1]).toEqual({ role: 'user', content: 'Find info about API keys' });
    expect(result[2]).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call-789',
          type: 'function',
          function: {
            name: 'query_api',
            arguments: JSON.stringify({ endpoint: '/keys' }),
          },
        },
      ],
    });
    expect(result[3]).toEqual({
      role: 'tool',
      content: JSON.stringify({ status: 'active' }),
      name: 'query_api',
      tool_call_id: 'call-789',
    });
  });
});
