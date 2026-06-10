import type { ArtifactComponentApiInsert } from '@inkeep/agents-core';
import { beforeEach, describe, expect, test } from 'vitest';
import { SYSTEM_CACHE_BOUNDARY_SENTINEL } from '../../../domains/run/agents/generation/caching-actuator';
import { SystemPromptBuilder } from '../../../domains/run/agents/SystemPromptBuilder';
import type { SystemPromptV1 } from '../../../domains/run/agents/types';
import { PromptConfig } from '../../../domains/run/agents/versions/v1/PromptConfig';

// R9 / D18 — turn-invariance guardrail (the missing invariant).
//
// The cached per-agent prefix is Sub-block A: the system prompt BEFORE the SYSTEM_CACHE_BOUNDARY
// sentinel (BP1). It MUST be byte-identical across the turns of one agent's conversation, or every
// provider's prefix cache misses. The artifact section lives in Sub-block A and previously flipped
// its wrapper sentence on the FIRST artifact a conversation creates ("No artifacts are currently
// available…" → "These are the artifacts available…") — a ~15-token change that busted the entire
// cross-turn cache (observed live: prefix_signature 9f0911f6e9 → 6b9bfba14e). R10/D17 de-conditions
// it. This test asserts the invariant from the real assembly so a regression FAILS CI instead of
// silently shipping.

const artifactComponents: ArtifactComponentApiInsert[] = [
  {
    id: 'comp-1',
    name: 'Citation',
    description: 'A citation',
    props: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title', inPreview: true },
        url: { type: 'string', description: 'URL', inPreview: false },
      },
    },
  },
];

// A conversation-scoped artifact instance (turn 2 has one; turn 1 has none). Its bytes belong in the
// separate artifacts user-message block, never in the cached system prefix.
const oneArtifact = {
  artifactId: 'art-1',
  taskId: 'task-1',
  toolCallId: 'call-1',
  name: 'Doc',
  description: 'A referenced document',
  type: 'Citation',
  parts: [{ data: { summary: { title: 'T' } } }],
};

function baseConfig(overrides: Partial<SystemPromptV1>): SystemPromptV1 {
  return {
    corePrompt: 'You are a helpful assistant.',
    appPrompt: 'Be concise.',
    tools: [],
    dataComponents: [],
    artifacts: [],
    artifactComponents,
    ...overrides,
  };
}

function subBlockA(prompt: string): string {
  expect(prompt).toContain(SYSTEM_CACHE_BOUNDARY_SENTINEL);
  return prompt.split(SYSTEM_CACHE_BOUNDARY_SENTINEL)[0] ?? prompt;
}

describe('PromptConfig — cached-prefix turn invariance (R9/D18)', () => {
  let builder: SystemPromptBuilder<SystemPromptV1>;
  beforeEach(() => {
    builder = new SystemPromptBuilder('v1', new PromptConfig());
  });

  test('Sub-block A is byte-identical for 0 vs 1 artifacts (agent WITH artifact components)', () => {
    const turn1 = builder.buildSystemPrompt(
      baseConfig({ hasAgentArtifactComponents: true, artifacts: [] })
    );
    const turn2 = builder.buildSystemPrompt(
      baseConfig({ hasAgentArtifactComponents: true, artifacts: [oneArtifact as any] })
    );
    expect(subBlockA(turn2.prompt)).toBe(subBlockA(turn1.prompt));
  });

  test('Sub-block A is byte-identical for 0 vs 1 artifacts when the agent has NO artifact components', () => {
    const turn1 = builder.buildSystemPrompt(
      baseConfig({ hasAgentArtifactComponents: false, artifacts: [] })
    );
    const turn2 = builder.buildSystemPrompt(
      baseConfig({ hasAgentArtifactComponents: false, artifacts: [oneArtifact as any] })
    );
    expect(subBlockA(turn2.prompt)).toBe(subBlockA(turn1.prompt));
  });

  test('Sub-block A is byte-identical for 0 vs 1 artifacts in structured mode', () => {
    const turn1 = builder.buildSystemPrompt(
      baseConfig({
        hasStructuredOutput: true,
        includeDataComponents: true,
        hasAgentArtifactComponents: true,
        artifacts: [],
      })
    );
    const turn2 = builder.buildSystemPrompt(
      baseConfig({
        hasStructuredOutput: true,
        includeDataComponents: true,
        hasAgentArtifactComponents: true,
        artifacts: [oneArtifact as any],
      })
    );
    expect(subBlockA(turn2.prompt)).toBe(subBlockA(turn1.prompt));
  });
});
