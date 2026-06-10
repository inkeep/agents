import { describe, expect, test } from 'vitest';
import { sortFunctionToolsForStableOrder } from '../../../../domains/run/agents/tools/function-tools';

// R2: tools sit at wire position 0 of the prompt cache; any reorder invalidates the entire cache
// on every provider. Function-tool DB order is not guaranteed, so it is sorted to a stable order.
// (MCP order = config order + server response; relation/default = fixed insertion order — those are
// deterministic by construction; this guards the one non-deterministic source.)
describe('sortFunctionToolsForStableOrder (R2)', () => {
  test('sorts by name', () => {
    const out = sortFunctionToolsForStableOrder([
      { name: 'charlie', id: '1' },
      { name: 'alpha', id: '2' },
      { name: 'bravo', id: '3' },
    ]);
    expect(out.map((t) => t.name)).toEqual(['alpha', 'bravo', 'charlie']);
  });

  test('is stable regardless of input order', () => {
    const a = sortFunctionToolsForStableOrder([
      { name: 'b', id: '2' },
      { name: 'a', id: '1' },
    ]);
    const b = sortFunctionToolsForStableOrder([
      { name: 'a', id: '1' },
      { name: 'b', id: '2' },
    ]);
    expect(a).toEqual(b);
  });

  test('breaks ties by id', () => {
    const out = sortFunctionToolsForStableOrder([
      { name: 'dup', id: 'z' },
      { name: 'dup', id: 'a' },
    ]);
    expect(out.map((t) => t.id)).toEqual(['a', 'z']);
  });

  test('does not mutate the input', () => {
    const input = [
      { name: 'b', id: '2' },
      { name: 'a', id: '1' },
    ];
    sortFunctionToolsForStableOrder(input);
    expect(input.map((t) => t.name)).toEqual(['b', 'a']);
  });

  test('tolerates missing name/id', () => {
    const out = sortFunctionToolsForStableOrder([{ id: '2' }, { name: 'a', id: '1' }, {}]);
    expect(out).toHaveLength(3);
  });
});
