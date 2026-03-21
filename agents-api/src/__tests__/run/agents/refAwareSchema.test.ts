import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildRefAwareInputSchema } from '../../../domains/run/agents/tools/mcp-tools';
import { makeRefAwareJsonSchema } from '../../../domains/run/agents/tools/ref-aware-schema';

// Shared assertions for any ref-aware schema (Zod).
function assertRefAwareSchema(schema: z.ZodType) {
  // Accepts $tool-only ref
  expect(schema.safeParse({ image: { $tool: 'toolu_123' } }).success).toBe(true);
  // Accepts $artifact + $tool ref
  expect(schema.safeParse({ image: { $artifact: 'art-1', $tool: 'toolu_123' } }).success).toBe(
    true
  );
  // Accepts $tool + $path ref
  expect(schema.safeParse({ image: { $tool: 'toolu_123', $path: 'content[0]' } }).success).toBe(
    true
  );
  // Accepts the original concrete structure
  expect(schema.safeParse({ image: { data: 'abc', mimeType: 'image/png' } }).success).toBe(true);
  // Rejects unrecognised object (no $tool, no required concrete fields)
  expect(schema.safeParse({ image: { unrelated: 'field' } }).success).toBe(false);
  // Rejects missing required top-level arg
  expect(schema.safeParse({}).success).toBe(false);
}

describe('makeRefAwareJsonSchema (function-tool path)', () => {
  it('produces a Zod schema that accepts sentinel refs and the original structure', () => {
    const rawJson = {
      type: 'object',
      properties: {
        image: {
          type: 'object',
          properties: {
            data: { type: 'string' },
            mimeType: { type: 'string' },
          },
          required: ['data', 'mimeType'],
        },
      },
      required: ['image'],
    } as Record<string, unknown>;

    const schema = z.fromJSONSchema(makeRefAwareJsonSchema(rawJson));
    assertRefAwareSchema(schema);
  });
});

describe('buildRefAwareInputSchema (MCP-tool path)', () => {
  it('produces a ref-aware inputSchema and a baseInputSchema from a Zod schema', () => {
    const zodInput = z.object({
      image: z.object({
        data: z.string(),
        mimeType: z.string(),
      }),
    });

    const { refAwareInputSchema, baseInputSchema } = buildRefAwareInputSchema(zodInput);

    assertRefAwareSchema(refAwareInputSchema);

    // baseInputSchema should enforce the concrete structure (rejects refs)
    expect(baseInputSchema).toBeDefined();
    expect(
      baseInputSchema!.safeParse({ image: { data: 'abc', mimeType: 'image/png' } }).success
    ).toBe(true);
    expect(baseInputSchema!.safeParse({ image: { $tool: 'toolu_123' } }).success).toBe(false);
  });

  it('falls back gracefully when the input is not a valid Zod schema', () => {
    const { refAwareInputSchema, baseInputSchema } = buildRefAwareInputSchema({} as any);
    expect(refAwareInputSchema).toBeDefined();
    expect(baseInputSchema).toBeUndefined();
  });
});
