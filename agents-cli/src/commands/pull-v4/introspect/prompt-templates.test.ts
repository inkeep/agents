import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import type { ProjectPaths } from '../introspect-generator';
import { introspectGenerate } from '../introspect-generator';
import { cleanupTestEnvironment, createTestEnvironment, getTestPath } from './test-helpers';

describe('pull-v4 introspect generator', () => {
  let testDir: string;
  let projectPaths: ProjectPaths;

  beforeEach(() => {
    ({ testDir, projectPaths } = createTestEnvironment());
  });

  afterEach(() => {
    cleanupTestEnvironment(testDir);
  });

  it('replaces template variables in agent and sub-agent prompts with typed template helpers', async () => {
    const project: FullProjectDefinition = {
      id: 'activities-planner-project',
      name: 'Activities Planner Project',
      description: 'Project used for prompt template replacement coverage',
      models: {
        base: {
          model: 'gpt-4o-mini',
        },
      },
      agents: {
        'activities-planner-agent': {
          id: 'activities-planner-agent',
          name: 'Activities Planner Agent',
          prompt: 'Current time: {{time}} (timezone {{headers.tz}})',
          defaultSubAgentId: 'activities-planner',
          contextConfig: {
            id: 'activities-planner-context',
            headersSchema: {
              type: 'object',
              properties: {
                tz: {
                  type: 'string',
                },
              },
            },
            contextVariables: {
              time: {
                id: 'time',
                name: 'Time',
                trigger: 'invocation',
                fetchConfig: {
                  url: 'https://world-time-api3.p.rapidapi.com/timezone/{{headers.tz}}',
                  method: 'GET',
                },
                defaultValue: 'Unable to fetch timezone information',
              },
            },
          },
          subAgents: {
            'activities-planner': {
              id: 'activities-planner',
              name: 'Activities Planner',
              prompt: 'Use {{time}} in timezone {{headers.tz}}',
            },
          },
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'overwrite' });

    const agentFilePath = join(testDir, 'agents', 'activities-planner-agent.ts');
    const subAgentFilePath = join(testDir, 'agents', 'sub-agents', 'activities-planner.ts');
    const contextConfigFilePath = join(testDir, 'context-configs', 'activities-planner-context.ts');

    const { default: agentFile } = await import(`${agentFilePath}?raw`);
    const { default: subAgentFile } = await import(`${subAgentFilePath}?raw`);
    const { default: contextConfigFile } = await import(`${contextConfigFilePath}?raw`);

    expect(agentFile).toContain('activitiesPlannerContext.toTemplate("time")');
    expect(agentFile).toContain('activitiesPlannerContextHeaders.toTemplate("tz")');
    expect(agentFile).toContain(
      "import { activitiesPlannerContext, activitiesPlannerContextHeaders } from '../context-configs/activities-planner-context';"
    );

    expect(subAgentFile).toContain('activitiesPlannerContext.toTemplate("time")');
    expect(subAgentFile).toContain('activitiesPlannerContextHeaders.toTemplate("tz")');
    expect(subAgentFile).toContain(
      "import { activitiesPlannerContext, activitiesPlannerContextHeaders } from '../../context-configs/activities-planner-context';"
    );

    expect(contextConfigFile).toContain('const activitiesPlannerContextHeaders = headers({');

    await expect(agentFile).toMatchFileSnapshot(`${getTestPath()}-agent.ts`);
    await expect(subAgentFile).toMatchFileSnapshot(`${getTestPath()}-sub-agent.ts`);
    await expect(contextConfigFile).toMatchFileSnapshot(`${getTestPath()}-context-config.ts`);
  });
});
