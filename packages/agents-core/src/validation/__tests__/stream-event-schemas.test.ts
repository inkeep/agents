import { describe, expect, it } from 'vitest';
import { StreamEventSchema, ToolAuthRequiredEventSchema } from '../stream-event-schemas';

describe('ToolAuthRequiredEventSchema', () => {
  const validEvent = {
    type: 'data-tool-auth-required' as const,
    toolCallId: 'call_abc123',
    toolName: 'Linear Ticketing',
    toolId: 'tool_linear_01',
    mcpServerUrl: 'https://mcp.example.com/linear',
    message: 'Authentication required: Linear Ticketing requires you to connect your account.',
  };

  it('validates a complete tool-auth-required event', () => {
    const result = ToolAuthRequiredEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('data-tool-auth-required');
      expect(result.data.toolCallId).toBe('call_abc123');
      expect(result.data.toolName).toBe('Linear Ticketing');
      expect(result.data.toolId).toBe('tool_linear_01');
      expect(result.data.mcpServerUrl).toBe('https://mcp.example.com/linear');
      expect(result.data.message).toBe(validEvent.message);
    }
  });

  it('validates with optional authLink field', () => {
    const event = {
      ...validEvent,
      authLink: 'https://manage.example.com/auth/linear',
    };
    const result = ToolAuthRequiredEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.authLink).toBe('https://manage.example.com/auth/linear');
    }
  });

  it('validates without optional mcpServerUrl and authLink', () => {
    const event = {
      type: 'data-tool-auth-required' as const,
      toolCallId: 'call_abc123',
      toolName: 'Linear Ticketing',
      toolId: 'tool_linear_01',
      message: 'Authentication required.',
    };
    const result = ToolAuthRequiredEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mcpServerUrl).toBeUndefined();
      expect(result.data.authLink).toBeUndefined();
    }
  });

  it('rejects event missing required toolName', () => {
    const event = {
      type: 'data-tool-auth-required' as const,
      toolCallId: 'call_abc123',
      toolId: 'tool_linear_01',
      message: 'Auth required.',
    };
    const result = ToolAuthRequiredEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects event missing required toolId', () => {
    const event = {
      type: 'data-tool-auth-required' as const,
      toolCallId: 'call_abc123',
      toolName: 'Linear',
      message: 'Auth required.',
    };
    const result = ToolAuthRequiredEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects event missing required message', () => {
    const event = {
      type: 'data-tool-auth-required' as const,
      toolCallId: 'call_abc123',
      toolName: 'Linear',
      toolId: 'tool_linear_01',
    };
    const result = ToolAuthRequiredEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

describe('StreamEventSchema discriminated union', () => {
  it('parses data-tool-auth-required as a valid stream event', () => {
    const event = {
      type: 'data-tool-auth-required' as const,
      data: {
        type: 'data-tool-auth-required' as const,
        toolCallId: 'call_abc123',
        toolName: 'Linear Ticketing',
        toolId: 'tool_linear_01',
        message: 'Authentication required.',
      },
    };
    const result = StreamEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('still parses existing tool-output-error events', () => {
    const event = {
      type: 'tool-output-error' as const,
      toolCallId: 'call_abc123',
      errorText: 'Something went wrong',
    };
    const result = StreamEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('still parses existing tool-approval-request events', () => {
    const event = {
      type: 'tool-approval-request' as const,
      approvalId: 'approval_1',
      toolCallId: 'call_abc123',
    };
    const result = StreamEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });
});
