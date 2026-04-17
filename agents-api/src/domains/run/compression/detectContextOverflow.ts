import { trace } from '@opentelemetry/api';
import { APICallError } from 'ai';
import { getLogger } from '../../../logger';

const logger = getLogger('detectContextOverflow');

const ANTHROPIC_OVERFLOW_PATTERNS = [
  /prompt is too long/i,
  /input length and max_tokens exceed context limit/i,
];

function extractOpenAICode(err: APICallError): string | undefined {
  const data = err.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return undefined;
  const error = data.error as Record<string, unknown> | undefined;
  if (!error || typeof error !== 'object') return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

export function isContextOverflowError(err: unknown): boolean {
  if (!APICallError.isInstance(err)) return false;
  if (err.statusCode === 413) return false;
  if (err.statusCode !== 400) return false;

  const oaiCode = extractOpenAICode(err);
  if (oaiCode === 'context_length_exceeded') return true;

  const msg = err.message;
  for (const pattern of ANTHROPIC_OVERFLOW_PATTERNS) {
    if (pattern.test(msg)) {
      logger.info(
        { pattern: pattern.source, message: msg },
        'Anthropic overflow regex matched — monitor for wording drift'
      );
      const span = trace.getActiveSpan();
      span?.setAttribute('anthropic_overflow_regex_hit', true);
      return true;
    }
  }

  return false;
}
