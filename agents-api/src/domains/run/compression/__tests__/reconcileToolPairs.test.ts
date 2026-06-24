import { describe, expect, it } from 'vitest';
import { reconcileToolPairs } from '../reconcileToolPairs';

const call = (id: string, name = 'delegate_to_content-drafter') => ({
  type: 'tool-call',
  toolCallId: id,
  toolName: name,
  input: {},
});
const result = (id: string) => ({ type: 'tool-result', toolCallId: id, output: { ok: true } });
const text = (t: string) => ({ type: 'text', text: t });
const reasoning = (t: string) => ({ type: 'reasoning', text: t });
const image = (url: string) => ({ type: 'image', image: url });

const callIds = (m: any[]) =>
  m.flatMap((msg) =>
    Array.isArray(msg.content)
      ? msg.content.filter((p: any) => p.type === 'tool-call').map((p: any) => p.toolCallId)
      : []
  );
const resultIds = (m: any[]) =>
  m.flatMap((msg) =>
    Array.isArray(msg.content)
      ? msg.content.filter((p: any) => p.type === 'tool-result').map((p: any) => p.toolCallId)
      : []
  );

/** Every tool-call has a matching tool-result and vice versa. */
const isLegal = (m: any[]) => {
  const calls = new Set(callIds(m));
  const results = new Set(resultIds(m));
  for (const id of calls) if (!results.has(id)) return false;
  for (const id of results) if (!calls.has(id)) return false;
  return true;
};

describe('reconcileToolPairs', () => {
  it('is a no-op on an already-legal array', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [text('working'), call('a')] },
      { role: 'tool', content: [result('a')] },
    ];
    const out = reconcileToolPairs(messages);
    expect(out.changed).toBe(false);
    expect(out.messages).toEqual(messages);
  });

  it('drops a dangling tool-call but keeps sibling text', () => {
    const messages = [
      { role: 'assistant', content: [text('let me check'), call('a')] },
      // no tool-result for 'a'
    ];
    const out = reconcileToolPairs(messages);
    expect(out.changed).toBe(true);
    expect(out.droppedDanglingCallIds).toEqual(['a']);
    expect(isLegal(out.messages)).toBe(true);
    expect(out.messages[0].content).toEqual([text('let me check')]);
  });

  it('drops an orphan tool-result', () => {
    const messages = [{ role: 'tool', content: [result('ghost')] }];
    const out = reconcileToolPairs(messages);
    expect(out.changed).toBe(true);
    expect(out.droppedOrphanResultIds).toEqual(['ghost']);
    expect(out.droppedMessageCount).toBe(1);
    expect(out.messages).toHaveLength(0);
  });

  it('drops an assistant message left with only a tool-call (becomes empty)', () => {
    const messages = [{ role: 'assistant', content: [call('a')] }];
    const out = reconcileToolPairs(messages);
    expect(out.droppedMessageCount).toBe(1);
    expect(out.messages).toHaveLength(0);
  });

  it('drops a reasoning-only assistant turn after its tool-call is removed (D6)', () => {
    const messages = [{ role: 'assistant', content: [reasoning('thinking...'), call('a')] }];
    const out = reconcileToolPairs(messages);
    expect(out.changed).toBe(true);
    expect(out.messages).toHaveLength(0);
    expect(isLegal(out.messages)).toBe(true);
  });

  it('handles the 3-parallel-delegation case (all results dropped by compression)', () => {
    const messages = [
      { role: 'user', content: 'coordinate' },
      { role: 'assistant', content: [call('toolu_1'), call('toolu_2'), call('toolu_3')] },
      // compression dropped all three tool-result messages
    ];
    const out = reconcileToolPairs(messages);
    expect(out.droppedDanglingCallIds.sort()).toEqual(['toolu_1', 'toolu_2', 'toolu_3']);
    expect(isLegal(out.messages)).toBe(true);
    expect(out.messages).toEqual([{ role: 'user', content: 'coordinate' }]);
  });

  it('keeps a paired call when only one of several siblings is dangling', () => {
    const messages = [
      { role: 'assistant', content: [call('keep'), call('drop')] },
      { role: 'tool', content: [result('keep')] },
    ];
    const out = reconcileToolPairs(messages);
    expect(out.droppedDanglingCallIds).toEqual(['drop']);
    expect(isLegal(out.messages)).toBe(true);
    expect(callIds(out.messages)).toEqual(['keep']);
  });

  it('preserves an image-only message (no tool parts, not modified)', () => {
    const messages = [
      { role: 'user', content: [image('https://x/a.png')] },
      { role: 'assistant', content: [text('done'), call('a')] },
      { role: 'tool', content: [result('a')] },
    ];
    const out = reconcileToolPairs(messages);
    expect(out.changed).toBe(false);
    expect(out.messages).toEqual(messages);
  });

  it('keeps the image when a dangling tool-call is dropped from a mixed message', () => {
    const messages = [{ role: 'assistant', content: [image('https://x/a.png'), call('a')] }];
    const out = reconcileToolPairs(messages);
    expect(out.droppedDanglingCallIds).toEqual(['a']);
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0].content).toEqual([image('https://x/a.png')]);
  });

  it('leaves string-content messages untouched', () => {
    const messages = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'question' },
    ];
    const out = reconcileToolPairs(messages);
    expect(out.changed).toBe(false);
    expect(out.messages).toEqual(messages);
  });

  it('is idempotent', () => {
    const messages = [
      { role: 'assistant', content: [text('hi'), call('a'), call('b')] },
      { role: 'tool', content: [result('a')] },
    ];
    const once = reconcileToolPairs(messages);
    const twice = reconcileToolPairs(once.messages);
    expect(twice.changed).toBe(false);
    expect(twice.messages).toEqual(once.messages);
  });
});
