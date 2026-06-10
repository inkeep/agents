import { describe, expect, it } from 'vitest';
import {
  INKEEP_CACHE_BOUNDARY_PROP,
  SYSTEM_CACHE_BOUNDARY_SENTINEL,
} from '../../../domains/run/agents/generation/caching-actuator';
import { buildInitialMessages } from '../../../domains/run/agents/generation/conversation-history';

type TextPart = { type: 'text'; text: string; [k: string]: unknown };

const segments = [
  '<conversation_history>\nuser: """a"""',
  '\nuser: """b"""',
  '\n</conversation_history>\n',
];

// R4: when history segments are provided, the history user message is emitted as per-message text
// blocks, with the LAST message block (before the close-tag block) carrying the cache boundary tag.
describe('buildInitialMessages with history segments (R4)', () => {
  it('emits multi-part history content with the boundary tag on the last message block', async () => {
    const messages = await buildInitialMessages(
      'sys',
      segments.join(''),
      'current',
      undefined,
      null,
      segments
    );

    // [system, history, current]
    const history = messages[1] as { role: string; content: TextPart[] };
    expect(history.role).toBe('user');
    expect(Array.isArray(history.content)).toBe(true);
    expect(history.content).toHaveLength(segments.length);

    // concatenated text equals the legacy single string
    expect(history.content.map((p) => p.text).join('')).toBe(segments.join(''));

    // boundary tag sits on the last MESSAGE segment (index length-2), not the close-tag segment
    const boundaryIndex = segments.length - 2;
    expect(history.content[boundaryIndex][INKEEP_CACHE_BOUNDARY_PROP]).toBe('history');
    history.content.forEach((part, i) => {
      if (i !== boundaryIndex) expect(part).not.toHaveProperty(INKEEP_CACHE_BOUNDARY_PROP);
    });
  });

  it('falls back to the single-string history when segments are absent (existing callers)', async () => {
    const messages = await buildInitialMessages(
      'sys',
      '<conversation_history>\nx\n</conversation_history>\n',
      'current'
    );
    const history = messages[1] as { content: unknown };
    expect(typeof history.content).toBe('string');
  });

  it('omits the history message when there are no segments and no string', async () => {
    const messages = await buildInitialMessages('sys', '', 'current', undefined, null, []);
    // only [system, current]
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('clamps the boundary tag to index 0 for a single-segment history (no silent drop)', async () => {
    // A caller not honoring the close-tag-as-own-segment contract passes one segment. Math.max(0,
    // length-2) clamps the -1 index to 0 so the breakpoint lands on the only block instead of
    // being silently dropped.
    const single = ['<conversation_history>\nonly\n</conversation_history>\n'];
    const messages = await buildInitialMessages(
      'sys',
      single.join(''),
      'current',
      undefined,
      null,
      single
    );
    const history = messages[1] as { role: string; content: TextPart[] };
    expect(history.content).toHaveLength(1);
    expect(history.content[0][INKEEP_CACHE_BOUNDARY_PROP]).toBe('history');
  });
});

// R3: the system prompt is split at the cache boundary into two CONSECUTIVE system blocks
// (per-agent stable, then app context + prompts), so Anthropic caches the stable prefix per-agent.
describe('buildInitialMessages system-block split (R3)', () => {
  it('emits two consecutive system blocks and strips the boundary sentinel', async () => {
    const sys = `STABLE_PER_AGENT${SYSTEM_CACHE_BOUNDARY_SENTINEL}PER_CONVERSATION`;
    const messages = await buildInitialMessages(sys, '', 'current');

    expect(messages[0]).toEqual({ role: 'system', content: 'STABLE_PER_AGENT' });
    expect(messages[1]).toEqual({ role: 'system', content: 'PER_CONVERSATION' });
    expect(messages[2].role).toBe('user'); // current turn
    // sentinel never reaches the wire
    for (const m of messages) {
      if (typeof m.content === 'string')
        expect(m.content).not.toContain(SYSTEM_CACHE_BOUNDARY_SENTINEL);
    }
  });

  it('emits a single system block when there is no boundary sentinel (backward compatible)', async () => {
    const messages = await buildInitialMessages('plain system', '', 'current');
    expect(messages[0]).toEqual({ role: 'system', content: 'plain system' });
    expect(messages[1].role).toBe('user');
  });

  it('omits the per-conversation block when it is empty', async () => {
    const sys = `ONLY_STABLE${SYSTEM_CACHE_BOUNDARY_SENTINEL}   `;
    const messages = await buildInitialMessages(sys, '', 'current');
    expect(messages[0]).toEqual({ role: 'system', content: 'ONLY_STABLE' });
    expect(messages[1].role).toBe('user'); // no empty second system block
  });
});
