import { Output } from 'ai';
import { describe, expect, it } from 'vitest';
import { ConversationHistorySummarySchema } from '../distill-conversation-history-tool';
import { ConversationSummarySchema } from '../distill-conversation-tool';

/**
 * OpenAI strict-mode response_format requires every key in `properties` to also
 * appear in `required`. Zod `.optional()` fields are excluded from `required`,
 * which causes OpenAI to reject the schema at runtime with:
 *   "Invalid schema for response_format: 'required' must include every key in properties. Missing '<field>'."
 *
 * These tests catch that regression by resolving the responseFormat promise that
 * Output.object() produces (the same path the AI SDK takes before sending to OpenAI)
 * and asserting no properties are missing from `required`.
 */

function collectMissingRequired(schema: any, path = ''): string[] {
  const missing: string[] = [];
  if (schema?.properties) {
    const keys = Object.keys(schema.properties);
    const required: string[] = schema.required ?? [];
    for (const key of keys) {
      const fullPath = path ? `${path}.${key}` : key;
      if (!required.includes(key)) {
        missing.push(fullPath);
      }
      missing.push(...collectMissingRequired(schema.properties[key], fullPath));
    }
  }
  if (schema?.items) {
    missing.push(...collectMissingRequired(schema.items, path ? `${path}[]` : '[]'));
  }
  return missing;
}

describe('distill schema OpenAI strict-mode compatibility', () => {
  it('ConversationSummarySchema: every property is in required (including nested)', async () => {
    const responseFormat = await Output.object({ schema: ConversationSummarySchema })
      .responseFormat;
    expect(responseFormat?.type).toBe('json');
    if (responseFormat?.type !== 'json') return;
    const missing = collectMissingRequired(responseFormat.schema);
    expect(missing).toEqual([]);
  });

  it('ConversationHistorySummarySchema: every property is in required (including nested)', async () => {
    const responseFormat = await Output.object({
      schema: ConversationHistorySummarySchema,
    }).responseFormat;
    expect(responseFormat?.type).toBe('json');
    if (responseFormat?.type !== 'json') return;
    const missing = collectMissingRequired(responseFormat.schema);
    expect(missing).toEqual([]);
  });
});
