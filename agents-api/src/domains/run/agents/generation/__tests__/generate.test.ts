import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedGenerationResponse } from '../../agent-types';
import {
  buildStructuredSuccessText,
  computeGenerationType,
  mapPartsToEventParts,
  resolveTextResponseAndWarn,
  selectStructuredFallbackText,
} from '../generate';

vi.mock('../../../../logger', () => createMockLoggerModule().module);

function makeResponse(
  overrides: Partial<ResolvedGenerationResponse> = {}
): ResolvedGenerationResponse {
  return {
    steps: [],
    text: '',
    finishReason: 'stop',
    ...overrides,
  } as ResolvedGenerationResponse;
}

describe('computeGenerationType', () => {
  it('returns text_generation when parts are empty and no object', () => {
    expect(computeGenerationType([], false)).toBe('text_generation');
  });

  it('returns text_generation when parts are null/undefined and no object', () => {
    expect(computeGenerationType(null, false)).toBe('text_generation');
    expect(computeGenerationType(undefined, false)).toBe('text_generation');
  });

  it('returns object_generation when only object is present', () => {
    expect(computeGenerationType([{ kind: 'data' }], true)).toBe('object_generation');
  });

  it('returns mixed_generation when both text and object parts are present', () => {
    expect(computeGenerationType([{ kind: 'text' }, { kind: 'data' }], true)).toBe(
      'mixed_generation'
    );
  });

  it('returns text_generation when a text part is present but no object', () => {
    expect(computeGenerationType([{ kind: 'text' }], false)).toBe('text_generation');
  });

  it('treats non-text, non-null kinds without object as text_generation', () => {
    expect(computeGenerationType([{ kind: 'file' as any }], false)).toBe('text_generation');
  });
});

describe('buildStructuredSuccessText', () => {
  it('returns JSON only when response.text is empty', () => {
    const response = makeResponse({ text: '', output: { dataComponents: [{ name: 'Card' }] } });
    expect(buildStructuredSuccessText(response)).toBe(
      JSON.stringify({ dataComponents: [{ name: 'Card' }] }, null, 2)
    );
  });

  it('returns JSON only when response.text is whitespace', () => {
    const response = makeResponse({ text: '   \n\n  ', output: { a: 1 } });
    expect(buildStructuredSuccessText(response)).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it('prepends trimmed response.text as prelude when non-empty', () => {
    const response = makeResponse({ text: '  prelude  ', output: { a: 1 } });
    expect(buildStructuredSuccessText(response)).toBe(
      `prelude\n\n${JSON.stringify({ a: 1 }, null, 2)}`
    );
  });

  it('skips prelude when response.text is the raw JSON that matches output (no duplication)', () => {
    const output = { dataComponents: [{ name: 'Card' }] };
    const response = makeResponse({
      text: JSON.stringify(output),
      output,
    });
    expect(buildStructuredSuccessText(response)).toBe(JSON.stringify(output, null, 2));
  });

  it('skips prelude when response.text is pretty-printed raw JSON that matches output', () => {
    const output = { a: 1, b: 2 };
    const response = makeResponse({
      text: JSON.stringify(output, null, 2),
      output,
    });
    expect(buildStructuredSuccessText(response)).toBe(JSON.stringify(output, null, 2));
  });

  it('keeps prelude when response.text parses to JSON but differs structurally from output', () => {
    const output = { a: 1 };
    const response = makeResponse({ text: '[1, 2, 3]', output });
    expect(buildStructuredSuccessText(response)).toBe(
      `[1, 2, 3]\n\n${JSON.stringify(output, null, 2)}`
    );
  });

  it('keeps prose preludes that start with { but are not valid JSON', () => {
    const output = { a: 1 };
    const response = makeResponse({
      text: '{Important} Given the constraints, here is the result:',
      output,
    });
    expect(buildStructuredSuccessText(response)).toBe(
      `{Important} Given the constraints, here is the result:\n\n${JSON.stringify(output, null, 2)}`
    );
  });

  it('keeps prose preludes that start with [ but are not valid JSON', () => {
    const output = { a: 1 };
    const response = makeResponse({
      text: '[Note] Here is what I found:',
      output,
    });
    expect(buildStructuredSuccessText(response)).toBe(
      `[Note] Here is what I found:\n\n${JSON.stringify(output, null, 2)}`
    );
  });

  it('keeps prelude containing valid JSON plus trailing prose (prelude parse fails)', () => {
    const output = { a: 1 };
    const response = makeResponse({
      text: '{"a": 1} — and here is my reasoning',
      output,
    });
    expect(buildStructuredSuccessText(response)).toBe(
      `{"a": 1} — and here is my reasoning\n\n${JSON.stringify(output, null, 2)}`
    );
  });
});

describe('selectStructuredFallbackText', () => {
  it('returns response.text when it is present', () => {
    const response = makeResponse({ text: 'Let me search...' });
    expect(selectStructuredFallbackText(response)).toBe('Let me search...');
  });

  it('walks steps when response.text is empty', () => {
    const response = makeResponse({
      text: '',
      steps: [{ text: 'intermediate reasoning' }, { text: '' }, { text: 'more reasoning' }] as any,
    });
    expect(selectStructuredFallbackText(response)).toBe('intermediate reasoning\n\nmore reasoning');
  });

  it('filters falsy step texts', () => {
    const response = makeResponse({
      text: '',
      steps: [
        { text: 'a' },
        { text: null as any },
        { text: undefined as any },
        { text: 'b' },
      ] as any,
    });
    expect(selectStructuredFallbackText(response)).toBe('a\n\nb');
  });

  it('returns empty string when both response.text and all steps are empty', () => {
    const response = makeResponse({ text: '', steps: [{ text: '' }, { text: '' }] as any });
    expect(selectStructuredFallbackText(response)).toBe('');
  });

  it('returns empty string when steps is undefined and text is empty', () => {
    const response = makeResponse({ text: '', steps: undefined as any });
    expect(selectStructuredFallbackText(response)).toBe('');
  });
});

describe('mapPartsToEventParts', () => {
  it('returns empty array when parts is undefined or null', () => {
    expect(mapPartsToEventParts(undefined)).toEqual([]);
    expect(mapPartsToEventParts(null)).toEqual([]);
    expect(mapPartsToEventParts([])).toEqual([]);
  });

  it('maps text parts to type: text with content', () => {
    expect(mapPartsToEventParts([{ kind: 'text', text: 'hello' }])).toEqual([
      { type: 'text', content: 'hello' },
    ]);
  });

  it('maps data parts without artifact markers to type: data_component', () => {
    const data = { id: 'card1', name: 'Card', props: { title: 'Hi' } };
    expect(mapPartsToEventParts([{ kind: 'data', data }])).toEqual([
      { type: 'data_component', data },
    ]);
  });

  it('maps data parts with artifactId + toolCallId to type: data_artifact', () => {
    const data = { artifactId: 'art-1', toolCallId: 'call-1', name: 'MyArtifact' };
    expect(mapPartsToEventParts([{ kind: 'data', data }])).toEqual([
      { type: 'data_artifact', data },
    ]);
  });

  it('preserves order across mixed text + data parts', () => {
    const data = { id: 'card1' };
    const result = mapPartsToEventParts([
      { kind: 'text', text: 'prelude' },
      { kind: 'data', data },
      { kind: 'text', text: 'middle' },
      { kind: 'data', data: { artifactId: 'a1', toolCallId: 't1' } },
    ]);
    expect(result).toEqual([
      { type: 'text', content: 'prelude' },
      { type: 'data_component', data },
      { type: 'text', content: 'middle' },
      { type: 'data_artifact', data: { artifactId: 'a1', toolCallId: 't1' } },
    ]);
  });

  it('never emits tool_result for data parts', () => {
    const result = mapPartsToEventParts([
      { kind: 'data', data: { foo: 'bar' } },
      { kind: 'data', data: { artifactId: 'a', toolCallId: 't' } },
    ]);
    for (const part of result) {
      expect(part.type).not.toBe('tool_result');
    }
  });

  it('maps text part with missing text to empty content', () => {
    expect(mapPartsToEventParts([{ kind: 'text' }])).toEqual([{ type: 'text', content: '' }]);
  });
});

describe('resolveTextResponseAndWarn', () => {
  let log: { warn: ReturnType<typeof vi.fn> };
  const warnContext = { agentId: 'agent-1', conversationId: 'conv-1', finishReason: 'stop' };

  beforeEach(() => {
    log = { warn: vi.fn() };
  });

  it('uses structured success text when hasStructuredOutput && response.output', () => {
    const response = makeResponse({ text: 'prelude', output: { a: 1 } });
    const result = resolveTextResponseAndWarn({
      response,
      hasStructuredOutput: true,
      hasTransferToolCall: false,
      logger: log,
      warnContext,
    });
    expect(result).toBe(`prelude\n\n${JSON.stringify({ a: 1 }, null, 2)}`);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('uses last step text when hasTransferToolCall is true (structured output absent)', () => {
    const response = makeResponse({
      text: 'final step text',
      steps: [{ text: 'step 1' }, { text: 'step 2' }] as any,
    });
    const result = resolveTextResponseAndWarn({
      response,
      hasStructuredOutput: true,
      hasTransferToolCall: true,
      logger: log,
      warnContext,
    });
    expect(result).toBe('step 2');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('falls back to response.text + warns when hasStructuredOutput && !output && !transfer', () => {
    const response = makeResponse({ text: 'Let me search...' });
    const result = resolveTextResponseAndWarn({
      response,
      hasStructuredOutput: true,
      hasTransferToolCall: false,
      logger: log,
      warnContext,
    });
    expect(result).toBe('Let me search...');
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      warnContext,
      'Structured output expected but not produced; surfacing fallback text'
    );
  });

  it('walks steps + warns when structured output missing and response.text is empty', () => {
    const response = makeResponse({
      text: '',
      steps: [{ text: 'intermediate reasoning' }, { text: '' }] as any,
    });
    const result = resolveTextResponseAndWarn({
      response,
      hasStructuredOutput: true,
      hasTransferToolCall: false,
      logger: log,
      warnContext,
    });
    expect(result).toBe('intermediate reasoning');
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('emits the WARN exactly once per call (not repeated)', () => {
    const response = makeResponse({ text: 'one' });
    resolveTextResponseAndWarn({
      response,
      hasStructuredOutput: true,
      hasTransferToolCall: false,
      logger: log,
      warnContext,
    });
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn on the non-structured path', () => {
    const response = makeResponse({ text: 'regular text' });
    const result = resolveTextResponseAndWarn({
      response,
      hasStructuredOutput: false,
      hasTransferToolCall: false,
      logger: log,
      warnContext,
    });
    expect(result).toBe('regular text');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('returns empty string on the non-structured path when response.text is empty', () => {
    const response = makeResponse({ text: '' });
    const result = resolveTextResponseAndWarn({
      response,
      hasStructuredOutput: false,
      hasTransferToolCall: false,
      logger: log,
      warnContext,
    });
    expect(result).toBe('');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('does not warn when hasStructuredOutput is true but output is present (success branch)', () => {
    const response = makeResponse({ text: '', output: { ok: true } });
    resolveTextResponseAndWarn({
      response,
      hasStructuredOutput: true,
      hasTransferToolCall: false,
      logger: log,
      warnContext,
    });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('handles empty steps array gracefully when transfer-tool branch fires', () => {
    const response = makeResponse({ text: '', steps: [] as any });
    const result = resolveTextResponseAndWarn({
      response,
      hasStructuredOutput: false,
      hasTransferToolCall: true,
      logger: log,
      warnContext,
    });
    expect(result).toBe('');
    expect(log.warn).not.toHaveBeenCalled();
  });
});
