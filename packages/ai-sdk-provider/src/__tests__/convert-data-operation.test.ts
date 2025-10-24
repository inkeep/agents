import { describe, expect, it } from 'vitest';
import { convertDataOperationToToolEvent } from '../inkeep-chat-language-model';

// Now we can test the actual convertDataOperationToToolEvent function directly
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

      const result = convertDataOperationToToolEvent(opData);

      expect(result).toBeDefined();
      expect(result?.type).toBe('tool-call');

      if (result?.type === 'tool-call') {
        expect(result.toolCallId).toBe('call-123');
        expect(result.toolName).toBe('search');
        expect(result.input).toBe(JSON.stringify({ query: 'test' }));
      }
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

      const result = convertDataOperationToToolEvent(opData);

      expect(result).toBeDefined();
      expect(result?.type).toBe('tool-result');

      if (result?.type === 'tool-result') {
        expect(result.toolCallId).toBe('call-123');
        expect(result.toolName).toBe('search');
        expect(result.result).toEqual({
          content: [{ type: 'text', text: 'Search results' }],
        });
      }
    });

    it('should handle tool_result with direct output (no nested result)', () => {
      const opData = {
        type: 'tool_result',
        label: 'Tool result: search',
        details: {
          timestamp: Date.now(),
          subAgentId: 'agent-1',
          data: {
            toolName: 'search',
            toolCallId: 'call-456',
            output: { status: 'success', data: 'Direct result' },
          },
        },
      };

      const result = convertDataOperationToToolEvent(opData);

      expect(result).toBeDefined();

      if (result?.type === 'tool-result') {
        expect(result.result).toEqual({ status: 'success', data: 'Direct result' });
      }
    });
  });

  describe('transfer events', () => {
    it('should convert transfer to tool-call stream part', () => {
      const opData = {
        type: 'transfer',
        label: 'Transfer to specialist',
        details: {
          timestamp: Date.now(),
          subAgentId: 'router-agent',
          data: {
            fromSubAgent: 'router-agent',
            targetSubAgent: 'specialist-agent',
            reason: 'Specialized task',
            context: { taskId: '123' },
          },
        },
      };

      const result = convertDataOperationToToolEvent(opData);

      expect(result).toBeDefined();
      expect(result?.type).toBe('tool-call');

      if (result?.type === 'tool-call') {
        expect(result.toolCallId).toMatch(/^transfer_\d+$/);
        expect(result.toolName).toBe('specialist-agent');
        expect(JSON.parse(result.input as string)).toEqual({
          fromSubAgent: 'router-agent',
          reason: 'Specialized task',
          context: { taskId: '123' },
        });
      }
    });
  });

  describe('delegation_sent events', () => {
    it('should convert delegation_sent to tool-call stream part', () => {
      const opData = {
        type: 'delegation_sent',
        label: 'Delegation sent',
        details: {
          timestamp: Date.now(),
          subAgentId: 'coordinator',
          data: {
            delegationId: 'del-123',
            fromSubAgent: 'coordinator',
            targetSubAgent: 'worker',
            taskDescription: 'Complete the task',
            context: { priority: 'high' },
          },
        },
      };

      const result = convertDataOperationToToolEvent(opData);

      expect(result).toBeDefined();
      expect(result?.type).toBe('tool-call');

      if (result?.type === 'tool-call') {
        expect(result.toolCallId).toBe('del-123');
        expect(result.toolName).toBe('worker');
        expect(JSON.parse(result.input as string)).toEqual({
          fromSubAgent: 'coordinator',
          taskDescription: 'Complete the task',
          context: { priority: 'high' },
        });
      }
    });
  });

  describe('delegation_returned events', () => {
    it('should convert delegation_returned to tool-result stream part', () => {
      const opData = {
        type: 'delegation_returned',
        label: 'Delegation returned',
        details: {
          timestamp: Date.now(),
          subAgentId: 'worker',
          data: {
            delegationId: 'del-123',
            fromSubAgent: 'worker',
            targetSubAgent: 'coordinator',
            result: { status: 'completed', data: 'Task done' },
          },
        },
      };

      const result = convertDataOperationToToolEvent(opData);

      expect(result).toBeDefined();
      expect(result?.type).toBe('tool-result');

      if (result?.type === 'tool-result') {
        expect(result.toolCallId).toBe('del-123');
        expect(result.toolName).toBe('coordinator');
        expect(result.result).toEqual({ status: 'completed', data: 'Task done' });
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle null opData', () => {
      const result = convertDataOperationToToolEvent(null);
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

      const result = convertDataOperationToToolEvent(opData);
      expect(result).toBeNull();
    });

    it('should handle opData without details', () => {
      const opData = {
        type: 'tool_call',
        label: 'Tool call',
        details: null,
      };

      const result = convertDataOperationToToolEvent(opData);
      expect(result).toBeNull();
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

      const result = convertDataOperationToToolEvent(opData);
      expect(result).toBeNull();
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

      const result = convertDataOperationToToolEvent(opData);
      expect(result).toBeNull();
    });

    it('should handle non-object opData', () => {
      const result = convertDataOperationToToolEvent('not an object');
      expect(result).toBeNull();
    });

    it('should handle opData with missing type property', () => {
      const opData = {
        label: 'Some event',
        details: {
          timestamp: Date.now(),
          subAgentId: 'agent-1',
          data: { some: 'data' },
        },
      };

      const result = convertDataOperationToToolEvent(opData);
      expect(result).toBeNull();
    });
  });
});
