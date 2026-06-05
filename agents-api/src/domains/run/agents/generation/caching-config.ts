import { env } from '../../../../env';

export function isPromptCachingEnabled(): boolean {
  // INKEEP_PROMPT_CACHING_ENABLED is parsed to a boolean at the env schema boundary
  // (z.stringbool, default true), so this is a plain boolean check.
  return env.INKEEP_PROMPT_CACHING_ENABLED !== false;
}
