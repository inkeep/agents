import { useState } from 'react';

/**
 * Keeps a local draft derived from a prop until either the prop value changes
 * or an optional reset key changes.
 *
 * Example:
 * `const [query, setQuery] = useDerivedProp(searchQuery);`
 *
 * Example with an explicit reset source:
 * `const [providerOptions, setProviderOptions] = useDerivedProp(rawOptions, modelId);`
 */
export function useDerivedProp<TValue, TSource = TValue>(
  propValue: TValue,
  source = propValue as unknown as TSource
): [TValue, (newValue: TValue) => void] {
  const [state, setState] = useState({
    source,
    propValue,
    value: propValue,
  });

  const value = state.source === source && state.propValue === propValue ? state.value : propValue;

  function setDerivedValue(newValue: TValue) {
    setState({
      source,
      propValue,
      value: newValue,
    });
  }

  return [value, setDerivedValue];
}
