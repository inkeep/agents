// biome-ignore-all lint/security/noGlobalEval: allow in test
/**
 * Unit tests for sub-agent generator
 */

import { generateSubAgentDefinition as originalGenerateSubAgentDefinition } from '../generators/sub-agent-generator';
import { expectSnapshots } from '../utils';

function generateSubAgentDefinition(
  ...args: Parameters<typeof originalGenerateSubAgentDefinition>
): string {
  return originalGenerateSubAgentDefinition(...args).getFullText();
}

describe('Sub-Agent Generator', () => {
  const basicSubAgentData = {
    name: 'Personal Assistant',
    description: 'A personalized AI assistant.',
    prompt: "Hello! I'm your personal assistant.",
    canUse: [{ toolId: 'calculateBMI' }, { toolId: 'weatherTool' }],
    canDelegateTo: ['coordinatesAgent', 'teamAgent'],
    dataComponents: ['taskList'],
    artifactComponents: ['citation'],
  };

  const complexSubAgentData = {
    name: 'Advanced Assistant',
    description: 'An advanced AI assistant with complex capabilities and step limits.',
    prompt:
      'I am an advanced assistant ready to help you with complex tasks.\nI can handle multiple types of requests.',
    canUse: [{ toolId: 'tool1' }, { toolId: 'tool2' }, { toolId: 'tool3' }],
    canDelegateTo: ['agent1', 'agent2'],
    canTransferTo: ['legacyAgent'],
    dataComponents: ['component1', 'component2'],
    artifactComponents: ['artifact1'],
    stopWhen: {
      stepCountIs: 20,
    },
  };

  describe('generateSubAgentDefinition', () => {
    it('should generate basic sub-agent definition', async () => {
      const subAgentId = 'personal-assistant';
      const definition = generateSubAgentDefinition({
        id: subAgentId,
        ...basicSubAgentData,
      });

      expect(definition).toContain('export const personalAssistant = subAgent({');
      expect(definition).toContain("id: 'personal-assistant',");
      expect(definition).toContain("name: 'Personal Assistant',");
      expect(definition).toContain("description: 'A personalized AI assistant.',");
      expect(definition).toContain(`prompt: "Hello! I'm your personal assistant.",`);
      expect(definition).toContain('canUse: () => [');
      expect(definition).toContain('calculateBMI,');
      expect(definition).toContain('weatherTool');
      expect(definition).toContain('canDelegateTo: () => [');
      expect(definition).toContain('coordinatesAgent,');
      expect(definition).toContain('teamAgent');
      expect(definition).toContain('dataComponents: () => [taskList]');
      expect(definition).toContain('artifactComponents: () => [citation]');
      expect(definition).toContain('});');
      await expectSnapshots(definition);
    });

    it('should generate sub-agent with stopWhen configuration', async () => {
      const subAgentId = 'advanced-assistant';
      const definition = generateSubAgentDefinition({
        id: subAgentId,
        ...complexSubAgentData,
      });

      expect(definition).toContain('export const advancedAssistant = subAgent({');
      expect(definition).toContain('stopWhen: {');
      expect(definition).toContain('stepCountIs: 20,');
      expect(definition).toContain('}');
      await expectSnapshots(definition);
    });

    it('should handle single item arrays in single line format', async () => {
      const singleItemData = {
        name: 'Single Item Agent',
        description: 'Agent with single items',
        prompt: 'I am a single item agent.',
        canUse: [{ toolId: 'onlyTool' }],
        dataComponents: ['onlyComponent'],
      };
      const subAgentId = 'single-item-agent';

      const definition = generateSubAgentDefinition({
        id: subAgentId,
        ...singleItemData,
      });

      expect(definition).toContain('canUse: () => [onlyTool]');
      expect(definition).toContain('dataComponents: () => [onlyComponent]');
      expect(definition).not.toContain('canUse: () => [\n'); // Single line format
      await expectSnapshots(definition);
    });

    it('should handle multiple items in multi-line format', async () => {
      const subAgentId = 'multi-item-agent';
      const definition = generateSubAgentDefinition({
        id: subAgentId,
        ...complexSubAgentData,
      });

      expect(definition).toContain('canUse: () => [tool1, tool2, tool3],');
      await expectSnapshots(definition);
    });

    it.skip('should not throw error for minimal agent with just name (description and prompt are optional)', () => {
      const minimalData = {
        name: 'Minimal Agent',
      };

      expect(() => {
        generateSubAgentDefinition('minimal-agent', minimalData);
      }).not.toThrow();
    });

    it('should generate name from ID when name is missing', async () => {
      const subAgentId = 'fallback-agent';

      const definition = generateSubAgentDefinition({ id: subAgentId });

      // Should generate a human-readable name from the ID
      expect(definition).toContain("name: 'Fallback Agent',");
      await expectSnapshots(definition);
    });

    it('should handle camelCase conversion for variable names', async () => {
      const subAgentId = 'my-complex-sub-agent_v2';
      const definition = generateSubAgentDefinition({
        id: subAgentId,
        ...basicSubAgentData,
      });

      expect(definition).toContain('export const myComplexSubAgentV2 = subAgent({');
      await expectSnapshots(definition);
    });

    it('should handle multiline prompts and descriptions', async () => {
      const multilineData = {
        name: 'Multiline Agent',
        description:
          'This is a very long description that should be handled as a multiline string because it exceeds the normal length threshold for single line strings',
        prompt:
          'This is a very long prompt that should be handled as a multiline string\nIt even contains newlines which should trigger multiline formatting',
      };
      const subAgentId = 'multiline-agent';

      const definition = generateSubAgentDefinition({
        id: subAgentId,
        ...multilineData,
      });

      expect(definition).toContain("description: 'This is a very long description");
      expect(definition).toContain('prompt: `This is a very long prompt');
      expect(definition).toContain('It even contains newlines');
      await expectSnapshots(definition);
    });

    it('should handle empty arrays', async () => {
      const emptyArraysData = {
        name: 'Empty Arrays Agent',
        description: 'Agent with empty arrays',
        prompt: 'I have empty arrays.',
        canUse: [],
        canDelegateTo: [],
        dataComponents: [],
        artifactComponents: [],
      };
      const subAgentId = 'empty-arrays-agent';

      const definition = generateSubAgentDefinition({
        id: subAgentId,
        ...emptyArraysData,
      });

      expect(definition).toContain("name: 'Empty Arrays Agent'");
      expect(definition).not.toContain('canUse:'); // Empty arrays should be omitted
      expect(definition).not.toContain('canDelegateTo:');
      expect(definition).not.toContain('dataComponents:');
      expect(definition).not.toContain('artifactComponents:');
      await expectSnapshots(definition);
    });

    it('should handle canTransferTo (legacy support)', async () => {
      const transferData = {
        name: 'Transfer Agent',
        description: 'Agent with transfer capability',
        prompt: 'I can transfer to legacy agents.',
        canTransferTo: ['legacyAgent1', 'legacyAgent2'],
      };
      const subAgentId = 'transfer-agent';

      const definition = generateSubAgentDefinition({
        id: subAgentId,
        ...transferData,
      });

      expect(definition).toContain('canTransferTo: () => [');
      expect(definition).toContain('legacyAgent1,');
      expect(definition).toContain('legacyAgent2');
      await expectSnapshots(definition);
    });

    it('should not generate stopWhen without stepCountIs', async () => {
      const noStepCountData = {
        name: 'No Step Count Agent',
        description: 'Agent without step count',
        prompt: 'I do not have step count.',
        stopWhen: {
          someOtherProperty: 10,
        },
      };
      const subAgentId = 'no-step-agent';

      const definition = generateSubAgentDefinition({
        id: subAgentId,
        ...noStepCountData,
      });

      expect(definition).toContain('stopWhen: {},');
      await expectSnapshots(definition);
    });

    it('should handle stopWhen with only stepCountIs', async () => {
      const stepCountOnlyData = {
        name: 'Step Count Only Agent',
        description: 'Agent with step count limit',
        prompt: 'I have a step count limit.',
        stopWhen: {
          stepCountIs: 15,
          otherProperty: 'ignored',
        },
      };
      const subAgentId = 'step-count-agent';

      const definition = generateSubAgentDefinition({
        id: subAgentId,
        ...stepCountOnlyData,
      });

      expect(definition).toContain('stopWhen: {');
      expect(definition).toContain('stepCountIs: 15,');
      expect(definition).toContain('}');
      expect(definition).not.toContain('otherProperty');
      await expectSnapshots(definition);
    });
  });

  describe('generateSubAgentFile', () => {
    it('should generate complete sub-agent file', async () => {
      const subAgentId = 'personal-assistant';
      const file = generateSubAgentDefinition({
        id: subAgentId,
        ...basicSubAgentData,
      });

      expect(file).toContain("import { subAgent } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const personalAssistant = subAgent({');
      expect(file).toContain('canUse: () => [');
      expect(file).toContain('calculateBMI,');
      expect(file).toContain('weatherTool');

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
      await expectSnapshots(file);
    });

    it('should generate complex sub-agent file with all features', async () => {
      const subAgentId = 'advanced-assistant';
      const file = generateSubAgentDefinition({
        id: subAgentId,
        ...complexSubAgentData,
      });

      expect(file).toContain("import { subAgent } from '@inkeep/agents-sdk';");
      expect(file).toContain('export const advancedAssistant = subAgent({');
      expect(file).toContain('stopWhen: {');
      expect(file).toContain('canUse: () => [');
      expect(file).toContain('canDelegateTo: () => [');
      expect(file).toContain('canTransferTo: () => [');

      // Should have proper spacing
      expect(file).toMatch(/import.*\n\n.*export/s);
      expect(file.endsWith('\n')).toBe(true);
      await expectSnapshots(file);
    });
  });

  describe('compilation tests', () => {
    it.skip('should not throw error for minimal sub-agent with just name', () => {
      const minimalData = { name: 'Minimal Test Agent' };

      expect(() => {
        generateSubAgentDefinition('minimal-test-sub-agent', minimalData);
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should preserve empty string name when provided', async () => {
      const emptyStringData = {
        name: '',
        description: '',
        prompt: '',
      };
      const subAgentId = 'empty-strings-sub-agent';

      // Empty strings are intentionally preserved (not auto-generated from ID)
      // This allows remote projects to have empty names if needed
      const definition = generateSubAgentDefinition({
        id: subAgentId,
        ...emptyStringData,
      });
      expect(definition).toContain("name: '',");
      await expectSnapshots(definition);
    });

    it.skip('should not throw error when name is provided (other fields can be null/undefined)', () => {
      const nullData = {
        name: 'Test Sub Agent',
        description: null,
        prompt: undefined,
        canUse: null,
        canDelegateTo: undefined,
        dataComponents: null,
        artifactComponents: undefined,
      };

      expect(() => {
        generateSubAgentDefinition('null-values-sub-agent', nullData);
      }).not.toThrow();
    });

    it('should handle mixed array and reference types', async () => {
      const mixedData = {
        name: 'Mixed Types Agent',
        description: 'Agent with mixed reference types',
        prompt: 'I work with mixed types.',
        canUse: [{ toolId: 'stringTool' }],
        dataComponents: ['stringComponent'],
      };
      const subAgentId = 'mixed-types-sub-agent';

      const definition = generateSubAgentDefinition({
        id: subAgentId,
        ...mixedData,
      });

      expect(definition).toContain('canUse: () => [stringTool]');
      expect(definition).toContain('dataComponents: () => [stringComponent]');
      await expectSnapshots(definition);
    });

    it('should generate name from ID when name is missing', async () => {
      const subAgentId = 'missing-name';
      const data = {
        description: 'Test description',
        prompt: 'Test prompt',
      };
      const definition = generateSubAgentDefinition({ id: subAgentId, ...data });

      // Should generate name from ID
      expect(definition).toContain("name: 'Missing Name',");
      expect(definition).toContain("description: 'Test description',");
      await expectSnapshots(definition);
    });

    it.skip('should not throw error for missing description (now optional)', () => {
      expect(() => {
        generateSubAgentDefinition('missing-desc', {
          name: 'Test Agent',
          prompt: 'Test prompt',
        });
      }).not.toThrow();
    });

    it.skip('should not throw error for missing prompt (now optional)', () => {
      expect(() => {
        generateSubAgentDefinition('missing-prompt', {
          name: 'Test Agent',
          description: 'Test description',
        });
      }).not.toThrow();
    });
  });
});
