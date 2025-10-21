import { describe, expect, it } from 'vitest';
import { generateAgentFile, DEFAULT_CODE_STYLE } from '../agent-generator';
import type { FullProjectDefinition } from '@inkeep/agents-core';

describe('agent-generator', () => {
  const mockProject: FullProjectDefinition = {
    id: 'test-project',
    name: 'Test Project',
    models: { base: { model: 'claude-sonnet-4' } },
    agents: {},
    tools: {}
  } as any;

  describe('generateAgentFile', () => {
    it('should generate a basic agent file', () => {
      const agentData = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A simple test agent',
        defaultSubAgentId: 'main-assistant',
        subAgents: {
          'main-assistant': {
            id: 'main-assistant',
            name: 'Main Assistant',
            description: 'Main assistant for the agent',
            prompt: 'You are a helpful assistant.',
            canUse: ['test-tool'],
            dataComponents: ['test-data'],
            canDelegateTo: []
          }
        }
      };

      const result = generateAgentFile('test-agent', agentData, mockProject);

      expect(result).toContain("import { agent, subAgent } from '@inkeep/agents-sdk';");
      expect(result).toContain("import { testTool } from '../tools/test-tool';");
      expect(result).toContain("import { testData } from '../data-components/test-data';");
      expect(result).toContain("export const testAgent = agent({");
      expect(result).toContain("id: 'test-agent',");
      expect(result).toContain("name: 'Test Agent',");
      expect(result).toContain("description: 'A simple test agent',");
      expect(result).toContain("defaultSubAgent: subAgent({");
      expect(result).toContain("id: 'main-assistant',");
      expect(result).toContain("name: 'Main Assistant',");
      expect(result).toContain("prompt: 'You are a helpful assistant.',");
      expect(result).toContain("canUse: () => [");
      expect(result).toContain("testTool,");
      expect(result).toContain("dataComponents: () => [");
      expect(result).toContain("testData,");
    });

    it('should handle agent without description', () => {
      const agentData = {
        id: 'simple-agent',
        name: 'Simple Agent',
        defaultSubAgentId: 'assistant',
        subAgents: {
          'assistant': {
            id: 'assistant',
            name: 'Assistant',
            canUse: [],
            canDelegateTo: []
          }
        }
      };

      const result = generateAgentFile('simple-agent', agentData, mockProject);

      expect(result).toContain("export const simpleAgent = agent({");
      expect(result).toContain("name: 'Simple Agent',");
      expect(result).not.toContain("description:");
    });

    it('should handle sub-agent without optional fields', () => {
      const agentData = {
        id: 'minimal-agent',
        name: 'Minimal Agent',
        defaultSubAgentId: 'minimal-assistant',
        subAgents: {
          'minimal-assistant': {
            id: 'minimal-assistant',
            name: 'Minimal Assistant'
          }
        }
      };

      const result = generateAgentFile('minimal-agent', agentData, mockProject);

      expect(result).toContain("subAgent({");
      expect(result).toContain("id: 'minimal-assistant',");
      expect(result).toContain("name: 'Minimal Assistant',");
      expect(result).not.toContain("description:");
      expect(result).not.toContain("prompt:");
      expect(result).not.toContain("canUse:");
      expect(result).not.toContain("dataComponents:");
      expect(result).not.toContain("canDelegateTo:");
    });

    it('should handle multiline prompts', () => {
      const agentData = {
        id: 'complex-agent',
        name: 'Complex Agent',
        defaultSubAgentId: 'complex-assistant',
        subAgents: {
          'complex-assistant': {
            id: 'complex-assistant',
            name: 'Complex Assistant',
            prompt: `You are a complex assistant that can:

1. Handle multiple tasks
2. Work with various tools
3. Provide detailed responses

Always be helpful and accurate.`
          }
        }
      };

      const result = generateAgentFile('complex-agent', agentData, mockProject);

      expect(result).toContain("prompt: `You are a complex assistant that can:");
      expect(result).toContain("1. Handle multiple tasks");
      expect(result).toContain("Always be helpful and accurate.`,");
    });

    it('should handle delegation to other sub-agents', () => {
      const agentData = {
        id: 'delegating-agent',
        name: 'Delegating Agent',
        defaultSubAgentId: 'main-assistant',
        subAgents: {
          'main-assistant': {
            id: 'main-assistant',
            name: 'Main Assistant',
            canDelegateTo: ['specialist-assistant']
          },
          'specialist-assistant': {
            id: 'specialist-assistant',
            name: 'Specialist Assistant',
            description: 'A specialized assistant',
            canUse: ['specialist-tool']
          }
        }
      };

      const result = generateAgentFile('delegating-agent', agentData, mockProject);

      expect(result).toContain("canDelegateTo: () => [");
      expect(result).toContain("subAgent({");
      expect(result).toContain("id: 'specialist-assistant',");
      expect(result).toContain("name: 'Specialist Assistant',");
      expect(result).toContain("description: 'A specialized assistant',");
    });

    it('should handle artifact components', () => {
      const agentData = {
        id: 'artifact-agent',
        name: 'Artifact Agent',
        defaultSubAgentId: 'artifact-assistant',
        subAgents: {
          'artifact-assistant': {
            id: 'artifact-assistant',
            name: 'Artifact Assistant',
            artifactComponents: ['document-template', 'code-generator']
          }
        }
      };

      const result = generateAgentFile('artifact-agent', agentData, mockProject);

      expect(result).toContain("import { documentTemplate } from '../artifact-components/document-template';");
      expect(result).toContain("import { codeGenerator } from '../artifact-components/code-generator';");
      expect(result).toContain("artifactComponents: () => [");
      expect(result).toContain("documentTemplate,");
      expect(result).toContain("codeGenerator,");
    });

    it('should handle tool references with toolId property', () => {
      const agentData = {
        id: 'tool-ref-agent',
        name: 'Tool Reference Agent',
        defaultSubAgentId: 'tool-assistant',
        subAgents: {
          'tool-assistant': {
            id: 'tool-assistant',
            name: 'Tool Assistant',
            canUse: [
              { toolId: 'simple-tool' },
              { toolId: 'complex-tool', headers: { 'x-api-key': 'secret' } },
              'string-tool'
            ]
          }
        }
      };

      const result = generateAgentFile('tool-ref-agent', agentData, mockProject);

      expect(result).toContain("import { simpleTool } from '../tools/simple-tool';");
      expect(result).toContain("import { complexTool } from '../tools/complex-tool';");
      expect(result).toContain("import { stringTool } from '../tools/string-tool';");
      expect(result).toContain("canUse: () => [");
      expect(result).toContain("simpleTool,");
      expect(result).toContain("complexTool,");
      expect(result).toContain("stringTool,");
    });

    it('should use double quotes when configured', () => {
      const agentData = {
        id: 'quote-agent',
        name: 'Quote Agent',
        defaultSubAgentId: 'quote-assistant',
        subAgents: {
          'quote-assistant': {
            id: 'quote-assistant',
            name: 'Quote Assistant'
          }
        }
      };

      const style = {
        ...DEFAULT_CODE_STYLE,
        quotes: 'double' as const
      };

      const result = generateAgentFile('quote-agent', agentData, mockProject, style);

      expect(result).toContain('import { agent, subAgent } from "@inkeep/agents-sdk";');
      expect(result).toContain('name: "Quote Agent",');
      expect(result).toContain('id: "quote-assistant",');
    });

    it('should handle different agent ID formats', () => {
      const agentData1 = {
        id: 'weather-agent',
        name: 'Weather Agent',
        defaultSubAgentId: 'assistant',
        subAgents: { 'assistant': { id: 'assistant', name: 'Assistant' } }
      };

      const agentData2 = {
        id: 'weather_agent',
        name: 'Weather Agent',
        defaultSubAgentId: 'assistant',
        subAgents: { 'assistant': { id: 'assistant', name: 'Assistant' } }
      };

      const result1 = generateAgentFile('weather-agent', agentData1, mockProject);
      const result2 = generateAgentFile('weather_agent', agentData2, mockProject);

      expect(result1).toContain('export const weatherAgent =');
      expect(result2).toContain('export const weatherAgent =');
    });

    it('should handle weird tool IDs like in examples', () => {
      const agentData = {
        id: 'weird-tool-agent',
        name: 'Weird Tool Agent',
        defaultSubAgentId: 'assistant',
        subAgents: {
          'assistant': {
            id: 'assistant',
            name: 'Assistant',
            canUse: ['fUI2riwrBVJ6MepT8rjx0', 'fdxgfv9HL7SXlfynPx8hf']
          }
        }
      };

      const result = generateAgentFile('weird-tool-agent', agentData, mockProject);

      expect(result).toContain("import { fUI2riwrBVJ6MepT8rjx0 } from '../tools/fui2riwrbvj6mept8rjx0';");
      expect(result).toContain("import { fdxgfv9HL7SXlfynPx8hf } from '../tools/fdxgfv9hl7sxlfynpx8hf';");
      expect(result).toContain("fUI2riwrBVJ6MepT8rjx0,");
      expect(result).toContain("fdxgfv9HL7SXlfynPx8hf,");
    });
  });
});