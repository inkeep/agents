import { type DependencyList, type EffectCallback, useEffect, useRef } from 'react';

/**
 * Copied from @mantine/hooks
 * @see https://github.com/mantinedev/mantine/blob/master/packages/@mantine/hooks/src/use-did-update/use-did-update.ts
 */
export function useDidUpdate(fn: EffectCallback, dependencies?: DependencyList) {
  const mounted = useRef(false);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  useEffect(() => {
    if (mounted.current) {
      return fn();
    }

    mounted.current = true;
    // biome-ignore lint/correctness/useExhaustiveDependencies: ignore
  }, dependencies);
}
