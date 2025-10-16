import { describe, expect, it } from 'vitest';
import { createPlaceholders } from '../../commands/pull.placeholder-system';

describe('Placeholder System - Status Components', () => {
  describe('JSON Schema to Zod conversion for statusComponents', () => {
    it('should convert status component detailsSchema from JSON Schema to Zod', () => {
      const data = {
        statusUpdates: {
          numEvents: 3,
          timeInSeconds: 15,
          statusComponents: [
            {
              type: 'tool_execution',
              description: 'Status of tool execution',
              detailsSchema: {
                type: 'object',
                properties: {
                  tool_name: {
                    type: 'string',
                    description: 'Name of the tool',
                  },
                  summary: {
                    type: 'string',
                    description: 'Brief summary',
                  },
                  status: {
                    type: 'string',
                    enum: ['success', 'error', 'in_progress'],
                    description: 'Execution status',
                  },
                },
                required: ['tool_name', 'summary'],
              },
            },
          ],
        },
      };

      const result = createPlaceholders(data);

      // The detailsSchema should be converted to Zod schema string
      const statusComponent = result.processedData.statusUpdates.statusComponents[0];
      expect(statusComponent.detailsSchema).toContain('z.object');
      expect(statusComponent.detailsSchema).toContain('tool_name');
      expect(statusComponent.detailsSchema).toContain('summary');
      expect(statusComponent.detailsSchema).toContain('status');

      // Type and description should remain unchanged
      expect(statusComponent.type).toBe('tool_execution');
      expect(statusComponent.description).toBe('Status of tool execution');
    });

    it('should handle multiple status components with detailsSchema', () => {
      const data = {
        statusUpdates: {
          statusComponents: [
            {
              type: 'tool_execution',
              detailsSchema: {
                type: 'object',
                properties: {
                  tool_name: { type: 'string' },
                },
              },
            },
            {
              type: 'progress_update',
              detailsSchema: {
                type: 'object',
                properties: {
                  step: { type: 'string' },
                  percentage: { type: 'number' },
                },
              },
            },
          ],
        },
      };

      const result = createPlaceholders(data);

      const components = result.processedData.statusUpdates.statusComponents;
      expect(components).toHaveLength(2);

      // Both should have Zod schemas
      expect(components[0].detailsSchema).toContain('z.object');
      expect(components[1].detailsSchema).toContain('z.object');
    });

    it('should handle status component without detailsSchema', () => {
      const data = {
        statusUpdates: {
          statusComponents: [
            {
              type: 'simple_status',
              description: 'Simple status without schema',
            },
          ],
        },
      };

      const result = createPlaceholders(data);

      const component = result.processedData.statusUpdates.statusComponents[0];
      expect(component.type).toBe('simple_status');
      expect(component.description).toBe('Simple status without schema');
      expect(component.detailsSchema).toBeUndefined();
    });

    it('should preserve statusUpdates config fields', () => {
      const data = {
        statusUpdates: {
          numEvents: 5,
          timeInSeconds: 20,
          prompt: 'Custom status update prompt',
          statusComponents: [
            {
              type: 'test',
              detailsSchema: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                },
              },
            },
          ],
        },
      };

      const result = createPlaceholders(data);

      const statusUpdates = result.processedData.statusUpdates;
      expect(statusUpdates.numEvents).toBe(5);
      expect(statusUpdates.timeInSeconds).toBe(20);
      expect(statusUpdates.prompt).toBe('Custom status update prompt');
      expect(statusUpdates.statusComponents).toHaveLength(1);
      expect(statusUpdates.statusComponents[0].detailsSchema).toContain('z.object');
    });

    it('should handle complex nested schemas in statusComponents', () => {
      const data = {
        statusUpdates: {
          statusComponents: [
            {
              type: 'complex_status',
              detailsSchema: {
                type: 'object',
                properties: {
                  operation: { type: 'string' },
                  result: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                        },
                      },
                    },
                  },
                  tags: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
            },
          ],
        },
      };

      const result = createPlaceholders(data);

      const component = result.processedData.statusUpdates.statusComponents[0];
      expect(component.detailsSchema).toContain('z.object');
      expect(component.detailsSchema).toContain('operation');
      expect(component.detailsSchema).toContain('result');
      expect(component.detailsSchema).toContain('tags');
    });
  });
});
