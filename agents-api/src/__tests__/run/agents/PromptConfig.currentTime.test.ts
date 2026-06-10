import { describe, expect, test } from 'vitest';
import { SystemPromptBuilder } from '../../../domains/run/agents/SystemPromptBuilder';
import type { SystemPromptV1 } from '../../../domains/run/agents/types';
import { PromptConfig } from '../../../domains/run/agents/versions/v1/PromptConfig';

// R1: the volatile timestamp must NOT appear in the (cached) system block. Only static,
// byte-stable time guidance lives there; the per-request timestamp value is injected into the
// current user message at generation time (see runGenerate).
describe('PromptConfig current-time (R1: byte-stable system block)', () => {
  const builder = new SystemPromptBuilder('v1', new PromptConfig());

  const baseConfig: SystemPromptV1 = {
    corePrompt: 'You are a helpful assistant.',
    tools: [],
    dataComponents: [],
    artifacts: [],
  };

  test('system block contains static time guidance, never a timestamp value', () => {
    const { prompt } = builder.buildSystemPrompt(baseConfig);

    expect(prompt).toContain('<current_time_guidance>');
    expect(prompt).toContain('do not mention');
    // Guidance is conditional on the block being present (it is injected into the user message only
    // when a client time is sent), so it must not assert the model knows the time unconditionally.
    expect(prompt).toContain('If the user');
    expect(prompt).toContain('If no <current_time> block is present');
    // The actual time VALUE must not be baked into the system block. (The guidance text may
    // reference the <current_time> tag name — that's static and fine; what must be absent is the
    // value-bearing phrase that previously carried the per-request timestamp.)
    expect(prompt).not.toContain('The current time for the user is:');
  });

  test('system block is byte-identical across builds (no per-request time input)', () => {
    const a = builder.buildSystemPrompt(baseConfig).prompt;
    const b = builder.buildSystemPrompt(baseConfig).prompt;
    expect(a).toBe(b);
  });

  test('currentTime breakdown reflects the static guidance and is constant', () => {
    const r1 = builder.buildSystemPrompt(baseConfig);
    const r2 = builder.buildSystemPrompt(baseConfig);
    expect(r1.breakdown.components.currentTime).toBeGreaterThan(0);
    expect(r1.breakdown.components.currentTime).toBe(r2.breakdown.components.currentTime);
  });
});
