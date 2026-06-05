import { beforeEach, describe, expect, test } from 'vitest';
import { SystemPromptBuilder } from '../../../domains/run/agents/SystemPromptBuilder';
import type { SystemPromptV1 } from '../../../domains/run/agents/types';
import { PromptConfig } from '../../../domains/run/agents/versions/v1/PromptConfig';

describe('PromptConfig Output Contract Section (FR12)', () => {
  let builder: SystemPromptBuilder<SystemPromptV1>;

  beforeEach(() => {
    builder = new SystemPromptBuilder('v1', new PromptConfig());
  });

  const base: SystemPromptV1 = {
    corePrompt: 'You are a helpful assistant.',
    tools: [],
    dataComponents: [],
    artifacts: [],
  };

  test('omits <output_contract> when no contract is set', () => {
    const result = builder.buildSystemPrompt(base);
    expect(result.prompt).not.toContain('<output_contract');
  });

  test('omits <output_contract> when the contract has no active rules', () => {
    const result = builder.buildSystemPrompt({
      ...base,
      outputContract: { allowText: true },
      resolvedAllowText: true,
    });
    expect(result.prompt).not.toContain('<output_contract');
  });

  test('renders a text-free rule when resolvedAllowText is false', () => {
    const result = builder.buildSystemPrompt({
      ...base,
      outputContract: { allowText: false },
      resolvedAllowText: false,
    });
    expect(result.prompt).toContain('<output_contract');
    expect(result.prompt).toContain('MUST NOT respond with free-text narration');
  });

  test('renders one rule per required component (require-all)', () => {
    const result = builder.buildSystemPrompt({
      ...base,
      outputContract: { requireComponent: ['SearchResults', 'Citations'] },
      resolvedAllowText: true,
    });
    expect(result.prompt).toContain('data component named "SearchResults"');
    expect(result.prompt).toContain('data component named "Citations"');
  });

  test('renders a require-artifact rule', () => {
    const result = builder.buildSystemPrompt({
      ...base,
      outputContract: { requireArtifact: ['ResearchReport'] },
      resolvedAllowText: true,
    });
    expect(result.prompt).toContain('artifact named "ResearchReport"');
  });

  test('renders a require-transfer rule when requireTransfer is true', () => {
    const result = builder.buildSystemPrompt({
      ...base,
      outputContract: { requireTransfer: true },
      resolvedAllowText: true,
    });
    expect(result.prompt).toContain('transferring to another sub agent');
  });

  test('tracks the section in the breakdown when rules are present', () => {
    const withContract = builder.buildSystemPrompt({
      ...base,
      outputContract: { requireComponent: ['SearchResults'] },
      resolvedAllowText: true,
    });
    const withoutContract = builder.buildSystemPrompt(base);
    expect(withContract.breakdown.components.systemPromptTemplate).toBeGreaterThan(
      withoutContract.breakdown.components.systemPromptTemplate
    );
  });
});
