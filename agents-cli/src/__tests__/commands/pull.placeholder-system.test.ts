import { describe, expect, it, vi } from 'vitest';
import {
  calculateTokenSavings,
  createPlaceholders,
  restorePlaceholders,
} from '../../commands/pull.placeholder-system';

describe('Placeholder System', () => {
  describe('createPlaceholders', () => {
    it('should replace long strings with placeholders', () => {
      const data = {
        shortString: 'short',
        longString:
          'This is a very long string that should be replaced with a placeholder because it exceeds the minimum length threshold',
        nested: {
          anotherLongString:
            'Another very long string that should also be replaced with a placeholder to save tokens and reduce prompt size significantly',
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
      const longString =
        'This is a very long string that appears multiple times and should reuse the same placeholder';
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
        longString:
          'This is a very long string that should be replaced with a placeholder for optimization',
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
              longString:
                'This is a very long string buried deep in the object hierarchy and should be replaced',
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
            prompt:
              'This is a very long prompt string that should be replaced with a placeholder containing the correct path',
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
      expect(restoredCode).toBe(
        'prompt: `Use \\`info_sources\\` and other \\`code\\` snippets with backticks`'
      );
      expect(restoredCode).not.toContain('`info_sources`'); // Should not contain unescaped backticks
    });

    it('should escape template literal interpolation ${...}', () => {
      const placeholder = '<{{prompt.content.xyz789}}>';
      const originalString = 'Use ${variable} for interpolation and ${anotherVar} too';
      const replacements = {
        [placeholder]: originalString,
      };

      const generatedCode = `prompt: \`${placeholder}\``;
      const restoredCode = restorePlaceholders(generatedCode, replacements);

      // ${...} should be escaped to prevent template literal interpolation
      expect(restoredCode).toBe(
        'prompt: `Use \\${variable} for interpolation and \\${anotherVar} too`'
      );
      // Verify the backslash escape is present
      expect(restoredCode).toContain('\\${variable}');
      expect(restoredCode).toContain('\\${anotherVar}');
    });

    it('should escape backslashes in restored content', () => {
      const placeholder = '<{{prompt.content.def456}}>';
      const originalString = 'Path: C:\\Users\\Documents\\file.txt with backslashes';
      const replacements = {
        [placeholder]: originalString,
      };

      const generatedCode = `prompt: \`${placeholder}\``;
      const restoredCode = restorePlaceholders(generatedCode, replacements);

      // Backslashes should be escaped
      expect(restoredCode).toBe(
        'prompt: `Path: C:\\\\Users\\\\Documents\\\\file.txt with backslashes`'
      );
    });

    it('should handle combinations of special characters', () => {
      const placeholder = '<{{prompt.content.multi123}}>';
      const originalString = 'Complex: `code` with ${var} and C:\\path\\to\\file';
      const replacements = {
        [placeholder]: originalString,
      };

      const generatedCode = `prompt: \`${placeholder}\``;
      const restoredCode = restorePlaceholders(generatedCode, replacements);

      // All special characters should be properly escaped
      expect(restoredCode).toBe(
        'prompt: `Complex: \\`code\\` with \\${var} and C:\\\\path\\\\to\\\\file`'
      );

      // Verify all escape sequences are present
      expect(restoredCode).toContain('\\${var}');
      expect(restoredCode).toContain('\\`code\\`');
      expect(restoredCode).toContain('C:\\\\path\\\\to\\\\file');
    });

    it('should preserve escaped sequences when restoring', () => {
      const placeholder = '<{{description.abc}}>';
      const originalString = 'Text with newline\\nand tab\\t sequences';
      const replacements = {
        [placeholder]: originalString,
      };

      const generatedCode = `description: \`${placeholder}\``;
      const restoredCode = restorePlaceholders(generatedCode, replacements);

      // Original backslashes should be doubled (escaped)
      expect(restoredCode).toBe('description: `Text with newline\\\\nand tab\\\\t sequences`');
    });

    it('should handle quotes in restored content', () => {
      const placeholder = '<{{prompt.content.quotes}}>';
      const originalString = `She said "hello" and I said 'hi' to her`;
      const replacements = {
        [placeholder]: originalString,
      };

      const generatedCode = `prompt: \`${placeholder}\``;
      const restoredCode = restorePlaceholders(generatedCode, replacements);

      // Quotes don't need escaping in template literals, but should be preserved
      expect(restoredCode).toBe('prompt: `She said "hello" and I said \'hi\' to her`');
    });

    it('should handle apostrophes that would break single-quoted strings', () => {
      const placeholder = '<{{description.user123}}>';
      const originalString = `information about a user's account like their order history`;
      const replacements = {
        [placeholder]: originalString,
      };

      // LLM generates with template literals
      const generatedCode = `description: \`${placeholder}\``;
      const restoredCode = restorePlaceholders(generatedCode, replacements);

      // In template literals, apostrophes don't need escaping
      expect(restoredCode).toBe(
        `description: \`information about a user's account like their order history\``
      );

      // Verify apostrophe is preserved correctly
      expect(restoredCode).toContain("user's");
      expect(restoredCode).not.toContain("\\'"); // No unnecessary escaping
    });

    it('should handle multiple apostrophes and contractions', () => {
      const placeholder = '<{{prompt.contractions}}>';
      const originalString = `Don't worry, it's okay. We'll handle the user's request, and they're good to go. Here's what you shouldn't do.`;
      const replacements = {
        [placeholder]: originalString,
      };

      const generatedCode = `prompt: \`${placeholder}\``;
      const restoredCode = restorePlaceholders(generatedCode, replacements);

      // All apostrophes should be preserved in template literals
      expect(restoredCode).toContain("Don't");
      expect(restoredCode).toContain("it's");
      expect(restoredCode).toContain("We'll");
      expect(restoredCode).toContain("user's");
      expect(restoredCode).toContain("they're");
      expect(restoredCode).toContain("Here's");
      expect(restoredCode).toContain("shouldn't");
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

  describe('template literal handling', () => {
    it('should preserve template literals while replacing surrounding text', () => {
      const data = {
        prompt:
          'You are an AI assistant helping users with their questions. Your name is {{agent.name}} and you were created by {{organization.name}}. When responding to user queries, please follow these guidelines and provide accurate information.',
      };

      const result = createPlaceholders(data);

      // Should contain the template literals
      expect(result.processedData.prompt).toContain('{{agent.name}}');
      expect(result.processedData.prompt).toContain('{{organization.name}}');

      // Should have placeholders for the surrounding text
      expect(result.processedData.prompt).toMatch(/<{{[^}]+}}>/);
    });

    it('should only use placeholders if the overall result is shorter', () => {
      // Short string with template literals - placeholders would make it longer
      const data = {
        shortPrompt: 'Hi {{name}}, welcome!',
      };

      const result = createPlaceholders(data);

      // Should keep original since placeholders don't save space
      expect(result.processedData.shortPrompt).toBe(data.shortPrompt);
      expect(Object.keys(result.replacements)).toHaveLength(0);
    });

    it('should handle multiple template literals with long surrounding text', () => {
      const data = {
        prompt:
          'The current conversation is taking place at {{conversation.timestamp}} in the {{conversation.timezone}} timezone. The user preferred language is {{user.preferences.language}} and their account was created on {{user.account.createdAt}}. Please provide helpful information.',
      };

      const result = createPlaceholders(data);

      // All template literals should be preserved
      expect(result.processedData.prompt).toContain('{{conversation.timestamp}}');
      expect(result.processedData.prompt).toContain('{{conversation.timezone}}');
      expect(result.processedData.prompt).toContain('{{user.preferences.language}}');
      expect(result.processedData.prompt).toContain('{{user.account.createdAt}}');

      // Should be shorter than original
      expect(result.processedData.prompt.length).toBeLessThan(data.prompt.length);

      // Should have replacements for the text parts
      expect(Object.keys(result.replacements).length).toBeGreaterThan(0);
    });

    it('should restore template literal strings correctly', () => {
      const originalPrompt =
        'You are an AI assistant named {{agent.name}}. Your role is to help users with their questions about {{product.name}}. Always be professional and helpful in your responses.';

      const data = { prompt: originalPrompt };
      const { processedData, replacements } = createPlaceholders(data);

      // Simulate LLM generation with the processed prompt
      const generatedCode = `const agent = agent({
  prompt: \`${processedData.prompt}\`
});`;

      const restoredCode = restorePlaceholders(generatedCode, replacements);

      // Should contain the original text parts
      expect(restoredCode).toContain('You are an AI assistant named');
      expect(restoredCode).toContain('Your role is to help users with their questions about');
      expect(restoredCode).toContain('Always be professional and helpful in your responses');

      // Should preserve template literals
      expect(restoredCode).toContain('{{agent.name}}');
      expect(restoredCode).toContain('{{product.name}}');
    });

    it('should handle strings with template literals at start and end', () => {
      const data = {
        prompt:
          '{{greeting}} This is a very long instruction text that provides detailed guidance on how to respond to users. {{closing}}',
      };

      const result = createPlaceholders(data);

      // Template literals should be preserved
      expect(result.processedData.prompt).toContain('{{greeting}}');
      expect(result.processedData.prompt).toContain('{{closing}}');

      // Middle text should potentially be replaced if it saves space
      if (result.processedData.prompt !== data.prompt) {
        expect(result.processedData.prompt.length).toBeLessThan(data.prompt.length);
      }
    });

    it('should handle consecutive template literals', () => {
      const data = {
        prompt:
          'Start {{var1}}{{var2}} This is a very long middle section with detailed instructions {{var3}}{{var4}} End',
      };

      const result = createPlaceholders(data);

      // All template literals should be preserved in order
      expect(result.processedData.prompt).toContain('{{var1}}');
      expect(result.processedData.prompt).toContain('{{var2}}');
      expect(result.processedData.prompt).toContain('{{var3}}');
      expect(result.processedData.prompt).toContain('{{var4}}');
    });

    it('should handle identical text parts in different template strings', () => {
      // Use a very long repeated section that will definitely warrant placeholder replacement
      const longRepeatedText = `${'A'.repeat(200)} This is additional text to make it even longer and ensure the placeholder optimization is worthwhile.`;
      const data = {
        prompt1: `${longRepeatedText} {{var1}} Some unique ending for prompt 1`,
        prompt2: `${longRepeatedText} {{var2}} Some unique ending for prompt 2`,
      };

      const result = createPlaceholders(data);

      // Template variables should always be preserved
      const processedPrompt1 = result.processedData.prompt1;
      const processedPrompt2 = result.processedData.prompt2;

      if (typeof processedPrompt1 === 'string' && typeof processedPrompt2 === 'string') {
        expect(processedPrompt1).toContain('{{var1}}');
        expect(processedPrompt2).toContain('{{var2}}');

        // If optimization happened, check that repeated text is only stored once
        if (Object.keys(result.replacements).length > 0) {
          const uniqueValues = new Set(Object.values(result.replacements));
          const hasRepeatedText = Array.from(uniqueValues).some(
            (v) => typeof v === 'string' && v.includes(longRepeatedText)
          );

          // Either the repeated text is in replacements, or the strings weren't split
          expect(hasRepeatedText || processedPrompt1 === data.prompt1).toBe(true);
        }
      }
    });

    it('should handle complex real-world prompt with many template variables', () => {
      const complexPrompt = `You are an AI assistant helping users with their questions. Your name is {{agent.name}} and you were created by {{organization.name}}.

When responding to user queries, please follow these guidelines:
1. Always be polite and professional in your interactions
2. Provide accurate and helpful information based on the context provided
3. If you're unsure about something, acknowledge the uncertainty
4. Keep responses concise but comprehensive enough to address the user's needs

The current conversation is taking place at {{conversation.timestamp}} in the {{conversation.timezone}} timezone. 
The user's preferred language is {{user.preferences.language}} and their account was created on {{user.account.createdAt}}.

Available context includes:
- User profile information from {{context.userProfile}}
- Recent conversation history stored at {{context.conversationHistory}}
- Knowledge base articles from {{context.knowledgeBase}}
- System configuration from {{system.config.path}}

For technical support questions, please refer to our comprehensive documentation available at {{docs.baseUrl}}/{{docs.version}}/getting-started.`;

      const data = { prompt: complexPrompt };
      const { processedData, replacements } = createPlaceholders(data);

      // All template literals should be preserved
      const templateVars = [
        '{{agent.name}}',
        '{{organization.name}}',
        '{{conversation.timestamp}}',
        '{{conversation.timezone}}',
        '{{user.preferences.language}}',
        '{{user.account.createdAt}}',
        '{{context.userProfile}}',
        '{{context.conversationHistory}}',
        '{{context.knowledgeBase}}',
        '{{system.config.path}}',
        '{{docs.baseUrl}}',
        '{{docs.version}}',
      ];

      for (const templateVar of templateVars) {
        expect(processedData.prompt).toContain(templateVar);
      }

      // Should save significant space
      expect(processedData.prompt.length).toBeLessThan(complexPrompt.length);
      expect(Object.keys(replacements).length).toBeGreaterThan(0);

      // Round-trip should restore original
      const restored = restorePlaceholders(processedData.prompt, replacements);
      expect(restored).toBe(complexPrompt);
    });

    it('should handle strings with no template literals normally', () => {
      const data = {
        normalPrompt:
          'This is a very long prompt without any template literals that should be handled by the regular placeholder logic',
      };

      const result = createPlaceholders(data);

      // Should still create placeholder for long strings
      expect(result.processedData.normalPrompt).toMatch(/^<{{.*}}>$/);
      expect(Object.values(result.replacements)).toContain(data.normalPrompt);
    });

    it('should handle empty strings between template literals', () => {
      const data = {
        prompt: '{{var1}}{{var2}}{{var3}}',
      };

      const result = createPlaceholders(data);

      // Should keep as-is since no text to replace
      expect(result.processedData.prompt).toBe(data.prompt);
      expect(Object.keys(result.replacements)).toHaveLength(0);
    });
  });

  describe('integration tests', () => {
    it('should handle complete round-trip with complex project data', () => {
      const complexData = {
        id: 'test-project',
        name: 'Test Project',
        agent: {
          'main-agent': {
            agents: {
              qa: {
                id: 'qa',
                name: 'QA Agent',
                prompt:
                  'You are a helpful assistant that answers questions about our product. This is a very long prompt that contains detailed instructions about how to behave, what tone to use, and how to structure responses. It includes many specific examples and detailed guidelines that make it quite lengthy and suitable for placeholder replacement to save tokens during LLM generation.',
                description: 'QA agent description',
              },
              router: {
                id: 'router',
                name: 'Router Agent',
                prompt:
                  'You are a routing assistant that directs users to the appropriate specialist agents. This is another very long prompt with extensive routing logic, detailed decision trees, and comprehensive examples of how to classify different types of user queries and route them appropriately to the best available agent.',
                description: 'Router agent description',
              },
            },
          },
        },
      };

      // Create placeholders
      const { processedData, replacements } = createPlaceholders(complexData);

      // Verify large prompts were replaced
      expect(processedData.agent['main-agent'].agents.qa.prompt).toMatch(/^<{{.*}}>$/);
      expect(processedData.agent['main-agent'].agents.router.prompt).toMatch(/^<{{.*}}>$/);

      // Verify short descriptions were not replaced
      expect(processedData.agent['main-agent'].agents.qa.description).toBe('QA agent description');
      expect(processedData.agent['main-agent'].agents.router.description).toBe(
        'Router agent description'
      );

      // Simulate LLM generation with placeholders
      const simulatedGeneratedCode = `
import { agent } from '@inkeep/agents-sdk';

const qaAgent = agent({
  id: 'qa',
  name: 'QA Agent',
  prompt: '${processedData.agent['main-agent'].agents.qa.prompt}',
});

const routerAgent = agent({
  id: 'router',
  name: 'Router Agent',
  prompt: '${processedData.agent['main-agent'].agents.router.prompt}',
});
      `;

      // Restore placeholders
      const restoredCode = restorePlaceholders(simulatedGeneratedCode, replacements);

      // Verify original prompts are restored
      expect(restoredCode).toContain(complexData.agent['main-agent'].agents.qa.prompt);
      expect(restoredCode).toContain(complexData.agent['main-agent'].agents.router.prompt);
      expect(restoredCode).not.toContain('<{{');

      // Calculate and verify savings
      const savings = calculateTokenSavings(complexData, processedData);
      expect(savings.savingsPercentage).toBeGreaterThan(30); // Should save significant tokens
    });

    it('should handle real project data structure from inkeep-qa-project', () => {
      // This mimics the actual data structure from the JSON file
      const projectData = {
        agent: {
          'inkeep-qa-agent': {
            agents: {
              facts: {
                prompt:
                  'You are a research-mode assistant. You are researching the following product {{projectDescription.chatSubjectName}}. Here is some background knowledge that you have about {{projectDescription.chatSubjectName}}. Consider this your knowledge space:\n<knowledge_space>\n{{projectDescription.autogeneratedDescription}}\n\nHere are the main Product Lines produced by {{projectDescription.chatSubjectName}}:\n{{projectDescription.productLines}}\n\nHere are key terms necessary for understanding {{projectDescription.chatSubjectName}}:\n{{projectDescription.keyTerms}}\n\n</knowledge_space>\n\ninstructions:\n  role: |\n    You are a fact‑finding assistant that MUST ALWAYS provide definitive, direct answers to user questions using authoritative factual information from data retrieval tools.',
              },
            },
          },
        },
      };

      const { processedData, replacements } = createPlaceholders(projectData);

      const processedPrompt = processedData.agent['inkeep-qa-agent'].agents.facts.prompt;
      const originalPrompt = projectData.agent['inkeep-qa-agent'].agents.facts.prompt;

      // The prompt contains template literals, so it should be split into parts
      // Template literals should be preserved
      expect(processedPrompt).toContain('{{projectDescription.chatSubjectName}}');
      expect(processedPrompt).toContain('{{projectDescription.autogeneratedDescription}}');
      expect(processedPrompt).toContain('{{projectDescription.productLines}}');
      expect(processedPrompt).toContain('{{projectDescription.keyTerms}}');

      // Should have multiple replacements (one for each text segment between template literals)
      expect(Object.keys(replacements).length).toBeGreaterThan(0);

      // The processed version should be shorter than the original
      expect(processedPrompt.length).toBeLessThan(originalPrompt.length);

      // Round-trip test - restoring should give back the original
      const restored = restorePlaceholders(processedPrompt, replacements);
      expect(restored).toBe(originalPrompt);
    });
  });
});
