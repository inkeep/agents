import { beforeEach, describe, expect, it, vi } from 'vitest';

const refs = vi.hoisted(() => ({
  envMock: { INKEEP_PROMPT_CACHING_ENABLED: true as boolean | undefined },
}));

vi.mock('../../../../../env', () => ({
  env: refs.envMock,
}));

import { isPromptCachingEnabled } from '../caching-config';

describe('isPromptCachingEnabled', () => {
  beforeEach(() => {
    refs.envMock.INKEEP_PROMPT_CACHING_ENABLED = true;
  });

  it('returns true when caching is enabled', () => {
    expect(isPromptCachingEnabled()).toBe(true);
  });

  it('returns false only when the kill switch is explicitly false', () => {
    refs.envMock.INKEEP_PROMPT_CACHING_ENABLED = false;
    expect(isPromptCachingEnabled()).toBe(false);
  });

  // The schema applies z.stringbool().optional().default(true), so the value is always a
  // boolean in production. The !== false check (rather than === true) keeps caching on for
  // any non-false value, including a defensive undefined.
  it('returns true when env var is undefined (default-on)', () => {
    refs.envMock.INKEEP_PROMPT_CACHING_ENABLED = undefined;
    expect(isPromptCachingEnabled()).toBe(true);
  });
});
