import { describe, expect, it, vi } from 'vitest';
import {
  createSSEStreamHelper,
  createVercelStreamHelper,
} from '../../../domains/run/utils/stream-helpers';

describe('tool streaming', () => {
  describe('SSEStreamHelper (chat completions)', () => {
    it('streams tool_calls deltas and tool output envelopes', async () => {
      const sent: string[] = [];

      const stream = {
        writeSSE: vi.fn(async ({ data }: { data: string }) => {
          sent.push(data);
        }),
        sleep: vi.fn(async () => {}),
      };

      const helper = createSSEStreamHelper(stream as any, 'req_123', Math.floor(Date.now() / 1000));

      await helper.writeToolInputStart({ toolCallId: 'call_1234xyz', toolName: 'get_weather' });
      expect(sent).toHaveLength(1);
      const first = JSON.parse(sent[0]);
      expect(first.object).toBe('chat.completion.chunk');
      expect(first.choices[0].delta.tool_calls).toEqual([
        {
          index: 0,
          id: 'call_1234xyz',
          type: 'function',
          function: { name: 'get_weather', arguments: '' },
        },
      ]);

      await helper.writeToolInputDelta({ toolCallId: 'call_1234xyz', inputTextDelta: '{"' });
      const second = JSON.parse(sent[1]);
      expect(second.choices[0].delta.tool_calls).toEqual([
        {
          index: 0,
          id: null,
          type: null,
          function: { name: null, arguments: '{"' },
        },
      ]);

      await helper.writeToolOutputAvailable({ toolCallId: 'call_1234xyz', output: { ok: true } });
      const third = JSON.parse(sent[2]);
      expect(third.choices[0].delta.content).toBeTypeOf('string');
      expect(JSON.parse(third.choices[0].delta.content)).toEqual({
        type: 'tool-output-available',
        toolCallId: 'call_1234xyz',
        output: { ok: true },
      });

      await helper.writeToolOutputError({ toolCallId: 'call_1234xyz', errorText: 'boom' });
      const fourth = JSON.parse(sent[3]);
      expect(JSON.parse(fourth.choices[0].delta.content)).toEqual({
        type: 'tool-output-error',
        toolCallId: 'call_1234xyz',
        errorText: 'boom',
        output: null,
      });

      await helper.writeToolApprovalRequest({
        approvalId: 'aitxt-call_1234xyz',
        toolCallId: 'call_1234xyz',
      });
      const fifth = JSON.parse(sent[4]);
      expect(JSON.parse(fifth.choices[0].delta.content)).toEqual({
        type: 'tool-approval-request',
        approvalId: 'aitxt-call_1234xyz',
        toolCallId: 'call_1234xyz',
      });

      await helper.writeToolOutputDenied({ toolCallId: 'call_1234xyz' });
      const sixth = JSON.parse(sent[5]);
      expect(JSON.parse(sixth.choices[0].delta.content)).toEqual({
        type: 'tool-output-denied',
        toolCallId: 'call_1234xyz',
      });
    });
  });

  describe('VercelDataStreamHelper (AI SDK UI stream)', () => {
    it('writes tool-input/tool-output parts as top-level chunks', async () => {
      const writer = {
        write: vi.fn(),
        merge: vi.fn(),
        onError: vi.fn(),
      };

      const helper = createVercelStreamHelper(writer as any);

      await helper.writeToolInputStart({ toolCallId: 'call_1', toolName: 'delete_file' });
      await helper.writeToolInputDelta({ toolCallId: 'call_1', inputTextDelta: '{"' });
      await helper.writeToolInputAvailable({
        toolCallId: 'call_1',
        toolName: 'delete_file',
        input: { filePath: 'user/none.md' },
      });
      await helper.writeToolOutputAvailable({ toolCallId: 'call_1', output: { success: true } });
      await helper.writeToolOutputError({ toolCallId: 'call_1', errorText: 'nope' });
      await helper.writeToolApprovalRequest({ approvalId: 'aitxt-call_1', toolCallId: 'call_1' });
      await helper.writeToolOutputDenied({ toolCallId: 'call_1' });

      expect(writer.write).toHaveBeenCalledWith({
        type: 'tool-input-start',
        toolCallId: 'call_1',
        toolName: 'delete_file',
      });
      expect(writer.write).toHaveBeenCalledWith({
        type: 'tool-input-delta',
        toolCallId: 'call_1',
        inputTextDelta: '{"',
      });
      expect(writer.write).toHaveBeenCalledWith({
        type: 'tool-input-available',
        toolCallId: 'call_1',
        toolName: 'delete_file',
        input: { filePath: 'user/none.md' },
      });
      expect(writer.write).toHaveBeenCalledWith({
        type: 'tool-output-available',
        toolCallId: 'call_1',
        output: { success: true },
      });
      expect(writer.write).toHaveBeenCalledWith({
        type: 'tool-output-error',
        toolCallId: 'call_1',
        errorText: 'nope',
      });
      expect(writer.write).toHaveBeenCalledWith({
        type: 'tool-approval-request',
        approvalId: 'aitxt-call_1',
        toolCallId: 'call_1',
      });
      expect(writer.write).toHaveBeenCalledWith({
        type: 'tool-output-denied',
        toolCallId: 'call_1',
      });
    });
  });
});
