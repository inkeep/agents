import path from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import type { ProjectPaths } from '../introspect-generator';
import { introspectGenerate } from '../introspect-generator';
import { cleanupTestEnvironment, createTestEnvironment } from './test-helpers';

describe('pull-v4 introspect generator', () => {
  let testDir: string;
  let projectPaths: ProjectPaths;

  beforeEach(() => {
    ({ testDir, projectPaths } = createTestEnvironment());
  });

  afterEach(() => {
    cleanupTestEnvironment(testDir);
  });

  it('does not keep stale delegate imports when the same sub-agent id is generated multiple times', async () => {
    const project: FullProjectDefinition = {
      id: 'duplicate-sub-agent-project',
      name: 'Duplicate Sub-Agent Project',
      models: {
        base: { model: 'anthropic/claude-sonnet-4-5' },
      },
      agents: {
        first: {
          id: 'first',
          name: 'First',
          defaultSubAgentId: 'shared-router',
          subAgents: {
            'shared-router': {
              id: 'shared-router',
              name: 'Shared Router',
              canDelegateTo: ['tier-one', 'tier-two'],
              canUse: [],
            },
            'tier-one': {
              id: 'tier-one',
              name: 'Tier One',
              canUse: [],
            },
            'tier-two': {
              id: 'tier-two',
              name: 'Tier Two',
              canUse: [],
            },
          },
        },
        second: {
          id: 'second',
          name: 'Second',
          defaultSubAgentId: 'shared-router',
          subAgents: {
            'shared-router': {
              id: 'shared-router',
              name: 'Shared Router',
              canDelegateTo: ['classifier-one'],
              canUse: [],
            },
            'classifier-one': {
              id: 'classifier-one',
              name: 'Classifier One',
              canUse: [],
            },
          },
        },
      },
    };

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const sharedSubAgentPath = path.join(projectPaths.agentsDir, 'sub-agents', 'shared-router.ts');
    const { default: sharedSubAgentFile } = await import(`${sharedSubAgentPath}?raw`);

    expect(sharedSubAgentFile).toContain("import { classifierOne } from './classifier-one';");
    expect(sharedSubAgentFile).not.toContain("import { tierOne } from './tier-one';");
    expect(sharedSubAgentFile).not.toContain("import { tierTwo } from './tier-two';");
    expect(sharedSubAgentFile).toContain('canDelegateTo: () => [classifierOne],');
  });

  it('uses the delegated sub-agent exported name instead of deriving it from id', async () => {
    const project: FullProjectDefinition = {
      id: 'named-delegate-sub-agent-project',
      name: 'Named Delegate Sub-Agent Project',
      models: {
        base: { model: 'anthropic/claude-sonnet-4-5' },
      },
      agents: {
        router: {
          id: 'router',
          name: 'Router',
          defaultSubAgentId: 'product-router',
          subAgents: {
            'product-router': {
              id: 'product-router',
              name: 'Product Router',
              canDelegateTo: ['tier1-specialist'],
              canUse: [],
            },
            'tier1-specialist': {
              id: 'tier1-specialist',
              name: 'Tier 1 High-Specificity Product Classifier',
              canUse: [],
            },
          },
        },
      },
    };

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const productRouterPath = path.join(projectPaths.agentsDir, 'sub-agents', 'product-router.ts');
    const { default: productRouterFile } = await import(`${productRouterPath}?raw`);

    expect(productRouterFile).toContain(
      "import { tier1HighSpecificityProductClassifier } from './tier1-specialist';"
    );
    expect(productRouterFile).toContain(
      'canDelegateTo: () => [tier1HighSpecificityProductClassifier],'
    );
    expect(productRouterFile).not.toContain(
      "import { tier1Specialist } from './tier1-specialist';"
    );
  });

  it('keeps agent sub-agent import name aligned when multiple agents share the same sub-agent id', async () => {
    const project: FullProjectDefinition = {
      id: 'shared-sub-agent-id-project',
      name: 'Shared Sub-Agent Id Project',
      models: {
        base: { model: 'anthropic/claude-sonnet-4-5' },
      },
      agents: {
        'calendar-test': {
          id: 'calendar-test',
          name: 'calendar-test',
          defaultSubAgentId: 'test',
          subAgents: {
            test: {
              id: 'test',
              name: 'Calendar Trigger',
              canUse: [],
            },
          },
        },
        test: {
          id: 'test',
          name: 'test',
          defaultSubAgentId: 'test',
          subAgents: {
            test: {
              id: 'test',
              name: 'test',
              canUse: [],
            },
          },
        },
      },
    };

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const calendarTestAgentPath = path.join(projectPaths.agentsDir, 'calendar-test.ts');
    const { default: calendarTestAgentFile } = await import(`${calendarTestAgentPath}?raw`);
    const sharedSubAgentPath = path.join(projectPaths.agentsDir, 'sub-agents', 'test.ts');
    const { default: sharedSubAgentFile } = await import(`${sharedSubAgentPath}?raw`);

    expect(sharedSubAgentFile).toContain('export const test = subAgent({');
    expect(calendarTestAgentFile).toContain("import { test } from './sub-agents/test';");
    expect(calendarTestAgentFile).toContain('defaultSubAgent: test,');
    expect(calendarTestAgentFile).toContain('subAgents: () => [test],');
  });
});
