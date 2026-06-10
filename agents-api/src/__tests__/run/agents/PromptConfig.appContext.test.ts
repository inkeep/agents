import { beforeEach, describe, expect, test } from 'vitest';
import { SYSTEM_CACHE_BOUNDARY_SENTINEL } from '../../../domains/run/agents/generation/caching-actuator';
import { SystemPromptBuilder } from '../../../domains/run/agents/SystemPromptBuilder';
import type { SystemPromptV1 } from '../../../domains/run/agents/types';
import { PromptConfig } from '../../../domains/run/agents/versions/v1/PromptConfig';

describe('PromptConfig App Context Section', () => {
  let builder: SystemPromptBuilder<SystemPromptV1>;

  beforeEach(() => {
    builder = new SystemPromptBuilder('v1', new PromptConfig());
  });

  test('should include <app_context> section when appPrompt is provided', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      appPrompt: 'Be concise and link to documentation pages.',
      tools: [],
      dataComponents: [],
      artifacts: [],
    };

    const result = builder.buildSystemPrompt(config);

    expect(result.prompt).toContain('<app_context>');
    expect(result.prompt).toContain('Be concise and link to documentation pages.');
    expect(result.prompt).toContain('</app_context>');
  });

  test('should omit <app_context> section when appPrompt is undefined', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      tools: [],
      dataComponents: [],
      artifacts: [],
    };

    const result = builder.buildSystemPrompt(config);

    expect(result.prompt).not.toContain('<app_context>');
    expect(result.prompt).not.toContain('</app_context>');
  });

  test('should omit <app_context> section when appPrompt is empty string', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      appPrompt: '',
      tools: [],
      dataComponents: [],
      artifacts: [],
    };

    const result = builder.buildSystemPrompt(config);

    expect(result.prompt).not.toContain('<app_context>');
  });

  test('should omit <app_context> section when appPrompt is whitespace only', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      appPrompt: '   ',
      tools: [],
      dataComponents: [],
      artifacts: [],
    };

    const result = builder.buildSystemPrompt(config);

    expect(result.prompt).not.toContain('<app_context>');
  });

  test('should track appPrompt tokens in breakdown', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      appPrompt: 'Be concise and link to documentation pages.',
      tools: [],
      dataComponents: [],
      artifacts: [],
    };

    const result = builder.buildSystemPrompt(config);

    expect(result.breakdown.components.appPrompt).toBeGreaterThan(0);
  });

  test('should have zero appPrompt tokens when no app prompt', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      tools: [],
      dataComponents: [],
      artifacts: [],
    };

    const result = builder.buildSystemPrompt(config);

    expect(result.breakdown.components.appPrompt).toBe(0);
  });

  test('R3 reorder: app_context and the prompts sit after the per-agent cache boundary, app before agent', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      prompt: 'Agent-level context here.',
      appPrompt: 'App-level context here.',
      tools: [],
      dataComponents: [],
      artifacts: [],
    };

    const result = builder.buildSystemPrompt(config);

    const boundaryIndex = result.prompt.indexOf(SYSTEM_CACHE_BOUNDARY_SENTINEL);
    const appContextIndex = result.prompt.indexOf('<app_context>');
    const agentContextIndex = result.prompt.indexOf('<agent_context>');
    const coreIndex = result.prompt.indexOf('<core_instructions>');

    // The boundary exists and everything per-app / per-conversation lives AFTER it (Sub-block B+C).
    expect(boundaryIndex).toBeGreaterThan(-1);
    expect(appContextIndex).toBeGreaterThan(boundaryIndex);
    expect(agentContextIndex).toBeGreaterThan(boundaryIndex);
    expect(coreIndex).toBeGreaterThan(boundaryIndex);
    // Within Sub-block B+C, app_context (per-app) precedes the per-conversation prompts.
    expect(appContextIndex).toBeLessThan(agentContextIndex);
  });

  test('R3: the tools/schemas (per-agent stable) sit BEFORE the cache boundary', () => {
    const config: SystemPromptV1 = {
      corePrompt: 'You are a helpful assistant.',
      prompt: 'Agent-level context here.',
      tools: [],
      dataComponents: [],
      artifacts: [],
    };

    const result = builder.buildSystemPrompt(config);
    const boundaryIndex = result.prompt.indexOf(SYSTEM_CACHE_BOUNDARY_SENTINEL);
    // behavioral_constraints is part of the per-agent stable block (Sub-block A).
    expect(result.prompt.indexOf('<behavioral_constraints>')).toBeLessThan(boundaryIndex);
    expect(result.prompt.indexOf('<core_instructions>')).toBeGreaterThan(boundaryIndex);
  });
});
