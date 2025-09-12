import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
