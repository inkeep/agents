import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { z } from 'zod';

export function isMacOs() {
  return navigator?.userAgent.includes('Mac');
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatJson(jsonString: string) {
  try {
    const parsed = JSON.parse(jsonString);
    return JSON.stringify(parsed, null, 2);
  } catch (_error) {
    return jsonString;
  }
}

/**
 * Creates a standardized handler for provider options changes that parses JSON strings to objects
 * @param updateFn Function to call with the parsed provider options
 * @returns A handler function that can be used as onProviderOptionsChange
 */
export function createProviderOptionsHandler(updateFn: (options: any) => void) {
  return (value: string | undefined) => {
    console.log('createProviderOptionsHandler received:', value);
    if (!value?.trim()) {
      console.log('Calling updateFn with undefined');
      updateFn(undefined);
      return;
    }
    try {
      const parsed = JSON.parse(value);
      console.log('Parsed JSON:', parsed);
      console.log('Calling updateFn with parsed options');
      updateFn(parsed);
    } catch (error) {
      console.error('Failed to parse provider options JSON:', error);
    }
  };
}

export function formatJsonField(value: any): string {
  if (value === undefined || value === null) {
    return '';
  }

  const stringifiedValue = JSON.stringify(value);
  if (stringifiedValue?.trim()) {
    return formatJson(stringifiedValue);
  }

  return '';
}

/**
 * Transform an array of components into a lookup map by ID
 * Works with any component type that has an 'id' property
 */
export function createLookup<T extends { id: string }>(
  components: T[] | undefined
): Record<string, T> {
  if (!components) return {};

  return components.reduce(
    (map, component) => {
      map[component.id] = component;
      return map;
    },
    {} as Record<string, T>
  );
}

export function isRequired(schema: z.ZodObject, key: string) {
  return !schema.shape[key].isOptional();
}
