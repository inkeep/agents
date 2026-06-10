import type { ArtifactComponentApiInsert } from '@inkeep/agents-core';
import * as jmespath from 'jmespath';
import { describe, expect, test } from 'vitest';
import { SystemPromptBuilder } from '../../../domains/run/agents/SystemPromptBuilder';
import type { SystemPromptV1 } from '../../../domains/run/agents/types';
import { PromptConfig } from '../../../domains/run/agents/versions/v1/PromptConfig';

// P0 — base-selector syntax guardrail.
//
// A JMESPath filter `[?field=='x']` creates a PROJECTION. A bare index `[0]` applied directly to a
// projection is projected over each match (it does NOT index the filtered list), so `foo[?bar][0]`
// returns [] — it matches nothing. Selecting one item requires a pipe to stop the projection:
// `foo[?bar] | [0]`. The artifact prompting previously taught the broken bare-index form in ~11
// "✅ CORRECT" examples while the runtime structure-hint generator emits the correct pipe form,
// so the model that copied the rules built selectors that silently resolved to nothing. This test
// renders the real prompt and asserts every taught selector is the working form.

const artifactComponents: ArtifactComponentApiInsert[] = [
  {
    id: 'comp-1',
    name: 'Citation',
    description: 'A citation',
    props: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title', inPreview: true },
        url: { type: 'string', description: 'URL', inPreview: false },
      },
    },
  },
];

function baseConfig(overrides: Partial<SystemPromptV1>): SystemPromptV1 {
  return {
    corePrompt: 'You are a helpful assistant.',
    appPrompt: 'Be concise.',
    tools: [],
    dataComponents: [],
    artifacts: [],
    artifactComponents,
    hasAgentArtifactComponents: true,
    ...overrides,
  };
}

function render(overrides: Partial<SystemPromptV1> = {}): string {
  const builder = new SystemPromptBuilder('v1', new PromptConfig());
  return builder.buildSystemPrompt(baseConfig(overrides)).prompt;
}

// The exact JMESPath gotcha the fix is about, proven against the engine the runtime uses
// (select-filter.ts: `import * as jmespath from 'jmespath'`).
describe('JMESPath projection invariant', () => {
  const data = {
    documents: [
      { type: 'api', title: 'A' },
      { type: 'doc', title: 'B' },
    ],
  };

  test('bare index after a filter matches nothing', () => {
    expect(jmespath.search(data, "documents[?type=='api'][0]")).toEqual([]);
  });

  test('pipe after a filter selects one item', () => {
    expect(jmespath.search(data, "documents[?type=='api'] | [0]")).toEqual({
      type: 'api',
      title: 'A',
    });
  });
});

describe('PromptConfig — artifact base-selector syntax (P0)', () => {
  // Matches a filter immediately followed by a bare index: `[?...][0]`. This is the broken form.
  const BROKEN_BARE_INDEX = /\[\?[^\]]*\]\[0\]/g;
  // Matches a full base selector that filters then terminates with the pipe form: `...[?...] | [0]`.
  const CANONICAL_SELECTOR = /result\.[\w.]*\[\?[^\]]*\]\s*\|\s*\[0\]/g;

  for (const mode of ['text', 'structured'] as const) {
    const prompt = render(
      mode === 'structured' ? { hasStructuredOutput: true, includeDataComponents: true } : {}
    );

    test(`no broken bare-index selectors are taught (${mode} mode)`, () => {
      const broken = prompt.match(BROKEN_BARE_INDEX) ?? [];
      expect(broken).toEqual([]);
    });

    test(`every taught base selector resolves to a single item (${mode} mode)`, () => {
      const selectors = prompt.match(CANONICAL_SELECTOR) ?? [];
      // Sanity: the rules actually contain worked selector examples to validate.
      expect(selectors.length).toBeGreaterThan(0);

      for (const selector of selectors) {
        // Build a payload where the filtered array holds exactly one matching item, so a correct
        // single-item selector returns that object and the broken projection form returns [].
        const match = selector.match(/result\.([\w.]+)\[\?(\w+)\s*==\s*'([^']*)'\]/);
        expect(match, `could not parse selector: ${selector}`).toBeTruthy();
        const [, path, field, value] = match as RegExpMatchArray;

        // Nest the matching item under the dotted path (e.g. "items" or "structuredContent.content").
        const item: Record<string, unknown> = { [field]: value, _marker: 'hit' };
        const data: Record<string, unknown> = {};
        const segments = path.split('.');
        let cursor = data;
        segments.forEach((seg, i) => {
          if (i === segments.length - 1) {
            cursor[seg] = [item, { [field]: 'other' }];
          } else {
            cursor[seg] = {};
            cursor = cursor[seg] as Record<string, unknown>;
          }
        });

        // `result.` prefix is stripped by the runtime before evaluation, so evaluate the body.
        const body = selector.replace(/^result\./, '');
        const result = jmespath.search(data, body);
        expect(result, `selector did not resolve to one item: ${selector}`).toMatchObject({
          [field]: value,
        });
        expect(Array.isArray(result), `selector returned an array: ${selector}`).toBe(false);
      }
    });

    test(`example free-text filter values are placeholders, not copy-bait (${mode} mode)`, () => {
      // Realistic-looking literal values for free-text identifier fields get pasted verbatim by the
      // model (observed: it copied `title=='Inkeep' && record_type=='site'` from the prompt, which
      // matched no real document → empty artifact). Every title/name example value must be an
      // obvious <PLACEHOLDER>, forcing substitution from _structureHints / the data.
      const titleNameValues = [...prompt.matchAll(/(?:title|name)\s*==\s*'([^']*)'/g)].map(
        (m) => m[1]
      );
      const copyBait = titleNameValues.filter(
        (v) => !v.startsWith('<') && v !== 'exact match' // 'exact match' is an operator illustration
      );
      expect(copyBait, `non-placeholder title/name example values: ${copyBait.join(', ')}`).toEqual(
        []
      );

      // Regression guard for the specific incident.
      expect(prompt).not.toContain("title=='Inkeep'");
      expect(prompt).not.toContain("record_type=='site'");
    });
  }
});
