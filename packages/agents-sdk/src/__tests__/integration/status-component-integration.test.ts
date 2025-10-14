import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { agent, statusComponent, subAgent } from '../../builderFunctions';

describe('StatusComponent Integration', () => {
  it('should integrate statusComponents with agent configuration', async () => {
    const toolSummary = statusComponent({
      type: 'tool_summary',
      description: 'Summary of tool execution',
      detailsSchema: z.object({
        tool_name: z.string(),
        summary: z.string(),
        status: z.enum(['success', 'error', 'in_progress']),
      }),
    });

    const progressUpdate = statusComponent({
      type: 'progress_update',
      description: 'Progress update',
      detailsSchema: z.object({
        step: z.string(),
        percentage: z.number().min(0).max(100).optional(),
      }),
    });

    const testAgent = subAgent({
      id: 'test-agent',
      name: 'Test Agent',
      prompt: 'Test agent prompt',
    });

    const testProject = agent({
      id: 'test-project',
      name: 'Test Project',
      defaultSubAgent: testAgent,
      subAgents: () => [testAgent],
      models: {
        base: { model: 'gpt-4' },
        summarizer: { model: 'gpt-4' },
      },
      statusUpdates: {
        numEvents: 3,
        timeInSeconds: 15,
        statusComponents: [toolSummary.config, progressUpdate.config],
      },
    });

    const agentDef = await testProject.toFullAgentDefinition();

    expect(agentDef.statusUpdates).toBeDefined();
    expect(agentDef.statusUpdates?.statusComponents).toHaveLength(2);
    expect(agentDef.statusUpdates?.statusComponents?.[0].type).toBe('tool_summary');
    expect(agentDef.statusUpdates?.statusComponents?.[1].type).toBe('progress_update');

    const schema1 = agentDef.statusUpdates?.statusComponents?.[0].detailsSchema;
    expect(schema1?.type).toBe('object');
    expect(schema1?.properties).toHaveProperty('tool_name');
    expect(schema1?.properties).toHaveProperty('summary');
    expect(schema1?.properties).toHaveProperty('status');
    expect(schema1?.required).toContain('tool_name');

    const schema2 = agentDef.statusUpdates?.statusComponents?.[1].detailsSchema;
    expect(schema2?.type).toBe('object');
    expect(schema2?.properties).toHaveProperty('step');
    expect(schema2?.properties).toHaveProperty('percentage');
  });

  it('should handle mixed JSON Schema and Zod schema status components', async () => {
    const zodComponent = statusComponent({
      type: 'zod_component',
      description: 'Component with Zod schema',
      detailsSchema: z.object({
        message: z.string(),
      }),
    });

    const jsonComponent = {
      type: 'json_component',
      description: 'Component with JSON schema',
      detailsSchema: {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
        required: ['value'],
      },
    };

    const testAgent = subAgent({
      id: 'mixed-agent',
      name: 'Mixed Agent',
      prompt: 'Test',
    });

    const testProject = agent({
      id: 'mixed-project',
      name: 'Mixed Project',
      defaultSubAgent: testAgent,
      statusUpdates: {
        statusComponents: [zodComponent.config, jsonComponent],
      },
    });

    const agentDef = await testProject.toFullAgentDefinition();

    expect(agentDef.statusUpdates?.statusComponents).toHaveLength(2);
    expect(agentDef.statusUpdates?.statusComponents?.[0].type).toBe('zod_component');
    expect(agentDef.statusUpdates?.statusComponents?.[1].type).toBe('json_component');

    const zodSchema = agentDef.statusUpdates?.statusComponents?.[0].detailsSchema;
    expect(zodSchema?.type).toBe('object');
    expect(zodSchema?.properties).toHaveProperty('message');

    const jsonSchema = agentDef.statusUpdates?.statusComponents?.[1].detailsSchema;
    expect(jsonSchema?.type).toBe('object');
    expect(jsonSchema?.properties).toHaveProperty('value');
    expect(jsonSchema?.required).toContain('value');
  });

  it('should handle status components without detailsSchema', async () => {
    const simpleComponent = statusComponent({
      type: 'simple',
      description: 'Simple status',
    });

    const testAgent = subAgent({
      id: 'simple-agent',
      name: 'Simple Agent',
      prompt: 'Test',
    });

    const testProject = agent({
      id: 'simple-project',
      name: 'Simple Project',
      defaultSubAgent: testAgent,
      statusUpdates: {
        statusComponents: [simpleComponent.config],
      },
    });

    const agentDef = await testProject.toFullAgentDefinition();

    expect(agentDef.statusUpdates?.statusComponents).toHaveLength(1);
    expect(agentDef.statusUpdates?.statusComponents?.[0].type).toBe('simple');
    expect(agentDef.statusUpdates?.statusComponents?.[0].description).toBe('Simple status');
    expect(agentDef.statusUpdates?.statusComponents?.[0].detailsSchema).toBeUndefined();
  });
});
