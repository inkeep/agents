import { type ClassValue, clsx } from 'clsx';
import type { FieldPath } from 'react-hook-form';
import { twMerge } from 'tailwind-merge';
import { z } from 'zod';

export const css = String.raw;

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
  } catch {
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

export function formatJsonField(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  const stringifiedValue = JSON.stringify(value);
  if (stringifiedValue.trim()) {
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

  return components.reduce<Record<string, T>>((map, component) => {
    map[component.id] = component;
    return map;
  }, {});
}

/**
 * Determines whether a form field should be marked as required based on the Zod schema (i.e. absence of `z.optional()`).
 *
 * Supports nested fields via dot-notation paths and provides autocomplete for schema keys.
 */
export function isRequired<T extends z.ZodObject>(schema: T, key: FieldPath<z.infer<T>>) {
  const [firstKey, ...rest] = key.split('.');

  const nestedSchema = schema instanceof z.ZodObject ? schema.shape[firstKey] : schema;

  if (rest.length) {
    return isRequired(nestedSchema, rest.join('.'));
  }
  const result = nestedSchema.safeParse();
  return !result.success;
}

/**
 * Serializes object or array values for form editors that operate on string input.
 *
 * Used in server components to safely stringify JSON values for text-based editors.
 */
export function serializeJson(value?: null | Record<string, unknown> | unknown[]): string {
  return value ? JSON.stringify(value, null, 2) : '';
}
