import { useState } from 'react';

interface UseDerivedPropOptions<TSource> {
  resetSource?: TSource;
}

/**
 * Keeps a local draft derived from a prop until either the prop value changes
 * or an optional reset source changes.
 *
 * Example:
 * `const [query, setQuery] = useDerivedProp(searchQuery);`
 *
 * Example with an explicit reset source:
 * `const [providerOptions, setProviderOptions] = useDerivedProp(rawOptions, { resetSource: modelId });`
 */
export function useDerivedProp<TValue, TSource = TValue>(
  propValue: TValue,
  options?: UseDerivedPropOptions<TSource>
): [TValue, (newValue: TValue) => void] {
  const resetSource = options?.resetSource ?? (propValue as unknown as TSource);

  const [state, setState] = useState({
    source: resetSource,
    propValue,
    value: propValue,
  });

  const value =
    state.source === resetSource && state.propValue === propValue ? state.value : propValue;

  function setDerivedValue(newValue: TValue) {
    setState({
      source: resetSource,
      propValue,
      value: newValue,
    });
  }

  return [value, setDerivedValue];
}
