import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTextWithPlaceholders } from '../../commands/pull.llm-generate';

// Mock the AI SDK generateText function
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

// Mock the placeholder system
vi.mock('../../commands/pull.placeholder-system', () => ({
  createPlaceholders: vi.fn(),
  restorePlaceholders: vi.fn(),
  calculateTokenSavings: vi.fn(),
}));

// Mock instrumentation to disable Langfuse for tests
vi.mock('../../instrumentation', () => ({
  isLangfuseConfigured: vi.fn(() => false),
  initializeInstrumentation: vi.fn(),
}));

import { generateText } from 'ai';
import {
  calculateTokenSavings,
  createPlaceholders,
  restorePlaceholders,
} from '../../commands/pull.placeholder-system';

const mockGenerateText = generateText as any;
const mockCreatePlaceholders = createPlaceholders as any;
const mockRestorePlaceholders = restorePlaceholders as any;
const mockCalculateTokenSavings = calculateTokenSavings as any;

describe('generateTextWithPlaceholders', () => {
  const mockModel = { id: 'test-model' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should process data with placeholders and generate text', async () => {
    const testData = {
      agents: {
        qa: {
          prompt: 'This is a very long prompt that should be replaced with a placeholder',
        },
      },
    };

    const processedData = {
      agents: {
        qa: {
          prompt: '<{{agents.qa.prompt.abc123}}>',
        },
      },
    };

    const replacements = {
      '<{{agents.qa.prompt.abc123}}>': testData.agents.qa.prompt,
    };

    const generatedText = 'const qaAgent = agent({ prompt: "<{{agents.qa.prompt.abc123}}>" });';
    const restoredText = `const qaAgent = agent({ prompt: "${testData.agents.qa.prompt}" });`;

    // Setup mocks
    mockCreatePlaceholders.mockReturnValue({
      processedData,
      replacements,
    });
    mockGenerateText.mockResolvedValue({ text: generatedText });
    mockRestorePlaceholders.mockReturnValue(restoredText);
    mockCalculateTokenSavings.mockReturnValue({
      originalSize: 1000,
      processedSize: 500,
      savings: 500,
      savingsPercentage: 50,
    });

    const promptTemplate = 'Generate TypeScript for: {{DATA}}';
    const options = {
      temperature: 0.1,
      maxOutputTokens: 4000,
    };

    const result = await generateTextWithPlaceholders(mockModel, testData, promptTemplate, options);

    // Verify the flow
    expect(mockCreatePlaceholders).toHaveBeenCalledWith(testData);
    expect(mockGenerateText).toHaveBeenCalledWith({
      model: mockModel,
      prompt: `Generate TypeScript for: ${JSON.stringify(processedData, null, 2)}`,
      ...options,
    });
    expect(mockRestorePlaceholders).toHaveBeenCalledWith(generatedText, replacements);
    expect(result).toBe(restoredText);
  });

  it('should log debug information when debug=true and replacements exist', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const testData = { longString: 'Very long string content' };
    const processedData = { longString: '<{{longString.abc123}}>' };
    const replacements = { '<{{longString.abc123}}>': 'Very long string content' };

    mockCreatePlaceholders.mockReturnValue({
      processedData,
      replacements,
    });
    mockGenerateText.mockResolvedValue({ text: 'generated code' });
    mockRestorePlaceholders.mockReturnValue('restored code');
    mockCalculateTokenSavings.mockReturnValue({
      originalSize: 200,
      processedSize: 100,
      savings: 100,
      savingsPercentage: 50,
    });

    await generateTextWithPlaceholders(
      mockModel,
      testData,
      'Template: {{DATA}}',
      { temperature: 0.1 },
      true // debug = true
    );

    expect(consoleSpy).toHaveBeenCalledWith('[DEBUG] Placeholder optimization:');
    expect(consoleSpy).toHaveBeenCalledWith('[DEBUG]   - Original data size: 200 characters');
    expect(consoleSpy).toHaveBeenCalledWith('[DEBUG]   - Processed data size: 100 characters');
    expect(consoleSpy).toHaveBeenCalledWith('[DEBUG]   - Token savings: 100 characters (50.0%)');
    expect(consoleSpy).toHaveBeenCalledWith('[DEBUG]   - Placeholders created: 1');
    expect(consoleSpy).toHaveBeenCalledWith('[DEBUG] Placeholders restored successfully');

    consoleSpy.mockRestore();
  });

  it('should not log placeholder debug info when no replacements exist', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const testData = { shortString: 'short' };

    mockCreatePlaceholders.mockReturnValue({
      processedData: testData,
      replacements: {},
    });
    mockGenerateText.mockResolvedValue({ text: 'generated code' });
    mockRestorePlaceholders.mockReturnValue('restored code');

    await generateTextWithPlaceholders(
      mockModel,
      testData,
      'Template: {{DATA}}',
      { temperature: 0.1 },
      true // debug = true
    );

    // Should still log final prompt size but not placeholder optimization
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG] Final prompt size:'));
    expect(consoleSpy).not.toHaveBeenCalledWith('[DEBUG] Placeholder optimization:');
    expect(consoleSpy).not.toHaveBeenCalledWith('[DEBUG] Placeholders restored successfully');

    consoleSpy.mockRestore();
  });

  it('should handle template replacement correctly', async () => {
    const testData = { key: 'value' };

    mockCreatePlaceholders.mockReturnValue({
      processedData: testData,
      replacements: {},
    });
    mockGenerateText.mockResolvedValue({ text: 'generated code' });
    mockRestorePlaceholders.mockReturnValue('restored code');

    const promptTemplate = 'Start: {{DATA}} :End';

    await generateTextWithPlaceholders(mockModel, testData, promptTemplate, { temperature: 0.1 });

    const expectedPrompt = `Start: ${JSON.stringify(testData, null, 2)} :End`;
    expect(mockGenerateText).toHaveBeenCalledWith({
      model: mockModel,
      prompt: expectedPrompt,
      temperature: 0.1,
    });
  });

  it('should pass through all generation options', async () => {
    const testData = { key: 'value' };

    mockCreatePlaceholders.mockReturnValue({
      processedData: testData,
      replacements: {},
    });
    mockGenerateText.mockResolvedValue({ text: 'generated code' });
    mockRestorePlaceholders.mockReturnValue('restored code');

    const options = {
      temperature: 0.5,
      maxOutputTokens: 8000,
      abortSignal: new AbortController().signal,
    };

    await generateTextWithPlaceholders(mockModel, testData, 'Template: {{DATA}}', options);

    expect(mockGenerateText).toHaveBeenCalledWith({
      model: mockModel,
      prompt: expect.any(String),
      ...options,
    });
  });

  it('should work with empty data', async () => {
    const testData = {};

    mockCreatePlaceholders.mockReturnValue({
      processedData: testData,
      replacements: {},
    });
    mockGenerateText.mockResolvedValue({ text: 'empty data code' });
    mockRestorePlaceholders.mockReturnValue('empty data code');

    const result = await generateTextWithPlaceholders(mockModel, testData, 'Data: {{DATA}}', {
      temperature: 0.1,
    });

    expect(result).toBe('empty data code');
    expect(mockCreatePlaceholders).toHaveBeenCalledWith({});
    expect(mockRestorePlaceholders).toHaveBeenCalledWith('empty data code', {});
  });

  it('should handle generateText errors appropriately', async () => {
    const testData = { key: 'value' };

    mockCreatePlaceholders.mockReturnValue({
      processedData: testData,
      replacements: {},
    });
    mockGenerateText.mockRejectedValue(new Error('API Error'));

    await expect(
      generateTextWithPlaceholders(mockModel, testData, 'Template: {{DATA}}', { temperature: 0.1 })
    ).rejects.toThrow('API Error');

    // Should still have called createPlaceholders
    expect(mockCreatePlaceholders).toHaveBeenCalledWith(testData);
    // But should not have called restorePlaceholders since generateText failed
    expect(mockRestorePlaceholders).not.toHaveBeenCalled();
  });

  it('should handle complex nested data structures', async () => {
    const complexData = {
      agent: {
        'test-agent': {
          agents: {
            agent1: {
              prompt: 'Long prompt 1',
              config: { nested: { value: 'deep value' } },
            },
            agent2: {
              prompt: 'Long prompt 2',
            },
          },
        },
      },
      tools: {
        'tool-1': {
          description: 'Tool description',
        },
      },
    };

    const processedData = {
      agent: {
        'test-agent': {
          agents: {
            agent1: {
              prompt: '<{{agent.test-agent.agents.agent1.prompt.abc123}}>',
              config: { nested: { value: 'deep value' } },
            },
            agent2: {
              prompt: '<{{agent.test-agent.agents.agent2.prompt.def456}}>',
            },
          },
        },
      },
      tools: {
        'tool-1': {
          description: 'Tool description',
        },
      },
    };

    const replacements = {
      '<{{agent.test-agent.agents.agent1.prompt.abc123}}>': 'Long prompt 1',
      '<{{agent.test-agent.agents.agent2.prompt.def456}}>': 'Long prompt 2',
    };

    mockCreatePlaceholders.mockReturnValue({
      processedData,
      replacements,
    });
    mockGenerateText.mockResolvedValue({ text: 'complex generated code' });
    mockRestorePlaceholders.mockReturnValue('complex restored code');

    const result = await generateTextWithPlaceholders(mockModel, complexData, 'Complex: {{DATA}}', {
      temperature: 0.1,
    });

    expect(result).toBe('complex restored code');
    expect(mockCreatePlaceholders).toHaveBeenCalledWith(complexData);
    expect(mockRestorePlaceholders).toHaveBeenCalledWith('complex generated code', replacements);
  });
});
