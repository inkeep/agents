/**
 * Unit tests for component parser
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildComponentRegistryFromParsing,
  findComponentById,
  getAllLocalComponentIds,
} from './component-parser';

describe('Component Parser', () => {
  let testDir: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = join(tmpdir(), 'component-parser-test-' + Date.now());
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should parse exported components', () => {
    // Create test file with exported components
    const testFile = join(testDir, 'index.ts');
    writeFileSync(
      testFile,
      `
import { agent, tool, dataComponent } from '@inkeep/agents-sdk';

export const myAgent = agent({
  id: 'my-agent-id',
  name: 'My Agent',
  description: 'Test agent'
});

export const myTool = tool({
  id: 'my-tool-id',
  name: 'My Tool'
});

export const myData = dataComponent({
  id: 'my-data-id',
  name: 'My Data'
});
    `
    );

    const registry = buildComponentRegistryFromParsing(testDir);
    const components = registry.getAllComponents();

    expect(components).toHaveLength(3);
    
    const agent = registry.get('my-agent-id', 'agents');
    expect(agent).toBeDefined();
    expect(agent?.type).toBe('agents');
    expect(agent?.name).toBe('myAgent');
    expect(agent?.filePath).toBe('index.ts');

    const tool = registry.get('my-tool-id', 'tools');
    expect(tool).toBeDefined();
    expect(tool?.type).toBe('tools');
    expect(tool?.name).toBe('myTool');

    const data = registry.get('my-data-id', 'dataComponents');
    expect(data).toBeDefined();
    expect(data?.type).toBe('dataComponents');
    expect(data?.name).toBe('myData');
  });

  it('should parse inline components', () => {
    // Create test file with inline components
    const testFile = join(testDir, 'agent.ts');
    writeFileSync(
      testFile,
      `
import { agent, subAgent, dataComponent } from '@inkeep/agents-sdk';

export const mainAgent = agent({
  id: 'main-agent',
  name: 'Main Agent',
  subAgents: () => [
    subAgent({
      id: 'sub-agent-1',
      name: 'Sub Agent 1'
    }),
    subAgent({
      id: 'sub-agent-2', 
      name: 'Sub Agent 2'
    })
  ],
  dataComponents: () => [
    dataComponent({
      id: 'inline-data',
      name: 'Inline Data'
    })
  ]
});
    `
    );

    const registry = buildComponentRegistryFromParsing(testDir);
    const components = registry.getAllComponents();

    expect(components).toHaveLength(4); // 1 exported + 3 inline

    // Check exported component
    const mainAgent = registry.get('main-agent', 'agents');
    expect(mainAgent).toBeDefined();
    expect(mainAgent?.name).toBe('mainAgent');

    // Check inline components
    const sub1 = registry.get('sub-agent-1', 'subAgents');
    expect(sub1).toBeDefined();
    expect(sub1?.type).toBe('subAgents');
    expect(sub1?.name).toBe('subAgent1'); // Generated variable name

    const sub2 = registry.get('sub-agent-2', 'subAgents');
    expect(sub2).toBeDefined();
    expect(sub2?.type).toBe('subAgents');
    expect(sub2?.name).toBe('subAgent2');

    const inlineData = registry.get('inline-data', 'dataComponents');
    expect(inlineData).toBeDefined();
    expect(inlineData?.type).toBe('dataComponents');
    expect(inlineData?.name).toBe('inlineData');
  });

  it('should handle multiple files', () => {
    // Create multiple test files
    mkdirSync(join(testDir, 'agents'));
    mkdirSync(join(testDir, 'tools'));

    writeFileSync(
      join(testDir, 'index.ts'),
      `
export const myProject = project({
  id: 'test-project',
  name: 'Test Project'
});
    `
    );

    writeFileSync(
      join(testDir, 'agents', 'agent1.ts'),
      `
export const agent1 = agent({
  id: 'agent-1',
  name: 'Agent 1'
});
    `
    );

    writeFileSync(
      join(testDir, 'tools', 'tool1.ts'),
      `
export const tool1 = tool({
  id: 'tool-1',
  name: 'Tool 1'
});
    `
    );

    const registry = buildComponentRegistryFromParsing(testDir);
    const components = registry.getAllComponents();

    expect(components).toHaveLength(3);

    const project = registry.get('test-project', 'project');
    expect(project?.filePath).toBe('index.ts');

    const agent = registry.get('agent-1', 'agents');
    expect(agent?.filePath).toBe('agents/agent1.ts');

    const tool = registry.get('tool-1', 'tools');
    expect(tool?.filePath).toBe('tools/tool1.ts');
  });

  it('should find component by ID', () => {
    const testFile = join(testDir, 'test.ts');
    writeFileSync(
      testFile,
      `
export const myAgent = agent({
  id: 'find-me',
  name: 'Find Me'
});
    `
    );

    const found = findComponentById('find-me', testDir);
    expect(found).toBeDefined();
    expect(found?.id).toBe('find-me');
    expect(found?.type).toBe('agents');
    expect(found?.variableName).toBe('myAgent');
    expect(found?.isInline).toBe(false);

    const notFound = findComponentById('not-there', testDir);
    expect(notFound).toBeNull();
  });

  it('should get all local component IDs', () => {
    const testFile = join(testDir, 'components.ts');
    writeFileSync(
      testFile,
      `
export const agent1 = agent({id: 'agent-1'});
export const tool1 = tool({id: 'tool-1'});
export const data1 = dataComponent({id: 'data-1'});
    `
    );

    const ids = getAllLocalComponentIds(testDir);
    expect(ids.size).toBe(3);
    expect(ids.has('agent-1')).toBe(true);
    expect(ids.has('tool-1')).toBe(true);
    expect(ids.has('data-1')).toBe(true);
    expect(ids.has('not-there')).toBe(false);
  });

  it('should handle kebab-case and snake_case IDs', () => {
    const testFile = join(testDir, 'test.ts');
    writeFileSync(
      testFile,
      `
export const kebabTool = tool({
  id: 'kebab-case-tool'
});

// Inline with snake_case
const agent1 = agent({
  dataComponents: () => [
    dataComponent({
      id: 'snake_case_data'
    })
  ]
});
    `
    );

    const registry = buildComponentRegistryFromParsing(testDir);
    
    const kebab = registry.get('kebab-case-tool', 'tools');
    expect(kebab?.name).toBe('kebabTool');

    const snake = registry.get('snake_case_data', 'dataComponents');
    expect(snake?.name).toBe('snakeCaseData'); // Should convert to camelCase
  });
});
