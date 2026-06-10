import type { ModelSettings } from '@inkeep/agents-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refs = vi.hoisted(() => ({
  envMock: { INKEEP_PROMPT_CACHING_ENABLED: true as boolean | undefined },
}));

vi.mock('../../../../../env', () => ({
  env: refs.envMock,
}));

import { attachPromptCaching, INKEEP_CACHE_BOUNDARY_PROP } from '../caching-actuator';

const ENV_KEYS = ['AI_GATEWAY_API_KEY'] as const;

function snapshotEnv(): Record<(typeof ENV_KEYS)[number], string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]])) as Record<
    (typeof ENV_KEYS)[number],
    string | undefined
  >;
}

function restoreEnv(snap: Record<(typeof ENV_KEYS)[number], string | undefined>): void {
  for (const key of ENV_KEYS) {
    const value = snap[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function makeGatewayRoutedSettings(): ModelSettings {
  return { model: 'anthropic/claude-sonnet-4-5' };
}

function makeDirectRoutedSettings(): ModelSettings {
  return { model: 'anthropic/claude-sonnet-4-5' };
}

describe('attachPromptCaching', () => {
  const originalEnv = snapshotEnv();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    refs.envMock.INKEEP_PROMPT_CACHING_ENABLED = true;
  });

  afterEach(() => {
    restoreEnv(originalEnv);
  });

  describe('outer env-var gate (D20)', () => {
    it('returns config unchanged when INKEEP_PROMPT_CACHING_ENABLED=false in gateway mode', () => {
      refs.envMock.INKEEP_PROMPT_CACHING_ENABLED = false;
      process.env.AI_GATEWAY_API_KEY = 'test-key';
      const config = {
        messages: [{ role: 'system', content: 'sys' }],
        providerOptions: { gateway: { order: ['anthropic'] } },
      };

      const result = attachPromptCaching(config, makeGatewayRoutedSettings());

      expect(result).toBe(config);
      expect(result.providerOptions).toEqual({ gateway: { order: ['anthropic'] } });
    });

    it('returns config unchanged when INKEEP_PROMPT_CACHING_ENABLED=false in direct mode', () => {
      refs.envMock.INKEEP_PROMPT_CACHING_ENABLED = false;
      const config = {
        messages: [{ role: 'system', content: 'sys' }],
      };

      const result = attachPromptCaching(config, makeDirectRoutedSettings());

      expect(result).toBe(config);
      expect(result.messages[0]).not.toHaveProperty('providerOptions');
    });

    it('attaches caching when env var unset (default-on)', () => {
      process.env.AI_GATEWAY_API_KEY = 'test-key';
      const config = {
        messages: [{ role: 'system', content: 'sys' }],
      };

      const result = attachPromptCaching(config, makeGatewayRoutedSettings()) as typeof config & {
        providerOptions: { gateway: { caching: string } };
      };

      expect(result.providerOptions.gateway.caching).toBe('auto');
    });
  });

  describe('gateway mode (D7)', () => {
    beforeEach(() => {
      process.env.AI_GATEWAY_API_KEY = 'test-key';
    });

    it('attaches gateway.caching = "auto" when no providerOptions exist', () => {
      const config = { messages: [{ role: 'system', content: 'sys' }] };

      const result = attachPromptCaching(config, makeGatewayRoutedSettings()) as typeof config & {
        providerOptions: { gateway: { caching: string } };
      };

      expect(result.providerOptions.gateway.caching).toBe('auto');
    });

    it('honors customer non-nullish gateway.caching (nullish-coalesce)', () => {
      const config = {
        messages: [{ role: 'system', content: 'sys' }],
        providerOptions: { gateway: { caching: 'off' } },
      };

      const result = attachPromptCaching(config, makeGatewayRoutedSettings());

      expect(result.providerOptions.gateway).toMatchObject({ caching: 'off' });
    });

    it('preserves existing gateway.order, gateway.only, gateway.models routing settings', () => {
      const config = {
        messages: [{ role: 'system', content: 'sys' }],
        providerOptions: {
          gateway: {
            order: ['anthropic', 'openai'],
            only: ['anthropic'],
            models: ['anthropic/claude-sonnet-4-5'],
          },
        },
      };

      const result = attachPromptCaching(config, makeGatewayRoutedSettings()) as typeof config & {
        providerOptions: { gateway: Record<string, unknown> };
      };

      expect(result.providerOptions.gateway).toMatchObject({
        order: ['anthropic', 'openai'],
        only: ['anthropic'],
        models: ['anthropic/claude-sonnet-4-5'],
        caching: 'auto',
      });
    });

    it('preserves sibling top-level anthropic.structuredOutputMode injection', () => {
      const config = {
        messages: [{ role: 'system', content: 'sys' }],
        providerOptions: {
          gateway: { order: ['anthropic'] },
          anthropic: { structuredOutputMode: 'jsonTool' },
        },
      };

      const result = attachPromptCaching(config, makeGatewayRoutedSettings()) as typeof config & {
        providerOptions: { anthropic: Record<string, unknown> };
      };

      expect(result.providerOptions.anthropic).toEqual({ structuredOutputMode: 'jsonTool' });
    });

    it('does NOT mutate messages in gateway mode', () => {
      const sysMsg = { role: 'system', content: 'sys' };
      const config = { messages: [sysMsg] };

      const result = attachPromptCaching(config, makeGatewayRoutedSettings());

      expect(result.messages[0]).toBe(sysMsg);
      expect(result.messages[0]).not.toHaveProperty('providerOptions');
    });

    it('is idempotent — second call preserves first call result (nullish-coalesce)', () => {
      const config: {
        messages: Array<{ role: string; content: string }>;
        providerOptions?: Record<string, unknown>;
      } = {
        messages: [{ role: 'system', content: 'sys' }],
      };

      const first = attachPromptCaching(config, makeGatewayRoutedSettings());
      const second = attachPromptCaching(first, makeGatewayRoutedSettings());

      const caching = (second.providerOptions?.gateway as { caching: string } | undefined)?.caching;
      expect(caching).toBe('auto');
    });
  });

  describe('direct mode (D7)', () => {
    it('attaches cacheControl on system message when AI_GATEWAY_API_KEY is unset', () => {
      const config = {
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'hi' },
        ],
      };

      const result = attachPromptCaching(config, makeDirectRoutedSettings()) as typeof config & {
        messages: Array<{ providerOptions?: { anthropic?: { cacheControl?: unknown } } }>;
      };

      expect(result.messages[0].providerOptions?.anthropic?.cacheControl).toEqual({
        type: 'ephemeral',
      });
    });

    it('returns config unchanged when the model string is empty (direct-mode guard)', () => {
      const config = {
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'hi' },
        ],
      };

      const result = attachPromptCaching(config, { model: '' });

      expect(result).toBe(config);
    });

    it('returns config unchanged when the model string is whitespace-only (direct-mode guard)', () => {
      const config = {
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'hi' },
        ],
      };

      const result = attachPromptCaching(config, { model: '   ' });

      expect(result).toBe(config);
    });

    it('attaches cacheControl ONLY on the system message (not user/assistant)', () => {
      const config = {
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
          { role: 'user', content: 'follow-up' },
        ],
      };

      const result = attachPromptCaching(config, makeDirectRoutedSettings()) as typeof config & {
        messages: Array<{ providerOptions?: { anthropic?: { cacheControl?: unknown } } }>;
      };

      expect(result.messages[0].providerOptions?.anthropic?.cacheControl).toBeDefined();
      expect(result.messages[1].providerOptions).toBeUndefined();
      expect(result.messages[2].providerOptions).toBeUndefined();
      expect(result.messages[3].providerOptions).toBeUndefined();
    });

    it('honors customer-set cacheControl on system message (nullish-coalesce)', () => {
      const customerCacheControl = { type: 'ephemeral', ttl: '1h' };
      const config = {
        messages: [
          {
            role: 'system',
            content: 'sys',
            providerOptions: { anthropic: { cacheControl: customerCacheControl } },
          },
          { role: 'user', content: 'hi' },
        ],
      };

      const result = attachPromptCaching(config, makeDirectRoutedSettings()) as typeof config & {
        messages: Array<{ providerOptions?: { anthropic?: { cacheControl?: unknown } } }>;
      };

      expect(result.messages[0].providerOptions?.anthropic?.cacheControl).toBe(
        customerCacheControl
      );
    });

    it('preserves other providerOptions.anthropic.* settings on the system message', () => {
      const config = {
        messages: [
          {
            role: 'system',
            content: 'sys',
            providerOptions: {
              anthropic: { sendReasoning: true, thinking: { budgetTokens: 1024 } },
            },
          },
        ],
      };

      const result = attachPromptCaching(config, makeDirectRoutedSettings()) as typeof config & {
        messages: Array<{ providerOptions?: { anthropic?: Record<string, unknown> } }>;
      };

      expect(result.messages[0].providerOptions?.anthropic).toMatchObject({
        sendReasoning: true,
        thinking: { budgetTokens: 1024 },
        cacheControl: { type: 'ephemeral' },
      });
    });

    it('returns config unchanged when messages array is empty', () => {
      const config = { messages: [] as Array<{ role: string }> };

      const result = attachPromptCaching(config, makeDirectRoutedSettings());

      expect(result).toBe(config);
    });

    it('returns config unchanged when messages is undefined', () => {
      const config = {};

      const result = attachPromptCaching(config, makeDirectRoutedSettings());

      expect(result).toBe(config);
    });

    it('handles messages array with no system role (no-op on system mutation)', () => {
      const userMsg = { role: 'user', content: 'hi' };
      const config: {
        messages: Array<{ role: string; content: string }>;
        providerOptions?: Record<string, unknown>;
      } = {
        messages: [userMsg],
      };

      const result = attachPromptCaching(config, makeDirectRoutedSettings());

      expect(result.messages[0]).toBe(userMsg);
      expect(result.providerOptions).toBeUndefined();
    });

    it('does NOT touch providerOptions in direct mode (mutation is per-message only)', () => {
      const config = {
        messages: [{ role: 'system', content: 'sys' }],
        providerOptions: { anthropic: { structuredOutputMode: 'jsonTool' } },
      };

      const result = attachPromptCaching(config, makeDirectRoutedSettings());

      expect(result.providerOptions).toEqual({ anthropic: { structuredOutputMode: 'jsonTool' } });
    });

    it('is idempotent — second call preserves first call result', () => {
      const config = { messages: [{ role: 'system', content: 'sys' }] };

      const first = attachPromptCaching(config, makeDirectRoutedSettings());
      const second = attachPromptCaching(first, makeDirectRoutedSettings());

      const firstCacheControl = (
        first.messages[0] as { providerOptions?: { anthropic?: { cacheControl?: unknown } } }
      ).providerOptions?.anthropic?.cacheControl;
      const secondCacheControl = (
        second.messages[0] as { providerOptions?: { anthropic?: { cacheControl?: unknown } } }
      ).providerOptions?.anthropic?.cacheControl;

      expect(firstCacheControl).toEqual({ type: 'ephemeral' });
      expect(secondCacheControl).toEqual({ type: 'ephemeral' });
    });
  });

  describe('direct mode provider guard (non-Anthropic providers must not get anthropic.cacheControl)', () => {
    it('does NOT attach anthropic.cacheControl for openai model in direct mode', () => {
      const config = {
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'hi' },
        ],
      };

      const result = attachPromptCaching(config, { model: 'openai/gpt-4o' });

      expect(result.messages[0]).not.toHaveProperty('providerOptions');
      expect(result.messages[1]).not.toHaveProperty('providerOptions');
    });

    it('does NOT attach anthropic.cacheControl for google model in direct mode', () => {
      const config = {
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'hi' },
        ],
      };

      const result = attachPromptCaching(config, { model: 'google/gemini-2.0-flash' });

      expect(result.messages[0]).not.toHaveProperty('providerOptions');
    });

    it('does NOT attach anthropic.cacheControl for azure model in direct mode', () => {
      const config = {
        messages: [{ role: 'system', content: 'sys' }],
      };

      const result = attachPromptCaching(config, { model: 'azure/my-deployment' });

      expect(result.messages[0]).not.toHaveProperty('providerOptions');
    });

    it('DOES attach anthropic.cacheControl for anthropic model in direct mode', () => {
      const config = {
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'hi' },
        ],
      };

      const result = attachPromptCaching(config, {
        model: 'anthropic/claude-sonnet-4-5',
      }) as typeof config & {
        messages: Array<{ providerOptions?: { anthropic?: { cacheControl?: unknown } } }>;
      };

      expect(result.messages[0].providerOptions?.anthropic?.cacheControl).toEqual({
        type: 'ephemeral',
      });
      expect(result.messages[1].providerOptions).toBeUndefined();
    });
  });

  describe('routing preservation invariant (STOP_IF naive overwrite)', () => {
    it('preserves all 3 Inkeep-injected providerOptions concerns in gateway mode', () => {
      process.env.AI_GATEWAY_API_KEY = 'test-key';
      const config = {
        messages: [{ role: 'system', content: 'sys' }],
        providerOptions: {
          gateway: {
            order: ['anthropic'],
            only: ['anthropic'],
            models: ['anthropic/claude-sonnet-4-5'],
          },
          anthropic: { structuredOutputMode: 'jsonTool' },
        },
      };

      const result = attachPromptCaching(config, makeGatewayRoutedSettings()) as typeof config & {
        providerOptions: {
          gateway: Record<string, unknown>;
          anthropic: Record<string, unknown>;
        };
      };

      expect(result.providerOptions.gateway).toMatchObject({
        order: ['anthropic'],
        only: ['anthropic'],
        models: ['anthropic/claude-sonnet-4-5'],
        caching: 'auto',
      });
      expect(result.providerOptions.anthropic).toEqual({ structuredOutputMode: 'jsonTool' });
    });
  });

  describe('history boundary marker (R4: BP2)', () => {
    const makeConfig = () => ({
      messages: [
        { role: 'system', content: 'sys' },
        {
          role: 'user',
          content: [
            { type: 'text', text: '<conversation_history>\nuser: """a"""' },
            { type: 'text', text: '\nuser: """b"""', [INKEEP_CACHE_BOUNDARY_PROP]: 'history' },
            { type: 'text', text: '\n</conversation_history>\n' },
          ],
        },
        { role: 'user', content: 'current' },
      ],
    });

    type PartArr = Array<Record<string, unknown> & { providerOptions?: { anthropic?: unknown } }>;

    it('direct Anthropic: marks the tagged history block + system, and strips the tag', () => {
      const result = attachPromptCaching(makeConfig(), makeDirectRoutedSettings()) as ReturnType<
        typeof makeConfig
      > & { messages: Array<{ providerOptions?: { anthropic?: { cacheControl?: unknown } } }> };

      // BP1 — system message marked
      expect(result.messages[0].providerOptions?.anthropic?.cacheControl).toEqual({
        type: 'ephemeral',
      });
      // BP2 — the tagged history block marked, tag stripped
      const parts = result.messages[1].content as unknown as PartArr;
      expect(parts[1]).not.toHaveProperty(INKEEP_CACHE_BOUNDARY_PROP);
      expect(parts[1].providerOptions?.anthropic).toEqual({ cacheControl: { type: 'ephemeral' } });
      // Other history blocks untouched (no marker)
      expect(parts[0]).not.toHaveProperty('providerOptions');
      expect(parts[2]).not.toHaveProperty('providerOptions');
    });

    it('strips the boundary tag even when caching is disabled (no marker)', () => {
      refs.envMock.INKEEP_PROMPT_CACHING_ENABLED = false;
      const result = attachPromptCaching(makeConfig(), makeDirectRoutedSettings());
      const parts = result.messages[1].content as unknown as PartArr;
      expect(parts[1]).not.toHaveProperty(INKEEP_CACHE_BOUNDARY_PROP);
      expect(parts[1]).not.toHaveProperty('providerOptions');
    });

    it('non-Anthropic direct: strips the tag, no anthropic marker', () => {
      const result = attachPromptCaching(makeConfig(), { model: 'openai/gpt-4o' });
      const parts = result.messages[1].content as unknown as PartArr;
      expect(parts[1]).not.toHaveProperty(INKEEP_CACHE_BOUNDARY_PROP);
      expect(parts[1]).not.toHaveProperty('providerOptions');
      expect(result.messages[0]).not.toHaveProperty('providerOptions');
    });

    it('gateway: strips the tag and keeps caching:auto (no per-part marker yet)', () => {
      process.env.AI_GATEWAY_API_KEY = 'test-key';
      const result = attachPromptCaching(makeConfig(), makeGatewayRoutedSettings()) as ReturnType<
        typeof makeConfig
      > & { providerOptions: { gateway: { caching: string } } };
      const parts = result.messages[1].content as unknown as PartArr;
      expect(parts[1]).not.toHaveProperty(INKEEP_CACHE_BOUNDARY_PROP);
      expect(parts[1]).not.toHaveProperty('providerOptions');
      expect(result.providerOptions.gateway.caching).toBe('auto');
    });
  });

  describe('two-block system (R3: per-agent BP1 + per-conversation)', () => {
    it('marks BOTH consecutive system blocks on direct Anthropic', () => {
      const config = {
        messages: [
          { role: 'system', content: 'STABLE per-agent (Sub-block A)' },
          { role: 'system', content: 'app context + prompts (Sub-block B+C)' },
          { role: 'user', content: 'current' },
        ],
      };

      const result = attachPromptCaching(config, makeDirectRoutedSettings()) as typeof config & {
        messages: Array<{ providerOptions?: { anthropic?: { cacheControl?: unknown } } }>;
      };

      // BP1 (per-agent) and the per-conversation boundary are both marked; the user turn is not.
      expect(result.messages[0].providerOptions?.anthropic?.cacheControl).toEqual({
        type: 'ephemeral',
      });
      expect(result.messages[1].providerOptions?.anthropic?.cacheControl).toEqual({
        type: 'ephemeral',
      });
      expect(result.messages[2].providerOptions).toBeUndefined();
    });
  });

  describe('multi-provider system-block merge', () => {
    const twoSystemBlocks = () => ({
      messages: [
        { role: 'system', content: 'STABLE (Sub-block A)' },
        { role: 'system', content: 'PER-CONVERSATION (Sub-block B+C)' },
        { role: 'user', content: 'current' },
      ],
    });

    it('merges two leading system blocks into one on gateway routes', () => {
      process.env.AI_GATEWAY_API_KEY = 'test-key';
      const result = attachPromptCaching(twoSystemBlocks(), makeGatewayRoutedSettings()) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(result.messages.filter((m) => m.role === 'system')).toHaveLength(1);
      expect(result.messages[0].content).toBe(
        'STABLE (Sub-block A)PER-CONVERSATION (Sub-block B+C)'
      );
      expect(result.messages[1].role).toBe('user');
    });

    it('merges two leading system blocks into one for a non-Anthropic direct model', () => {
      const result = attachPromptCaching(twoSystemBlocks(), { model: 'openai/gpt-4o' }) as {
        messages: Array<{ role: string }>;
      };
      expect(result.messages.filter((m) => m.role === 'system')).toHaveLength(1);
    });

    it('keeps two system blocks on direct Anthropic (BP1 needs the split)', () => {
      const result = attachPromptCaching(twoSystemBlocks(), makeDirectRoutedSettings()) as {
        messages: Array<{ role: string }>;
      };
      expect(result.messages.filter((m) => m.role === 'system')).toHaveLength(2);
    });
  });
});
