/**
 * Color generation utilities using iwanthue library.
 */

import iwanthue from 'iwanthue';

export interface ColorOptions {
  /** Seed for deterministic color generation */
  seed?: string;
  /** Quality of clustering (higher = better but slower). Default: 50 */
  quality?: number;
}

const DEFAULT_OPTIONS: ColorOptions = {
  seed: 'inkeep-context-breakdown',
  quality: 50,
};

/**
 * Generates N visually distinct colors using iwanthue.
 *
 * @param count - Number of colors to generate
 * @param options - Optional generation settings
 * @returns Array of hex color strings
 *
 * @example
 * ```ts
 * const colors = generateDistinctColors(5);
 * // ['#4a8fd9', '#d94a7a', '#5ad94a', '#d9a14a', '#9a4ad9']
 * ```
 */
export function generateDistinctColors(count: number, options?: ColorOptions): string[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return iwanthue(count, {
    seed: opts.seed,
    quality: opts.quality,
  });
}

/**
 * Creates a color map from an array of keys.
 *
 * @param keys - Array of unique string keys
 * @param options - Optional generation settings
 * @returns Map of key to hex color
 */
export function createColorMap(
  keys: string[],
  options?: ColorOptions
): Record<string, string> {
  const colors = generateDistinctColors(keys.length, options);
  const colorMap: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    colorMap[keys[i]] = colors[i];
  }
  return colorMap;
}
