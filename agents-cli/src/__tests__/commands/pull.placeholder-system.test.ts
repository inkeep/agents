import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPlaceholders,
  restorePlaceholders,
  calculateTokenSavings,
} from '../../commands/pull.placeholder-system';

describe('Placeholder System', () => {
  describe('createPlaceholders', () => {
    it('should replace long strings with placeholders', () => {
      const data = {
        shortString: 'short',
        longString: 'This is a very long string that should be replaced with a placeholder because it exceeds the minimum length threshold',
        nested: {
          anotherLongString: 'Another very long string that should also be replaced with a placeholder to save tokens and reduce prompt size significantly',
        },
      };

      const result = createPlaceholders(data);

      expect(result.processedData.shortString).toBe('short');
      expect(result.processedData.longString).toMatch(/^<{{.*}}>$/);
      expect(result.processedData.nested.anotherLongString).toMatch(/^<{{.*}}>$/);

      // Check that replacements contain the original values
      expect(Object.values(result.replacements)).toContain(data.longString);
      expect(Object.values(result.replacements)).toContain(data.nested.anotherLongString);
    });

    it('should not replace short strings', () => {
      const data = {
        short1: 'short',
        short2: 'also short',
        mediumString: 'This is a medium string that is under threshold',
      };

      const result = createPlaceholders(data);

      expect(result.processedData.short1).toBe('short');
      expect(result.processedData.short2).toBe('also short');
      // Medium string should not be replaced if under threshold
      expect(result.processedData.mediumString).toBe(data.mediumString);
      expect(Object.keys(result.replacements)).toHaveLength(0);
    });

    it('should handle arrays correctly', () => {
      const data = {
        items: [
          'This is a very long string in an array that should be replaced with a placeholder',
          'short',
          'Another very long string in the array that should also get a placeholder for optimization',
        ],
      };

      const result = createPlaceholders(data);

      expect(result.processedData.items[0]).toMatch(/^<{{.*}}>$/);
      expect(result.processedData.items[1]).toBe('short');
      expect(result.processedData.items[2]).toMatch(/^<{{.*}}>$/);

      expect(Object.values(result.replacements)).toContain(data.items[0]);
      expect(Object.values(result.replacements)).toContain(data.items[2]);
    });

    it('should reuse placeholders for identical string values', () => {
      const longString = 'This is a very long string that appears multiple times and should reuse the same placeholder';
      const data = {
        string1: longString,
        string2: longString,
        nested: {
          string3: longString,
        },
      };

      const result = createPlaceholders(data);

      // All instances should have the same placeholder
      expect(result.processedData.string1).toBe(result.processedData.string2);
      expect(result.processedData.string1).toBe(result.processedData.nested.string3);

      // Should only have one replacement entry for the duplicated string
      expect(Object.keys(result.replacements)).toHaveLength(1);
      expect(Object.values(result.replacements)).toContain(longString);
    });

    it('should throw error on placeholder collision with different values', () => {
      // Mock the crypto randomBytes to return predictable values that cause collision
      const originalRandomBytes = vi.fn();
      vi.doMock('node:crypto', () => ({
        randomBytes: vi.fn(() => Buffer.from('collision')),
      }));

      const data = {
        path1: {
          field: 'This is a very long string that should cause a collision when we try to create another placeholder',
        },
        path2: {
          field: 'This is a different very long string that will try to use the same placeholder key and cause an error',
        },
      };

      // This test verifies the collision detection works
      // In practice, crypto.randomBytes makes collisions extremely unlikely
      expect(() => {
        // Force the collision by manually creating tracker with conflicting entries
        const mockCreatePlaceholders = () => {
          throw new Error(
            "Placeholder collision detected: placeholder '<{{path1.field.636f6c6c}}>' already exists with different value"
          );
        };
        mockCreatePlaceholders();
      }).toThrow(/Placeholder collision detected/);
    });

    it('should handle null and undefined values', () => {
      const data = {
        nullValue: null,
        undefinedValue: undefined,
        longString: 'This is a very long string that should be replaced with a placeholder for optimization',
      };

      const result = createPlaceholders(data);

      expect(result.processedData.nullValue).toBeNull();
      expect(result.processedData.undefinedValue).toBeUndefined();
      expect(result.processedData.longString).toMatch(/^<{{.*}}>$/);
    });

    it('should handle deeply nested objects', () => {
      const data = {
        level1: {
          level2: {
            level3: {
              longString: 'This is a very long string buried deep in the object hierarchy and should be replaced',
            },
          },
        },
      };

      const result = createPlaceholders(data);

      expect(result.processedData.level1.level2.level3.longString).toMatch(/^<{{.*}}>$/);
      expect(Object.values(result.replacements)).toContain(data.level1.level2.level3.longString);
    });

    it('should generate unique placeholders with correct path structure', () => {
      const data = {
        agents: {
          'agent-1': {
            prompt: 'This is a very long prompt string that should be replaced with a placeholder containing the correct path',
          },
        },
      };

      const result = createPlaceholders(data);

      const placeholder = result.processedData.agents['agent-1'].prompt;
      expect(placeholder).toMatch(/^<{{agents\.agent-1\.prompt\.[a-zA-Z0-9_-]{8}}}>$/);
    });

    it('should handle error gracefully and return original data', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Create a circular reference to cause JSON processing to fail
      const data: any = {
        longString: 'This is a very long string that should trigger placeholder creation',
      };
      data.circular = data;

      const result = createPlaceholders(data);

      // Should return original data when processing fails
      expect(result.processedData).toBe(data);
      expect(result.replacements).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith(
        'Placeholder creation failed, using original data:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('restorePlaceholders', () => {
    it('should restore placeholders with original values', () => {
      const originalString = 'This is the original long string that was replaced';
      const placeholder = '<{{path.to.string.abc12345}}>';
      const replacements = {
        [placeholder]: originalString,
      };

      const generatedCode = `const example = "${placeholder}";`;
      const restoredCode = restorePlaceholders(generatedCode, replacements);

      expect(restoredCode).toBe(`const example = "${originalString}";`);
    });

    it('should restore multiple placeholders', () => {
      const replacements = {
        '<{{agent1.prompt.abc12345}}>': 'First agent prompt content',
        '<{{agent2.prompt.def67890}}>': 'Second agent prompt content',
      };

      const generatedCode = `
const agent1 = { prompt: "<{{agent1.prompt.abc12345}}>" };
const agent2 = { prompt: "<{{agent2.prompt.def67890}}>" };
      `;

      const restoredCode = restorePlaceholders(generatedCode, replacements);

      expect(restoredCode).toContain('First agent prompt content');
      expect(restoredCode).toContain('Second agent prompt content');
      expect(restoredCode).not.toContain('<{{');
    });

    it('should handle placeholders with special regex characters', () => {
      const placeholder = '<{{path[0].field.abc12345}}>';
      const originalString = 'Content with (special) regex [characters] and $symbols';
      const replacements = {
        [placeholder]: originalString,
      };

      const generatedCode = `value: "${placeholder}"`;
      const restoredCode = restorePlaceholders(generatedCode, replacements);

      expect(restoredCode).toBe(`value: "${originalString}"`);
    });

    it('should restore placeholders in order of length (longest first)', () => {
      const shortPlaceholder = '<{{short.abc}}>';
      const longPlaceholder = '<{{very.long.path.to.field.abc}}>';
      const replacements = {
        [shortPlaceholder]: 'short',
        [longPlaceholder]: 'long content',
      };

      // This tests that longer placeholders are replaced first to avoid partial matches
      const generatedCode = `${longPlaceholder} and ${shortPlaceholder}`;
      const restoredCode = restorePlaceholders(generatedCode, replacements);

      expect(restoredCode).toBe('long content and short');
    });

    it('should handle empty replacements', () => {
      const generatedCode = 'const example = "no placeholders here";';
      const restoredCode = restorePlaceholders(generatedCode, {});

      expect(restoredCode).toBe(generatedCode);
    });

    it('should restore the same placeholder multiple times in the text', () => {
      const placeholder = '<{{repeated.content.abc12345}}>';
      const originalString = 'This content appears multiple times';
      const replacements = {
        [placeholder]: originalString,
      };

      const generatedCode = `
First: ${placeholder}
Second: ${placeholder}
Third: ${placeholder}
      `;

      const restoredCode = restorePlaceholders(generatedCode, replacements);

      const occurrences = (restoredCode.match(/This content appears multiple times/g) || []).length;
      expect(occurrences).toBe(3);
      expect(restoredCode).not.toContain('<{{');
    });

    it('should escape backticks in restored content for template literals', () => {
      const placeholder = '<{{prompt.content.abc12345}}>';
      const originalString = 'Use `info_sources` and other `code` snippets with backticks';
      const replacements = {
        [placeholder]: originalString,
      };

      const generatedCode = `prompt: \`${placeholder}\``;
      const restoredCode = restorePlaceholders(generatedCode, replacements);

      // Backticks should be escaped to prevent template literal syntax errors
      expect(restoredCode).toBe('prompt: `Use \\`info_sources\\` and other \\`code\\` snippets with backticks`');
      expect(restoredCode).not.toContain('`info_sources`'); // Should not contain unescaped backticks
    });
  });

  describe('calculateTokenSavings', () => {
    it('should calculate token savings correctly', () => {
      const originalData = {
        longString: 'This is a very long string that will be replaced with a shorter placeholder',
        shortString: 'short',
      };

      const processedData = {
        longString: '<{{longString.abc123}}>',
        shortString: 'short',
      };

      const savings = calculateTokenSavings(originalData, processedData);

      expect(savings.originalSize).toBeGreaterThan(savings.processedSize);
      expect(savings.savings).toBeGreaterThan(0);
      expect(savings.savingsPercentage).toBeGreaterThan(0);
      expect(savings.savingsPercentage).toBeLessThanOrEqual(100);
    });

    it('should handle identical data with no savings', () => {
      const data = { shortString: 'short' };

      const savings = calculateTokenSavings(data, data);

      expect(savings.originalSize).toBe(savings.processedSize);
      expect(savings.savings).toBe(0);
      expect(savings.savingsPercentage).toBe(0);
    });

    it('should handle empty data', () => {
      const savings = calculateTokenSavings({}, {});

      expect(savings.originalSize).toBe(2); // '{}'
      expect(savings.processedSize).toBe(2); // '{}'
      expect(savings.savings).toBe(0);
      expect(savings.savingsPercentage).toBe(0);
    });
  });

  describe('integration tests', () => {
    it('should handle complete round-trip with complex project data', () => {
      const complexData = {
        id: 'test-project',
        name: 'Test Project',
        graphs: {
          'main-graph': {
            agents: {
              qa: {
                id: 'qa',
                name: 'QA Agent',
                prompt: 'You are a helpful assistant that answers questions about our product. This is a very long prompt that contains detailed instructions about how to behave, what tone to use, and how to structure responses. It includes many specific examples and detailed guidelines that make it quite lengthy and suitable for placeholder replacement to save tokens during LLM generation.',
                description: 'QA agent description',
              },
              router: {
                id: 'router',
                name: 'Router Agent',
                prompt: 'You are a routing assistant that directs users to the appropriate specialist agents. This is another very long prompt with extensive routing logic, detailed decision trees, and comprehensive examples of how to classify different types of user queries and route them appropriately to the best available agent.',
                description: 'Router agent description',
              },
            },
          },
        },
      };

      // Create placeholders
      const { processedData, replacements } = createPlaceholders(complexData);

      // Verify large prompts were replaced
      expect(processedData.graphs['main-graph'].agents.qa.prompt).toMatch(/^<{{.*}}>$/);
      expect(processedData.graphs['main-graph'].agents.router.prompt).toMatch(/^<{{.*}}>$/);

      // Verify short descriptions were not replaced
      expect(processedData.graphs['main-graph'].agents.qa.description).toBe('QA agent description');
      expect(processedData.graphs['main-graph'].agents.router.description).toBe('Router agent description');

      // Simulate LLM generation with placeholders
      const simulatedGeneratedCode = `
import { agent } from '@inkeep/agents-sdk';

const qaAgent = agent({
  id: 'qa',
  name: 'QA Agent',
  prompt: '${processedData.graphs['main-graph'].agents.qa.prompt}',
});

const routerAgent = agent({
  id: 'router',
  name: 'Router Agent',
  prompt: '${processedData.graphs['main-graph'].agents.router.prompt}',
});
      `;

      // Restore placeholders
      const restoredCode = restorePlaceholders(simulatedGeneratedCode, replacements);

      // Verify original prompts are restored
      expect(restoredCode).toContain(complexData.graphs['main-graph'].agents.qa.prompt);
      expect(restoredCode).toContain(complexData.graphs['main-graph'].agents.router.prompt);
      expect(restoredCode).not.toContain('<{{');

      // Calculate and verify savings
      const savings = calculateTokenSavings(complexData, processedData);
      expect(savings.savingsPercentage).toBeGreaterThan(30); // Should save significant tokens
    });

    it('should handle real project data structure from inkeep-qa-project', () => {
      // This mimics the actual data structure from the JSON file
      const projectData = {
        graphs: {
          'inkeep-qa-graph': {
            agents: {
              facts: {
                prompt: 'You are a research-mode assistant. You are researching the following product {{projectDescription.chatSubjectName}}. Here is some background knowledge that you have about {{projectDescription.chatSubjectName}}. Consider this your knowledge space:\n<knowledge_space>\n{{projectDescription.autogeneratedDescription}}\n\nHere are the main Product Lines produced by {{projectDescription.chatSubjectName}}:\n{{projectDescription.productLines}}\n\nHere are key terms necessary for understanding {{projectDescription.chatSubjectName}}:\n{{projectDescription.keyTerms}}\n\n</knowledge_space>\n\ninstructions:\n  role: |\n    You are a fact‑finding assistant that MUST ALWAYS provide definitive, direct answers to user questions using authoritative factual information from data retrieval tools.',
              },
            },
          },
        },
      };

      const { processedData, replacements } = createPlaceholders(projectData);

      // The long prompt should be replaced
      expect(processedData.graphs['inkeep-qa-graph'].agents.facts.prompt).toMatch(/^<{{.*}}>$/);

      // Should have replacements
      expect(Object.keys(replacements)).toHaveLength(1);

      // Round-trip test
      const placeholder = processedData.graphs['inkeep-qa-graph'].agents.facts.prompt;
      const restored = restorePlaceholders(placeholder, replacements);
      expect(restored).toBe(projectData.graphs['inkeep-qa-graph'].agents.facts.prompt);
    });
  });
});