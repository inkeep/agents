import { z } from '@hono/zod-openapi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BufferingStreamHelper,
  type HonoSSEStream,
  SSEStreamHelper,
  type StreamHelper,
} from '../../utils/stream-helpers';

describe('Tool auth error short-circuit behavior', () => {
  const toolName = 'Linear Ticketing';
  const toolId = 'tool_linear_01';
  const mcpServerUrl = 'https://mcp.example.com/linear';
  const authErrorMessage =
    `Authentication required: ${toolName} requires you to connect your account. ` +
    "This tool uses user-scoped credentials and you haven't connected yours yet. " +
    'DO NOT RETRY this tool — the user must authenticate first.';

  function createAuthErrorExecute(streamHelper: StreamHelper | undefined) {
    return async (_args: any, context?: any) => {
      const toolCallId = context?.toolCallId || 'generated-id';
      if (streamHelper) {
        await streamHelper.writeToolAuthRequired({
          toolCallId,
          toolName,
          toolId,
          mcpServerUrl,
          message: `${toolName} requires authentication. Connect your account to use this tool.`,
        });
      }
      return authErrorMessage;
    };
  }

  describe('auth error execute function', () => {
    it('returns auth error message with DO NOT RETRY instruction', async () => {
      const execute = createAuthErrorExecute(undefined);
      const result = await execute({});

      expect(result).toContain('Authentication required');
      expect(result).toContain(toolName);
      expect(result).toContain('DO NOT RETRY');
      expect(result).toContain('connect your account');
    });

    it('emits tool-auth-required stream event via streamHelper', async () => {
      const mockStreamHelper: StreamHelper = {
        writeRole: vi.fn().mockResolvedValue(undefined),
        writeContent: vi.fn().mockResolvedValue(undefined),
        streamData: vi.fn().mockResolvedValue(undefined),
        streamText: vi.fn().mockResolvedValue(undefined),
        writeError: vi.fn().mockResolvedValue(undefined),
        complete: vi.fn().mockResolvedValue(undefined),
        writeData: vi.fn().mockResolvedValue(undefined),
        writeOperation: vi.fn().mockResolvedValue(undefined),
        writeSummary: vi.fn().mockResolvedValue(undefined),
        writeToolInputStart: vi.fn().mockResolvedValue(undefined),
        writeToolInputDelta: vi.fn().mockResolvedValue(undefined),
        writeToolInputAvailable: vi.fn().mockResolvedValue(undefined),
        writeToolOutputAvailable: vi.fn().mockResolvedValue(undefined),
        writeToolOutputError: vi.fn().mockResolvedValue(undefined),
        writeToolApprovalRequest: vi.fn().mockResolvedValue(undefined),
        writeToolOutputDenied: vi.fn().mockResolvedValue(undefined),
        writeToolAuthRequired: vi.fn().mockResolvedValue(undefined),
      };

      const execute = createAuthErrorExecute(mockStreamHelper);
      const result = await execute({}, { toolCallId: 'call_test123' });

      expect(result).toContain('Authentication required');
      expect(mockStreamHelper.writeToolAuthRequired).toHaveBeenCalledTimes(1);
      expect(mockStreamHelper.writeToolAuthRequired).toHaveBeenCalledWith({
        toolCallId: 'call_test123',
        toolName: 'Linear Ticketing',
        toolId: 'tool_linear_01',
        mcpServerUrl: 'https://mcp.example.com/linear',
        message: 'Linear Ticketing requires authentication. Connect your account to use this tool.',
      });
    });

    it('uses generated toolCallId when context has none', async () => {
      const mockStreamHelper: StreamHelper = {
        writeRole: vi.fn().mockResolvedValue(undefined),
        writeContent: vi.fn().mockResolvedValue(undefined),
        streamData: vi.fn().mockResolvedValue(undefined),
        streamText: vi.fn().mockResolvedValue(undefined),
        writeError: vi.fn().mockResolvedValue(undefined),
        complete: vi.fn().mockResolvedValue(undefined),
        writeData: vi.fn().mockResolvedValue(undefined),
        writeOperation: vi.fn().mockResolvedValue(undefined),
        writeSummary: vi.fn().mockResolvedValue(undefined),
        writeToolInputStart: vi.fn().mockResolvedValue(undefined),
        writeToolInputDelta: vi.fn().mockResolvedValue(undefined),
        writeToolInputAvailable: vi.fn().mockResolvedValue(undefined),
        writeToolOutputAvailable: vi.fn().mockResolvedValue(undefined),
        writeToolOutputError: vi.fn().mockResolvedValue(undefined),
        writeToolApprovalRequest: vi.fn().mockResolvedValue(undefined),
        writeToolOutputDenied: vi.fn().mockResolvedValue(undefined),
        writeToolAuthRequired: vi.fn().mockResolvedValue(undefined),
      };

      const execute = createAuthErrorExecute(mockStreamHelper);
      await execute({});

      expect(mockStreamHelper.writeToolAuthRequired).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCallId: 'generated-id',
        })
      );
    });

    it('works without streamHelper (no streaming context)', async () => {
      const execute = createAuthErrorExecute(undefined);
      const result = await execute({}, { toolCallId: 'call_no_stream' });

      expect(result).toContain('Authentication required');
      expect(result).toContain('DO NOT RETRY');
    });
  });

  describe('placeholder tool structure', () => {
    it('creates a tool with description and parameters schema', () => {
      const placeholderTools: Record<string, any> = {
        [toolName]: {
          description: toolName,
          parameters: z.object({}),
          execute: createAuthErrorExecute(undefined),
        },
      };

      expect(placeholderTools[toolName]).toBeDefined();
      expect(placeholderTools[toolName].description).toBe(toolName);
      expect(placeholderTools[toolName].parameters).toBeDefined();
      expect(typeof placeholderTools[toolName].execute).toBe('function');
    });

    it('tool is keyed by tool name for LLM visibility', () => {
      const placeholderTools: Record<string, any> = {
        [toolName]: {
          description: toolName,
          parameters: z.object({}),
          execute: createAuthErrorExecute(undefined),
        },
      };

      expect(Object.keys(placeholderTools)).toEqual([toolName]);
    });
  });

  describe('SSEStreamHelper integration', () => {
    let sseMessages: Array<{ data: string }>;
    let mockStream: HonoSSEStream;
    let sseHelper: SSEStreamHelper;

    beforeEach(() => {
      sseMessages = [];
      mockStream = {
        writeSSE: vi.fn().mockImplementation(async (msg) => {
          sseMessages.push(msg);
        }),
        sleep: vi.fn().mockResolvedValue(undefined),
      };
      sseHelper = new SSEStreamHelper(mockStream, 'req-123', Date.now());
    });

    it('emits tool-auth-required event as JSON envelope', async () => {
      await sseHelper.writeToolAuthRequired({
        toolCallId: 'call_abc',
        toolName: 'Linear Ticketing',
        toolId: 'tool_linear_01',
        mcpServerUrl: 'https://mcp.example.com/linear',
        message: 'Linear Ticketing requires authentication. Connect your account to use this tool.',
      });

      expect(sseMessages).toHaveLength(1);
      const outerData = JSON.parse(sseMessages[0].data);
      const innerContent = JSON.parse(outerData.choices[0].delta.content);

      expect(innerContent.type).toBe('tool-auth-required');
      expect(innerContent.toolCallId).toBe('call_abc');
      expect(innerContent.toolName).toBe('Linear Ticketing');
      expect(innerContent.toolId).toBe('tool_linear_01');
      expect(innerContent.mcpServerUrl).toBe('https://mcp.example.com/linear');
      expect(innerContent.message).toContain('requires authentication');
    });

    it('omits optional fields when not provided', async () => {
      await sseHelper.writeToolAuthRequired({
        toolCallId: 'call_abc',
        toolName: 'GitHub',
        toolId: 'tool_github_01',
        message: 'GitHub requires authentication.',
      });

      const outerData = JSON.parse(sseMessages[0].data);
      const innerContent = JSON.parse(outerData.choices[0].delta.content);

      expect(innerContent.mcpServerUrl).toBeUndefined();
      expect(innerContent.authLink).toBeUndefined();
    });
  });

  describe('BufferingStreamHelper integration', () => {
    it('captures tool-auth-required in data array', async () => {
      const helper = new BufferingStreamHelper();

      await helper.writeToolAuthRequired({
        toolCallId: 'call_buf',
        toolName: 'Linear Ticketing',
        toolId: 'tool_linear_01',
        mcpServerUrl: 'https://mcp.example.com/linear',
        message: 'Linear Ticketing requires authentication.',
      });

      const response = helper.getCapturedResponse();
      expect(response.data).toHaveLength(1);
      expect(response.data[0]).toEqual({
        type: 'tool-auth-required',
        toolCallId: 'call_buf',
        toolName: 'Linear Ticketing',
        toolId: 'tool_linear_01',
        mcpServerUrl: 'https://mcp.example.com/linear',
        message: 'Linear Ticketing requires authentication.',
      });
    });

    it('captures multiple auth errors from different tools', async () => {
      const helper = new BufferingStreamHelper();

      await helper.writeToolAuthRequired({
        toolCallId: 'call_1',
        toolName: 'Linear',
        toolId: 'tool_linear',
        message: 'Linear requires authentication.',
      });

      await helper.writeToolAuthRequired({
        toolCallId: 'call_2',
        toolName: 'GitHub',
        toolId: 'tool_github',
        message: 'GitHub requires authentication.',
      });

      const response = helper.getCapturedResponse();
      expect(response.data).toHaveLength(2);
      expect(response.data[0].toolName).toBe('Linear');
      expect(response.data[1].toolName).toBe('GitHub');
    });
  });
});
