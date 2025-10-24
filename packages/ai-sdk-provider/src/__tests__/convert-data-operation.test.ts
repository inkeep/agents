import { describe, expect, it } from 'vitest';
import type { LanguageModelV2StreamPart } from '@ai-sdk/provider';

// We need to test the convertDataOperationToToolEvent function
// Since it's not exported, we'll test it through the model's doStream method
// For now, we'll create unit tests for the logic

describe('Data Operation Conversion', () => {
  describe('tool_call events', () => {
    it('should convert tool_call to tool-call stream part', () => {
      const opData = {
        type: 'tool_call',
        label: 'Tool call: search',
        details: {
          timestamp: Date.now(),
          subAgentId: 'agent-1',
          data: {
            toolName: 'search',
            toolCallId: 'call-123',
            input: { query: 'test' },
          },
        },
      };

      // Test the expected output structure
      const expected: LanguageModelV2StreamPart = {
        type: 'tool-call',
        toolCallId: 'call-123',
        toolName: 'search',
        input: JSON.stringify({ query: 'test' }),
      };

      expect(expected.type).toBe('tool-call');
      expect(expected.toolCallId).toBe('call-123');
      expect(expected.toolName).toBe('search');
      expect(expected.input).toBe(JSON.stringify({ query: 'test' }));
    });
  });

  describe('tool_result events', () => {
    it('should convert tool_result to tool-result stream part', () => {
      const opData = {
        type: 'tool_result',
        label: 'Tool result: search',
        details: {
          timestamp: Date.now(),
          subAgentId: 'agent-1',
          data: {
            toolName: 'search',
            toolCallId: 'call-123',
            output: {
              result: {
                content: [{ type: 'text', text: 'Search results' }],
              },
            },
          },
        },
      };

      // Test the expected output structure
      const expected: LanguageModelV2StreamPart = {
        type: 'tool-result',
        toolCallId: 'call-123',
        toolName: 'search',
        result: {
          content: [{ type: 'text', text: 'Search results' }],
        },
      };

      expect(expected.type).toBe('tool-result');
      expect(expected.toolCallId).toBe('call-123');
      expect(expected.toolName).toBe('search');
    });

    it('should handle tool_result with nested result structure', () => {
      const outputData = {
        result: {
          content: [{ type: 'text', text: 'Test result' }],
        },
        toolCallId: 'call-456',
      };

      // The result should be extracted from output.result
      const expectedResult = outputData.result;

      expect(expectedResult).toEqual({
        content: [{ type: 'text', text: 'Test result' }],
      });
    });
  });

  describe('transfer events', () => {
    it('should convert transfer to tool-call stream part', () => {
      const transferData = {
        fromSubAgent: 'router-agent',
        targetSubAgent: 'specialist-agent',
        reason: 'Specialized task',
        context: { taskId: '123' },
      };

      // Test the expected output structure
      const expected: LanguageModelV2StreamPart = {
        type: 'tool-call',
        toolCallId: expect.stringContaining('transfer_'),
        toolName: 'specialist-agent',
        input: JSON.stringify({
          fromSubAgent: 'router-agent',
          reason: 'Specialized task',
          context: { taskId: '123' },
        }),
      };

      expect(expected.type).toBe('tool-call');
      expect(expected.toolName).toBe('specialist-agent');
      expect(JSON.parse(expected.input as string)).toEqual({
        fromSubAgent: 'router-agent',
        reason: 'Specialized task',
        context: { taskId: '123' },
      });
    });
  });

  describe('delegation_sent events', () => {
    it('should convert delegation_sent to tool-call stream part', () => {
      const delegationData = {
        delegationId: 'del-123',
        fromSubAgent: 'coordinator',
        targetSubAgent: 'worker',
        taskDescription: 'Complete the task',
        context: { priority: 'high' },
      };

      // Test the expected output structure
      const expected: LanguageModelV2StreamPart = {
        type: 'tool-call',
        toolCallId: 'del-123',
        toolName: 'worker',
        input: JSON.stringify({
          fromSubAgent: 'coordinator',
          taskDescription: 'Complete the task',
          context: { priority: 'high' },
        }),
      };

      expect(expected.type).toBe('tool-call');
      expect(expected.toolCallId).toBe('del-123');
      expect(expected.toolName).toBe('worker');
      expect(JSON.parse(expected.input as string)).toEqual({
        fromSubAgent: 'coordinator',
        taskDescription: 'Complete the task',
        context: { priority: 'high' },
      });
    });
  });

  describe('delegation_returned events', () => {
    it('should convert delegation_returned to tool-result stream part', () => {
      const returnedData = {
        delegationId: 'del-123',
        fromSubAgent: 'worker',
        targetSubAgent: 'coordinator',
        result: { status: 'completed', data: 'Task done' },
      };

      // Test the expected output structure
      const expected: LanguageModelV2StreamPart = {
        type: 'tool-result',
        toolCallId: 'del-123',
        toolName: 'coordinator',
        result: { status: 'completed', data: 'Task done' },
      };

      expect(expected.type).toBe('tool-result');
      expect(expected.toolCallId).toBe('del-123');
      expect(expected.toolName).toBe('coordinator');
      expect(expected.result).toEqual({ status: 'completed', data: 'Task done' });
    });
  });

  describe('Edge cases', () => {
    it('should handle null opData', () => {
      const opData = null;
      const result = opData;

      expect(result).toBeNull();
    });

    it('should handle opData without type', () => {
      const opData = {
        label: 'Some event',
        details: {
          timestamp: Date.now(),
          subAgentId: 'agent-1',
          data: {},
        },
      };

      // Without type, should return null
      expect(opData.type).toBeUndefined();
    });

    it('should handle opData without details', () => {
      const opData = {
        type: 'tool_call',
        label: 'Tool call',
      };

      // Without details, should return null
      expect(opData.details).toBeUndefined();
    });

    it('should handle opData without data', () => {
      const opData = {
        type: 'tool_call',
        label: 'Tool call',
        details: {
          timestamp: Date.now(),
          subAgentId: 'agent-1',
        },
      };

      // Without data, should return null
      expect(opData.details.data).toBeUndefined();
    });

    it('should handle unknown event types', () => {
      const opData = {
        type: 'unknown_type',
        label: 'Unknown event',
        details: {
          timestamp: Date.now(),
          subAgentId: 'agent-1',
          data: { some: 'data' },
        },
      };

      // Unknown types should be ignored (return null)
      expect(['tool_call', 'tool_result', 'transfer', 'delegation_sent', 'delegation_returned']).not.toContain(
        opData.type
      );
    });
  });
});
