import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { APICallError } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../logger', () => createMockLoggerModule().module);

import { isContextOverflowError } from '../detectContextOverflow';

function makeAPICallError({
  statusCode,
  message = 'error',
  data,
}: {
  statusCode?: number;
  message?: string;
  data?: unknown;
}): APICallError {
  return new APICallError({
    message,
    statusCode,
    url: 'https://api.example.com/v1/chat',
    requestBodyValues: {},
    data,
  });
}

describe('isContextOverflowError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true for OpenAI context_length_exceeded code', () => {
    const err = makeAPICallError({
      statusCode: 400,
      message: 'This model maximum context length is 128000 tokens.',
      data: { error: { code: 'context_length_exceeded' } },
    });
    expect(isContextOverflowError(err)).toBe(true);
  });

  it('returns true for Anthropic "prompt is too long" message', () => {
    const err = makeAPICallError({
      statusCode: 400,
      message: 'Your prompt is too long. Please reduce the number of tokens.',
    });
    expect(isContextOverflowError(err)).toBe(true);
  });

  it('returns true for Anthropic "input length and max_tokens exceed context limit" message', () => {
    const err = makeAPICallError({
      statusCode: 400,
      message: 'input length and max_tokens exceed context limit: 200000 + 4096 > 200000',
    });
    expect(isContextOverflowError(err)).toBe(true);
  });

  it('returns false for 413 request_too_large (byte-limit, not overflow)', () => {
    const err = makeAPICallError({
      statusCode: 413,
      message: 'Request too large',
    });
    expect(isContextOverflowError(err)).toBe(false);
  });

  it('returns false for generic 400 without overflow indicators', () => {
    const err = makeAPICallError({
      statusCode: 400,
      message: 'Invalid request: missing required field "model"',
    });
    expect(isContextOverflowError(err)).toBe(false);
  });

  it('returns false for non-API errors (TypeError)', () => {
    expect(isContextOverflowError(new TypeError('Cannot read property'))).toBe(false);
  });

  it('returns false for string errors', () => {
    expect(isContextOverflowError('some error string')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isContextOverflowError(undefined)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isContextOverflowError(null)).toBe(false);
  });

  it('returns false for 500 errors even with overflow-like message', () => {
    const err = makeAPICallError({
      statusCode: 500,
      message: 'prompt is too long',
    });
    expect(isContextOverflowError(err)).toBe(false);
  });

  it('returns false for 400 with overflow-like code in wrong data shape', () => {
    const err = makeAPICallError({
      statusCode: 400,
      message: 'Bad request',
      data: { code: 'context_length_exceeded' },
    });
    expect(isContextOverflowError(err)).toBe(false);
  });

  it('returns false for 400 with non-string code', () => {
    const err = makeAPICallError({
      statusCode: 400,
      message: 'Bad request',
      data: { error: { code: 42 } },
    });
    expect(isContextOverflowError(err)).toBe(false);
  });
});
