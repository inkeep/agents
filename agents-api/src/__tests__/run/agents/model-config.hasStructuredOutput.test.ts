import { describe, expect, it } from 'vitest';
import type { AgentRunContext } from '../../../domains/run/agents/agent-types';
import { configureModelSettings } from '../../../domains/run/agents/generation/model-config';

function makeCtx(overrides: {
  dataComponents?: Array<{ name: string }>;
  artifactComponents?: Array<{ name: string }>;
  resolvedAllowText?: boolean;
}): AgentRunContext {
  return {
    config: {
      dataComponents: overrides.dataComponents ?? [],
      models: { base: { model: 'anthropic/claude-sonnet-4-20250514' } },
    },
    resolvedAllowText: overrides.resolvedAllowText ?? true,
    artifactComponents: overrides.artifactComponents ?? [],
  } as unknown as AgentRunContext;
}

describe('configureModelSettings — hasStructuredOutput', () => {
  it('is true when dataComponents are declared (legacy path)', () => {
    const { hasStructuredOutput } = configureModelSettings(
      makeCtx({ dataComponents: [{ name: 'SearchResults' }], resolvedAllowText: true })
    );
    expect(hasStructuredOutput).toBe(true);
  });

  it('is false when neither dataComponents nor (allowText:false + artifacts) are present', () => {
    const { hasStructuredOutput } = configureModelSettings(makeCtx({ resolvedAllowText: true }));
    expect(hasStructuredOutput).toBe(false);
  });

  it('is true when resolvedAllowText is false and artifactComponents are non-empty (D-L/FR13)', () => {
    const { hasStructuredOutput } = configureModelSettings(
      makeCtx({ artifactComponents: [{ name: 'Report' }], resolvedAllowText: false })
    );
    expect(hasStructuredOutput).toBe(true);
  });

  it('is false when resolvedAllowText is false but artifactComponents is empty', () => {
    const { hasStructuredOutput } = configureModelSettings(makeCtx({ resolvedAllowText: false }));
    expect(hasStructuredOutput).toBe(false);
  });

  it('is false when artifactComponents exist but resolvedAllowText is true', () => {
    const { hasStructuredOutput } = configureModelSettings(
      makeCtx({ artifactComponents: [{ name: 'Report' }], resolvedAllowText: true })
    );
    expect(hasStructuredOutput).toBe(false);
  });
});
