// biome-ignore-all lint/security/noGlobalEval: allow in test
/**
 * Unit tests for agent generator
 */

import { generateAgentDefinition as originalGenerateAgentDefinition } from '../../../pull-v4/agent-generator';
import { expectSnapshots } from '../../../pull-v4/utils';

function generateAgentDefinition(
  ...args: Parameters<typeof originalGenerateAgentDefinition>
): string {
  return originalGenerateAgentDefinition(...args).getFullText();
}

describe('Agent Generator', () => {
  const basicAgentData = {
    name: 'Personal Assistant Agent',
    description: 'A personalized AI assistant for managing tasks and information',
    defaultSubAgentId: 'personalAssistant',
    subAgents: {
      personalAssistant: { id: 'personalAssistant' },
      coordinatesAgent: { id: 'coordinatesAgent' },
    },
    contextConfig: { id: 'personalAgentContext' },
  };

  const complexAgentData = {
    name: 'Complex Personal Agent',
    description: 'A complex agent with status updates and transfer limits',
    defaultSubAgentId: 'mainAssistant',
    subAgents: {
      mainAssistant: { id: 'mainAssistant' },
      helperAgent: { id: 'helperAgent' },
      coordinatorAgent: { id: 'coordinatorAgent' },
    },
    contextConfig: { id: 'complexAgentContext' },
    stopWhen: {
      transferCountIs: 5,
    },
    statusUpdates: {
      numEvents: 3,
      timeInSeconds: 15,
      statusComponents: [{ type: 'toolSummary' }, { type: 'progressUpdate' }],
      prompt: 'Provide status updates on task progress and tool usage',
    },
  };

  describe('generateAgentDefinition', () => {
    it('should generate basic agent definition', async () => {
      const agentId = 'personal-agent';
      const definition = generateAgentDefinition({ agentId, ...basicAgentData });

      expect(definition).toContain('export const personalAgent = agent({');
      expect(definition).toContain("id: 'personal-agent',");
      expect(definition).toContain("name: 'Personal Assistant Agent',");
      expect(definition).toContain(
        "description: 'A personalized AI assistant for managing tasks and information',"
      );
      expect(definition).toContain('defaultSubAgent: personalAssistant,');
      expect(definition).toContain('subAgents: () => [');
      expect(definition).toContain('personalAssistant,');
      expect(definition).toContain('coordinatesAgent');
      expect(definition).toContain('contextConfig: personalAgentContext');
      expect(definition).toContain('});');
      expect(definition).not.toContain('coordinatesAgent,'); // No trailing comma
      await expectSnapshots(definition);
    });

    it('should generate agent with status updates', async () => {
      const agentId = 'complex-agent';
      const definition = generateAgentDefinition({ agentId, ...complexAgentData });

      expect(definition).toContain('export const complexAgent = agent({');
      expect(definition).toContain('statusUpdates: {');
      expect(definition).toContain('numEvents: 3,');
      expect(definition).toContain('timeInSeconds: 15,');
      expect(definition).toContain('statusComponents: [');
      expect(definition).toContain('toolSummary.config,');
      expect(definition).toContain('progressUpdate.config,');
      expect(definition).toContain(
        "prompt: 'Provide status updates on task progress and tool usage'"
      );
      expect(definition).toContain('},');
      await expectSnapshots(definition);
    });

    it('should generate agent with stopWhen configuration', async () => {
      const agentId = 'transfer-limited-agent';
      const definition = generateAgentDefinition({ agentId, ...complexAgentData });

      expect(definition).toContain('stopWhen: {');
      expect(definition).toContain('transferCountIs: 5 // Max transfers in one conversation');
      expect(definition).toContain('},');
      await expectSnapshots(definition);
    });

    it('should throw error for missing all required fields', () => {
      const agentId = 'fallback-agent';

      expect(() => {
        generateAgentDefinition({ agentId });
      }).toThrow(
        new Error(`Validation failed for agent:
✖ Invalid input: expected string, received undefined
  → at name
✖ Invalid input: expected string, received undefined
  → at defaultSubAgentId
✖ Invalid input
  → at subAgents`)
      );
    });

    it('should handle camelCase conversion for agent variable names', async () => {
      const agentId = 'my-complex-agent_v2';
      const definition = generateAgentDefinition({ agentId, ...basicAgentData });

      expect(definition).toContain('export const myComplexAgentV2 = agent({');
      await expectSnapshots(definition);
    });

    it('should handle multiline descriptions and prompts', async () => {
      const multilineData = {
        name: 'Test Agent',
        description:
          'This is a very long description that should be handled as a multiline string because it exceeds the normal length threshold for single line strings',
        defaultSubAgentId: 'defaultSubAgent',
        subAgents: ['subAgent1', 'subAgent2'],
        statusUpdates: {
          numEvents: 2,
          timeInSeconds: 10,
          statusComponents: ['status.config'],
          prompt:
            'This is a very long prompt that should be handled as a multiline string\nIt even contains newlines which should trigger multiline formatting',
        },
      };

      const agentId = 'multiline-agent';
      const definition = generateAgentDefinition({ agentId, ...multilineData });

      expect(definition).toContain('description: `This is a very long description');
      expect(definition).toContain('prompt: `This is a very long prompt');
      expect(definition).toContain('It even contains newlines');
      await expectSnapshots(definition);
    });

    it('should handle empty statusComponents array', async () => {
      const emptyStatusData = {
        ...complexAgentData,
        statusUpdates: {
          numEvents: 3,
          timeInSeconds: 15,
          statusComponents: [],
          prompt: 'Test prompt',
        },
      };

      const agentId = 'empty-status-agent';
      const definition = generateAgentDefinition({ agentId, ...emptyStatusData });

      expect(definition).toContain('statusUpdates: {');
      expect(definition).toContain('numEvents: 3,');
      expect(definition).toContain('timeInSeconds: 15,');
      expect(definition).toContain("prompt: 'Test prompt'");
      expect(definition).not.toContain('statusComponents:'); // Empty array should be omitted
      await expectSnapshots(definition);
    });

    it('should handle statusUpdates without all optional fields', async () => {
      const partialStatusData = {
        name: 'Partial Status Agent',
        defaultSubAgentId: 'defaultSubAgent',
        subAgents: ['subAgent1'],
        statusUpdates: {
          numEvents: 5,
          statusComponents: [{ type: 'summary' }],
        },
      };

      const agentId = 'partial-status-agent';
      const definition = generateAgentDefinition({ agentId, ...partialStatusData });

      expect(definition).toContain('statusUpdates: {');
      expect(definition).toContain('numEvents: 5,');
      expect(definition).toContain('statusComponents: [\n      summary.config,\n    ]');
      expect(definition).not.toContain('timeInSeconds:');
      expect(definition).not.toContain('prompt:');
      await expectSnapshots(definition);
    });

    it('should not generate stopWhen without transferCountIs', async () => {
      const noTransferCountData = {
        name: 'No Transfer Count Agent',
        defaultSubAgentId: 'defaultSubAgent',
        subAgents: ['subAgent1'],
        stopWhen: {
          someOtherProperty: 10,
        },
      };

      const agentId = 'no-transfer-agent';
      const definition = generateAgentDefinition({ agentId, ...noTransferCountData });

      expect(definition).not.toContain('stopWhen:');
      await expectSnapshots(definition);
    });
  });

  describe('compilation tests', () => {
    it('should generate agent code that compiles', async () => {
      const agentId = 'test-agent';
      const definition = generateAgentDefinition({ agentId, ...basicAgentData });
      const definitionWithoutExport = definition.replace('export const testAgent', 'const result');

      const moduleCode = `
        const agent = (config) => config;
        const personalAssistant = { type: 'subAgent' };
        const coordinatesAgent = { type: 'subAgent' };
        const personalAgentContext = { type: 'contextConfig' };
        
        ${definitionWithoutExport}
        
        return result;
      `;

      let result: any;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      expect(result).toBeDefined();
      expect(result.id).toBe('test-agent');
      expect(result.name).toBe('Personal Assistant Agent');
      await expectSnapshots(definition);
    });

    it('should generate complex agent code that compiles', async () => {
      const agentId = 'complex-test-agent';
      const definition = generateAgentDefinition({ agentId, ...complexAgentData });
      const definitionWithoutExport = definition.replace(
        'export const complexTestAgent',
        'const result'
      );

      const moduleCode = `
        const agent = (config) => config;
        const mainAssistant = { type: 'subAgent' };
        const helperAgent = { type: 'subAgent' };
        const coordinatorAgent = { type: 'subAgent' };
        const complexAgentContext = { type: 'contextConfig' };
        const toolSummary = { config: 'toolSummaryConfig' };
        const progressUpdate = { config: 'progressUpdateConfig' };
        
        ${definitionWithoutExport}
        
        return result;
      `;

      let result: any;
      expect(() => {
        result = eval(`(() => { ${moduleCode} })()`);
      }).not.toThrow();

      expect(result).toBeDefined();
      expect(result.id).toBe('complex-test-agent');
      expect(result.statusUpdates).toBeDefined();
      expect(result.statusUpdates.numEvents).toBe(3);
      expect(result.statusUpdates.timeInSeconds).toBe(15);
      expect(result.statusUpdates.statusComponents).toHaveLength(2);
      expect(result.statusUpdates.prompt).toBe(
        'Provide status updates on task progress and tool usage'
      );
      expect(result.stopWhen).toBeDefined();
      expect(result.stopWhen.transferCountIs).toBe(5);
      await expectSnapshots(definition);
    });

    it('should throw error for minimal agent without required fields', () => {
      const minimalData = { name: 'Minimal Test Agent' };
      const agentId = 'minimal-test-agent';
      expect(() => {
        generateAgentDefinition({ agentId, ...minimalData });
      }).toThrow(
        new Error(`Validation failed for agent:
✖ Invalid input: expected string, received undefined
  → at defaultSubAgentId
✖ Invalid input
  → at subAgents`)
      );
    });
  });

  describe('edge cases', () => {
    it('should throw error for empty string name', () => {
      const emptyStringData = {
        name: '',
        description: '',
        defaultSubAgentId: 'assistant',
        subAgents: ['subAgent1'],
      };
      const agentId = 'empty-strings-agent';
      expect(() => {
        generateAgentDefinition({ agentId, ...emptyStringData });
      }).toThrow(
        new Error(`Validation failed for agent:
✖ Too small: expected string to have >=1 characters
  → at name`)
      );
    });

    it('should throw error for null and undefined required values', () => {
      const nullData = {
        name: 'Test Agent',
        description: null,
        defaultSubAgentId: undefined,
        subAgents: null,
        contextConfig: undefined,
      };
      const agentId = 'null-values-agent';
      expect(() => {
        generateAgentDefinition({ agentId, ...nullData });
      }).toThrow(
        new Error(`Validation failed for agent:
✖ Invalid input: expected string, received undefined
  → at defaultSubAgentId
✖ Invalid input
  → at subAgents`)
      );
    });
  });
});
