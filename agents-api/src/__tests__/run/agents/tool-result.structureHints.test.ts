import * as jmespath from 'jmespath';
import { describe, expect, test } from 'vitest';
import { enhanceToolResultWithStructureHints } from '../../../domains/run/agents/generation/tool-result';

// Structure hints only render when the agent has artifact components (otherwise the result passes
// through untouched). A minimal ctx with one component is enough to exercise the hint generator.
const ctx = { artifactComponents: [{ id: 'c1', name: 'Citation' }] } as any;

function hints(result: unknown) {
  const enhanced = enhanceToolResultWithStructureHints(ctx, result, 'call_1');
  return enhanced._structureHints as {
    ambiguousFields: Record<string, string[]>;
    terminalPaths: string[];
    commonFields: string[];
    recommendedBaseSelectors: string[];
  };
}

describe('enhanceToolResultWithStructureHints — ambiguousFields (Tier 2)', () => {
  test('a field name repeated at multiple depths lists every full path', () => {
    const result = {
      content: 'top-level summary',
      text: { content: 'the real article body' },
    };
    const { ambiguousFields } = hints(result);

    expect(ambiguousFields.content).toBeDefined();
    expect(new Set(ambiguousFields.content)).toEqual(
      new Set(['result.content', 'result.text.content'])
    );
  });

  test('a field name that occurs once is NOT flagged ambiguous', () => {
    const result = { title: 'only here', body: { text: 'unique' } };
    const { ambiguousFields } = hints(result);

    expect(ambiguousFields.title).toBeUndefined();
    expect(ambiguousFields.text).toBeUndefined();
  });

  test('the disambiguating deep path survives truncation past the cap', () => {
    // 40 noise leaf fields would push the deep repeated path out of a naive slice(0, 20/30).
    const noise: Record<string, string> = {};
    for (let i = 0; i < 40; i++) noise[`field_${i}`] = `v${i}`;

    const result = {
      content: 'top-level summary',
      ...noise,
      deeplyNested: { wrapper: { content: 'the real article body' } },
    };
    const { ambiguousFields, terminalPaths } = hints(result);

    // Both ambiguous paths are reported...
    expect(new Set(ambiguousFields.content)).toEqual(
      new Set(['result.content', 'result.deeplyNested.wrapper.content'])
    );
    // ...and the deep one is prioritized into terminalPaths rather than truncated away.
    expect(terminalPaths.some((p) => p.startsWith('result.deeplyNested.wrapper.content'))).toBe(
      true
    );
  });
});

describe('enhanceToolResultWithStructureHints — recommendedBaseSelectors (structuredContent steer)', () => {
  // The shape of an MCP search result: documents live under the nested content[0].text.content
  // envelope AND under a flat structuredContent.content array. The model should be handed the flat
  // path, not be left to assemble the nested one (where it invented `.documents`).
  const mcpResult = {
    content: [
      {
        type: 'text',
        text: {
          content: [{ type: 'document', title: 'Inkeep', record_type: 'site', url: 'https://x' }],
        },
      },
    ],
    structuredContent: {
      content: [{ type: 'document', title: 'Inkeep', record_type: 'site', url: 'https://x' }],
    },
    isError: false,
  };

  test('recommends single-item base selectors rooted at structuredContent first', () => {
    const { recommendedBaseSelectors } = hints(mcpResult);

    expect(recommendedBaseSelectors.length).toBeGreaterThan(0);
    // The cleanest, flat path wins the ranking.
    expect(recommendedBaseSelectors[0]).toContain('structuredContent.content');
    // Every recommendation is a single-item selector (pipe form or plain trailing index).
    for (const s of recommendedBaseSelectors) {
      expect(s.includes('| [0]') || /\[0\]$/.test(s)).toBe(true);
    }
    // It hands over the real key (`content`), never the hallucinated `documents`.
    expect(recommendedBaseSelectors.some((s) => s.includes('documents'))).toBe(false);
  });

  test('a recommended structuredContent selector actually resolves against the result', () => {
    const { recommendedBaseSelectors } = hints(mcpResult);
    const structured = recommendedBaseSelectors.find((s) => s.includes('structuredContent'));
    expect(structured).toBeDefined();

    // `result.` prefix is stripped by the runtime before evaluation.
    const body = (structured as string).replace(/^result\./, '');
    const got = jmespath.search(mcpResult, body);
    expect(got).toMatchObject({ type: 'document' });
    expect(Array.isArray(got)).toBe(false);
  });
});
