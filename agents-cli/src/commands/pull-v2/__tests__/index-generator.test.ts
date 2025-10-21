import { describe, expect, it } from 'vitest';
import { 
  generateIndexFile, 
  generateSimpleIndexFile,
  DEFAULT_CODE_STYLE 
} from '../index-generator';
import type { FullProjectDefinition } from '@inkeep/agents-core';

describe('index-generator', () => {
  describe('generateIndexFile', () => {
    it('should generate a complete index file', () => {
      const project: FullProjectDefinition = {
        id: 'my-weather-project',
        name: 'Weather Project',
        description: 'Project containing sample agent framework',
        models: {
          base: { model: 'openai/gpt-4o-mini' }
        },
        agents: {
          'weather-agent': {
            id: 'weather-agent',
            name: 'Weather Agent',
            subAgents: {}
          },
          'data-workshop-agent': {
            id: 'data-workshop-agent',
            name: 'Data Workshop Agent',
            subAgents: {}
          }
        },
        tools: {}
      } as any;

      const result = generateIndexFile(project);

      expect(result).toContain("import { project } from '@inkeep/agents-sdk';");
      expect(result).toContain("import { weatherAgent } from './agents/weather-agent';");
      expect(result).toContain("import { dataWorkshopAgent } from './agents/data-workshop-agent';");
      expect(result).toContain("export const myWeatherProject = project({");
      expect(result).toContain("id: 'my-weather-project',");
      expect(result).toContain("name: 'Weather Project',");
      expect(result).toContain("description: 'Project containing sample agent framework',");
      expect(result).toContain("models: {");
      expect(result).toContain("base: {");
      expect(result).toContain("model: 'openai/gpt-4o-mini',");
      expect(result).toContain("agents: [");
      expect(result).toContain("weatherAgent,");
      expect(result).toContain("dataWorkshopAgent,");
    });

    it('should handle project without description', () => {
      const project: FullProjectDefinition = {
        id: 'simple-project',
        name: 'Simple Project',
        models: {
          base: { model: 'claude-sonnet-4' }
        },
        agents: {},
        tools: {}
      } as any;

      const result = generateIndexFile(project);

      expect(result).toContain("export const simpleProject = project({");
      expect(result).toContain("name: 'Simple Project',");
      expect(result).not.toContain("description:");
      expect(result).toContain("agents: []");
    });

    it('should handle project without agents', () => {
      const project: FullProjectDefinition = {
        id: 'no-agents-project',
        name: 'No Agents Project',
        models: {
          base: { model: 'claude-sonnet-4' }
        },
        agents: {},
        tools: {}
      } as any;

      const result = generateIndexFile(project);

      expect(result).toContain("import { project } from '@inkeep/agents-sdk';");
      expect(result).not.toContain("from './agents/");
      expect(result).toContain("agents: []");
    });

    it('should handle complex models configuration', () => {
      const project: FullProjectDefinition = {
        id: 'complex-project',
        name: 'Complex Project',
        models: {
          base: { 
            model: 'anthropic/claude-3-sonnet',
            temperature: 0.7,
            maxTokens: 4000
          },
          structuredOutput: {
            model: 'openai/gpt-4',
            temperature: 0.1
          }
        },
        agents: {},
        tools: {}
      } as any;

      const result = generateIndexFile(project);

      expect(result).toContain("models: {");
      expect(result).toContain("base: {");
      expect(result).toContain("model: 'anthropic/claude-3-sonnet',");
      expect(result).toContain("temperature: 0.7,");
      expect(result).toContain("maxTokens: 4000,");
      expect(result).toContain("structuredOutput: {");
      expect(result).toContain("model: 'openai/gpt-4',");
      expect(result).toContain("temperature: 0.1,");
    });

    it('should use double quotes when configured', () => {
      const project: FullProjectDefinition = {
        id: 'quote-project',
        name: 'Quote Project',
        models: { base: { model: 'claude' } },
        agents: {
          'test-agent': {
            id: 'test-agent',
            name: 'Test Agent',
            subAgents: {}
          }
        },
        tools: {}
      } as any;

      const style = {
        ...DEFAULT_CODE_STYLE,
        quotes: 'double' as const
      };

      const result = generateIndexFile(project, style);

      expect(result).toContain('import { project } from "@inkeep/agents-sdk";');
      expect(result).toContain('import { testAgent } from "./agents/test-agent";');
      expect(result).toContain('name: "Quote Project",');
    });

    it('should handle different project ID formats', () => {
      const project1: FullProjectDefinition = {
        id: 'my-awesome-project',
        name: 'Awesome Project',
        models: { base: { model: 'claude' } },
        agents: {},
        tools: {}
      } as any;

      const project2: FullProjectDefinition = {
        id: 'my_awesome_project',
        name: 'Awesome Project',
        models: { base: { model: 'claude' } },
        agents: {},
        tools: {}
      } as any;

      const result1 = generateIndexFile(project1);
      const result2 = generateIndexFile(project2);

      expect(result1).toContain('export const myAwesomeProject =');
      expect(result2).toContain('export const myAwesomeProject =');
    });
  });

  describe('generateSimpleIndexFile', () => {
    it('should generate a simple index file', () => {
      const result = generateSimpleIndexFile(
        'test-project',
        'Test Project',
        ['agent-1', 'agent-2']
      );

      expect(result).toContain("import { project } from '@inkeep/agents-sdk';");
      expect(result).toContain("import { agent1 } from './agents/agent-1';");
      expect(result).toContain("import { agent2 } from './agents/agent-2';");
      expect(result).toContain("export const testProject = project({");
      expect(result).toContain("id: 'test-project',");
      expect(result).toContain("name: 'Test Project',");
      expect(result).toContain("agents: [");
      expect(result).toContain("agent1,");
      expect(result).toContain("agent2,");
    });

    it('should handle empty agents array', () => {
      const result = generateSimpleIndexFile(
        'empty-project',
        'Empty Project',
        []
      );

      expect(result).toContain("import { project } from '@inkeep/agents-sdk';");
      expect(result).not.toContain("from './agents/");
      expect(result).toContain("export const emptyProject = project({");
      expect(result).toContain("agents: []");
    });

    it('should handle single agent', () => {
      const result = generateSimpleIndexFile(
        'single-agent-project',
        'Single Agent Project',
        ['main-agent']
      );

      expect(result).toContain("import { mainAgent } from './agents/main-agent';");
      expect(result).toContain("agents: [");
      expect(result).toContain("mainAgent,");
    });

    it('should use double quotes when configured', () => {
      const style = {
        ...DEFAULT_CODE_STYLE,
        quotes: 'double' as const
      };

      const result = generateSimpleIndexFile(
        'quote-project',
        'Quote Project',
        ['test-agent'],
        style
      );

      expect(result).toContain('import { project } from "@inkeep/agents-sdk";');
      expect(result).toContain('import { testAgent } from "./agents/test-agent";');
      expect(result).toContain('name: "Quote Project",');
    });

    it('should handle weird agent IDs', () => {
      const result = generateSimpleIndexFile(
        'weird-project',
        'Weird Project',
        ['agent-with-dashes', 'agent_with_underscores', 'AgentWithCamelCase']
      );

      expect(result).toContain("import { agentWithDashes } from './agents/agent-with-dashes';");
      expect(result).toContain("import { agentWithUnderscores } from './agents/agent-with-underscores';");
      expect(result).toContain("import { agentwithcamelcase } from './agents/agentwithcamelcase';");
      expect(result).toContain("agentWithDashes,");
      expect(result).toContain("agentWithUnderscores,");
      expect(result).toContain("agentwithcamelcase,");
    });

    it('should handle project names that need escaping', () => {
      const result = generateSimpleIndexFile(
        'escape-project',
        'Project with "quotes" and \\backslashes',
        []
      );

      expect(result).toContain("name: 'Project with \"quotes\" and \\backslashes',");
    });

    it('should handle multiline project names', () => {
      const result = generateSimpleIndexFile(
        'multiline-project',
        `This is a very long project name
that spans multiple lines
and should use template literals`,
        []
      );

      expect(result).toContain("name: `This is a very long project name");
      expect(result).toContain("that spans multiple lines");
      expect(result).toContain("and should use template literals`,");
    });
  });
});