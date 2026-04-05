import { useState } from 'react';

/**
 * Keeps a local draft derived from a prop until the prop value changes.
 *
 * Example:
 * `const [query, setQuery] = useDerivedProp(searchQuery);`
 */
export function useDerivedProp<TValue>(propValue: TValue): [TValue, (newValue: TValue) => void] {
  const [state, setState] = useState({
    source: propValue,
    value: propValue,
  });

  const value = state.source === propValue ? state.value : propValue;

  function setDerivedValue(newValue: TValue) {
    setState({
      source: propValue,
      value: newValue,
    });
  }

  return [value, setDerivedValue];
}
