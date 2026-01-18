import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { statusComponent } from '../../builderFunctions';
import type { StatusComponentConfig } from '../../builders';

describe('statusComponent builder function', () => {
  it('should create a status component with JSON schema', () => {
    const config: StatusComponentConfig = {
      type: 'tool_call_summary',
      description: 'Summary of a tool execution',
      detailsSchema: {
        type: 'object',
        properties: {
          tool_name: { type: 'string' },
          summary: { type: 'string' },
          status: { type: 'string', enum: ['success', 'error', 'in_progress'] },
        },
        required: ['tool_name', 'summary'],
      },
    };

    const component = statusComponent(config);

    expect(component.getType()).toBe('tool_call_summary');
    expect(component.getDescription()).toBe('Summary of a tool execution');
    const schema = component.getDetailsSchema();
    expect(schema).toBeDefined();
    expect(schema?.type).toBe('object');
    expect(schema?.properties).toHaveProperty('tool_name');
    expect(schema?.properties).toHaveProperty('summary');
    expect(schema?.properties).toHaveProperty('status');
    expect(schema?.required).toEqual(['tool_name', 'summary']);
  });

  it('should create a status component with Zod schema', () => {
    const zodSchema = z.object({
      tool_name: z.string(),
      summary: z.string(),
      status: z.enum(['success', 'error', 'in_progress']),
    });

    const config: StatusComponentConfig = {
      type: 'tool_call_summary',
      description: 'Summary of a tool execution',
      detailsSchema: zodSchema,
    };

    const component = statusComponent(config);

    expect(component.getType()).toBe('tool_call_summary');
    expect(component.getDescription()).toBe('Summary of a tool execution');
    const schema = component.getDetailsSchema();
    expect(schema).toBeDefined();
    expect(schema?.type).toBe('object');
    expect(schema?.properties).toHaveProperty('tool_name');
    expect(schema?.properties).toHaveProperty('summary');
    expect(schema?.properties).toHaveProperty('status');
    expect(schema?.required).toContain('tool_name');
    expect(schema?.required).toContain('summary');
    expect(schema?.required).toContain('status');
  });

  it('should handle complex Zod schemas', () => {
    const zodSchema = z.object({
      tool_name: z.string().describe('The name of the tool'),
      summary: z.string().describe('Brief summary of the execution'),
      duration: z.number().optional().describe('Execution time in milliseconds'),
      metadata: z
        .object({
          tags: z.array(z.string()),
          priority: z.number().min(1).max(5),
        })
        .optional(),
    });

    const config: StatusComponentConfig = {
      type: 'detailed_tool_status',
      description: 'Detailed tool execution status',
      detailsSchema: zodSchema,
    };

    const component = statusComponent(config);

    const schema = component.getDetailsSchema();
    expect(schema).toBeDefined();
    expect(schema?.type).toBe('object');
    expect(schema?.properties).toHaveProperty('tool_name');
    expect(schema?.properties).toHaveProperty('summary');
    expect(schema?.properties).toHaveProperty('duration');
    expect(schema?.properties).toHaveProperty('metadata');
    expect(schema?.required).toContain('tool_name');
    expect(schema?.required).toContain('summary');
    expect(schema?.required).not.toContain('duration');
  });

  it('should handle status component without detailsSchema', () => {
    const config: StatusComponentConfig = {
      type: 'simple_status',
      description: 'Simple status without details',
    };

    const component = statusComponent(config);

    expect(component.getType()).toBe('simple_status');
    expect(component.getDescription()).toBe('Simple status without details');
    expect(component.getDetailsSchema()).toBeUndefined();
  });

  it('should handle status component without description', () => {
    const config: StatusComponentConfig = {
      type: 'no_description_status',
      detailsSchema: z.object({
        message: z.string(),
      }),
    };

    const component = statusComponent(config);

    expect(component.getType()).toBe('no_description_status');
    expect(component.getDescription()).toBeUndefined();
    const schema = component.getDetailsSchema();
    expect(schema).toBeDefined();
    expect(schema?.properties).toHaveProperty('message');
  });

  it('should convert Zod enum to JSON schema enum', () => {
    const zodSchema = z.object({
      status: z.enum(['pending', 'running', 'completed', 'failed']),
      level: z.enum(['low', 'medium', 'high']),
    });

    const config: StatusComponentConfig = {
      type: 'status_with_enums',
      description: 'Status component with enum fields',
      detailsSchema: zodSchema,
    };

    const component = statusComponent(config);
    const schema = component.getDetailsSchema();

    expect(schema?.properties?.status).toBeDefined();
    expect(schema?.properties?.level).toBeDefined();
  });

  it('should convert nested Zod objects correctly', () => {
    const zodSchema = z.object({
      operation: z.string(),
      result: z.object({
        success: z.boolean(),
        data: z.object({
          id: z.string(),
          name: z.string(),
        }),
      }),
    });

    const config: StatusComponentConfig = {
      type: 'nested_status',
      description: 'Status with nested objects',
      detailsSchema: zodSchema,
    };

    const component = statusComponent(config);
    const schema = component.getDetailsSchema();

    expect(schema?.properties?.operation).toBeDefined();
    expect(schema?.properties?.result).toBeDefined();
  });

  it('should handle Zod arrays correctly', () => {
    const zodSchema = z.object({
      operations: z.array(z.string()),
      results: z.array(
        z.object({
          id: z.string(),
          status: z.enum(['success', 'error']),
        })
      ),
    });

    const config: StatusComponentConfig = {
      type: 'array_status',
      description: 'Status with array fields',
      detailsSchema: zodSchema,
    };

    const component = statusComponent(config);
    const schema = component.getDetailsSchema();

    expect(schema?.properties?.operations).toBeDefined();
    expect(schema?.properties?.results).toBeDefined();
  });
});
