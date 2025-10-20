import type { FullProjectDefinition } from '@inkeep/agents-core';

/**
 * Represents a difference found between two objects
 */
export interface JsonDifference {
  path: string;
  type: 'missing' | 'extra' | 'mismatch' | 'type_mismatch';
  expected?: any;
  actual?: any;
  message: string;
}

/**
 * Compare two project definitions and return detailed differences
 * @param original - The original project definition from the API
 * @param regenerated - The regenerated project definition from TypeScript
 * @returns Array of differences found
 */
export function compareProjectDefinitions(
  original: FullProjectDefinition,
  regenerated: FullProjectDefinition
): JsonDifference[] {
  const differences: JsonDifference[] = [];

  // Compare at the root level
  compareObjects(original, regenerated, '', differences);

  return differences;
}

/**
 * Recursively compare two objects and collect differences
 */
function compareObjects(
  expected: any,
  actual: any,
  path: string,
  differences: JsonDifference[]
): void {
  // Handle null/undefined cases
  if (expected === null || expected === undefined) {
    if (actual !== null && actual !== undefined) {
      differences.push({
        path,
        type: 'mismatch',
        expected,
        actual,
        message: `Expected ${expected} but got ${actual}`,
      });
    }
    return;
  }

  if (actual === null || actual === undefined) {
    differences.push({
      path,
      type: 'missing',
      expected,
      actual,
      message: `Missing value at path ${path}`,
    });
    return;
  }

  // Handle type mismatches
  const expectedType = getType(expected);
  const actualType = getType(actual);

  if (expectedType !== actualType) {
    differences.push({
      path,
      type: 'type_mismatch',
      expected: expectedType,
      actual: actualType,
      message: `Type mismatch at ${path}: expected ${expectedType} but got ${actualType}`,
    });
    return;
  }

  // Handle arrays
  if (Array.isArray(expected)) {
    compareArrays(expected, actual, path, differences);
    return;
  }

  // Handle objects
  if (expectedType === 'object') {
    // Check for missing keys in actual
    for (const key of Object.keys(expected)) {
      const newPath = path ? `${path}.${key}` : key;

      // Skip certain fields that are expected to be different
      if (shouldSkipField(key)) {
        continue;
      }

      if (!(key in actual)) {
        differences.push({
          path: newPath,
          type: 'missing',
          expected: expected[key],
          message: `Missing key "${key}" at path ${path || 'root'}`,
        });
      } else {
        compareObjects(expected[key], actual[key], newPath, differences);
      }
    }

    // Check for extra keys in actual
    for (const key of Object.keys(actual)) {
      if (shouldSkipField(key)) {
        continue;
      }

      if (!(key in expected)) {
        const newPath = path ? `${path}.${key}` : key;
        differences.push({
          path: newPath,
          type: 'extra',
          actual: actual[key],
          message: `Extra key "${key}" at path ${path || 'root'}`,
        });
      }
    }

    return;
  }

  // Handle primitives
  if (expected !== actual) {
    differences.push({
      path,
      type: 'mismatch',
      expected,
      actual,
      message: `Value mismatch at ${path}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
    });
  }
}

/**
 * Compare two arrays and collect differences
 */
function compareArrays(
  expected: any[],
  actual: any[],
  path: string,
  differences: JsonDifference[]
): void {
  // Check length
  if (expected.length !== actual.length) {
    differences.push({
      path,
      type: 'mismatch',
      expected: `array of length ${expected.length}`,
      actual: `array of length ${actual.length}`,
      message: `Array length mismatch at ${path}: expected ${expected.length} items but got ${actual.length}`,
    });
  }

  // Compare elements
  const minLength = Math.min(expected.length, actual.length);
  for (let i = 0; i < minLength; i++) {
    compareObjects(expected[i], actual[i], `${path}[${i}]`, differences);
  }

  // Report missing elements if actual is shorter
  if (actual.length < expected.length) {
    for (let i = actual.length; i < expected.length; i++) {
      differences.push({
        path: `${path}[${i}]`,
        type: 'missing',
        expected: expected[i],
        message: `Missing array element at ${path}[${i}]`,
      });
    }
  }

  // Report extra elements if actual is longer
  if (actual.length > expected.length) {
    for (let i = expected.length; i < actual.length; i++) {
      differences.push({
        path: `${path}[${i}]`,
        type: 'extra',
        actual: actual[i],
        message: `Extra array element at ${path}[${i}]`,
      });
    }
  }
}

/**
 * Get the type of a value for comparison
 */
function getType(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Check if a field should be skipped during comparison
 * These fields are expected to differ between original and regenerated
 */
function shouldSkipField(key: string): boolean {
  // Skip timestamp fields as they will naturally differ
  if (key === 'createdAt' || key === 'updatedAt') {
    return true;
  }

  // Skip internal metadata fields
  if (key.startsWith('_')) {
    return true;
  }

  return false;
}

/**
 * Format differences into a human-readable report
 */
export function formatDifferencesReport(differences: JsonDifference[]): string {
  if (differences.length === 0) {
    return '✅ No differences found - validation passed!';
  }

  const lines: string[] = [
    `❌ Found ${differences.length} difference(s):`,
    '',
  ];

  // Group by type
  const byType = {
    missing: differences.filter((d) => d.type === 'missing'),
    extra: differences.filter((d) => d.type === 'extra'),
    mismatch: differences.filter((d) => d.type === 'mismatch'),
    type_mismatch: differences.filter((d) => d.type === 'type_mismatch'),
  };

  if (byType.missing.length > 0) {
    lines.push('Missing fields:');
    for (const diff of byType.missing) {
      lines.push(`  - ${diff.path}`);
      lines.push(`    Expected: ${formatValue(diff.expected)}`);
    }
    lines.push('');
  }

  if (byType.extra.length > 0) {
    lines.push('Extra fields:');
    for (const diff of byType.extra) {
      lines.push(`  - ${diff.path}`);
      lines.push(`    Got: ${formatValue(diff.actual)}`);
    }
    lines.push('');
  }

  if (byType.type_mismatch.length > 0) {
    lines.push('Type mismatches:');
    for (const diff of byType.type_mismatch) {
      lines.push(`  - ${diff.path}`);
      lines.push(`    Expected type: ${diff.expected}, Got type: ${diff.actual}`);
    }
    lines.push('');
  }

  if (byType.mismatch.length > 0) {
    lines.push('Value mismatches:');
    for (const diff of byType.mismatch) {
      lines.push(`  - ${diff.path}`);
      lines.push(`    Expected: ${formatValue(diff.expected)}`);
      lines.push(`    Got: ${formatValue(diff.actual)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a value for display in the report
 */
function formatValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    return str.length > 100 ? `${str.substring(0, 100)}...` : str;
  }
  return String(value);
}
