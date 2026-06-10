import { describe, expect, it } from 'vitest';
import {
  formatMessagesAsConversationHistory,
  formatMessagesAsConversationHistorySegments,
} from '../../../domains/run/data/conversations';

type Messages = Parameters<typeof formatMessagesAsConversationHistory>[0];

const messages = [
  { role: 'user', messageType: 'chat', content: { text: 'a' } },
  { role: 'agent', messageType: 'chat', fromSubAgentId: 'bot', content: { text: 'b' } },
  { role: 'user', messageType: 'chat', content: { text: 'c' } },
] as Messages;

// R4: segments are the per-message rendering of the history; concatenation must be byte-identical
// to the legacy single string so the model sees exactly the same text.
describe('formatMessagesAsConversationHistorySegments (R4)', () => {
  it('returns [] for empty input', async () => {
    expect(await formatMessagesAsConversationHistorySegments([])).toEqual([]);
  });

  it('returns [] when every message reconstructs to empty text', async () => {
    const empty = [
      { role: 'user', messageType: 'chat', content: { parts: [{ kind: 'image' }] } },
    ] as Messages;
    expect(await formatMessagesAsConversationHistorySegments(empty)).toEqual([]);
  });

  it('concatenation is byte-identical to the string formatter', async () => {
    const segments = await formatMessagesAsConversationHistorySegments(messages);
    const string = await formatMessagesAsConversationHistory(messages);
    expect(segments.join('')).toBe(string);
  });

  it('opens on the first segment and closes on its OWN final segment', async () => {
    const segments = await formatMessagesAsConversationHistorySegments(messages);
    expect(segments[0].startsWith('<conversation_history>\n')).toBe(true);
    expect(segments[segments.length - 1]).toBe('\n</conversation_history>\n');
    // one segment per message + one close-tag segment
    expect(segments).toHaveLength(messages.length + 1);
  });

  it('older message segments are stable when a turn is appended', async () => {
    const before = await formatMessagesAsConversationHistorySegments(messages);
    const after = await formatMessagesAsConversationHistorySegments([
      ...messages,
      { role: 'user', messageType: 'chat', content: { text: 'd' } },
    ] as Messages);
    // every message segment from the earlier render is byte-identical in the later render
    for (let i = 0; i < messages.length; i++) {
      expect(after[i]).toBe(before[i]);
    }
  });
});
