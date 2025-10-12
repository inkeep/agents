import { randomBytes } from 'node:crypto';
import { jsonSchemaToZod } from 'json-schema-to-zod';

/**
 * Placeholder replacement system for reducing LLM prompt size
 *
 * Replaces large string values in JSON data with short placeholders,
 * then restores them after LLM generation.
 */

export interface PlaceholderResult {
  processedData: any;
  replacements: Record<string, string>;
}

interface PlaceholderTracker {
  placeholderToValue: Map<string, string>;
  valueToPlaceholder: Map<string, string>;
}

/**
 * Minimum string length threshold for placeholder replacement
 * Only replace strings that are longer than this to save tokens
 */
const MIN_REPLACEMENT_LENGTH = 50;

/**
 * Generate a short unique ID using crypto
 */
function generateShortId(length: number = 8): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * Generate a unique placeholder for a given JSON path
 */
function generatePlaceholder(jsonPath: string): string {
  const shortId = generateShortId(8); // Short ID for compactness
  return `<{{${jsonPath}.${shortId}}}>`;
}

/**
 * Check if a string value should be replaced with a placeholder
 */
function shouldReplaceString(value: string, placeholder: string): boolean {
  // Only replace if the original value is long enough and the placeholder is shorter
  return value.length >= MIN_REPLACEMENT_LENGTH && placeholder.length < value.length;
}

function containsTemplateLiterals(value: string): boolean {
  return /\{\{([^}]+)\}\}/.test(value);
}

function generateMultiPlaceholderString(
  value: string,
  jsonPath: string,
  tracker: PlaceholderTracker
): string {
  const templateLiterals = value.match(/\{\{([^}]+)\}\}/g);
  if (!templateLiterals) {
    return value;
  }

  // Split the string by template literals
  // This gives us the surrounding text parts
  const parts = value.split(/\{\{[^}]+\}\}/);

  // Build the placeholder version and track temporary mappings
  let result = '';
  let partIndex = 0;
  const tempMappings: Array<{ placeholder: string; value: string }> = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Only replace non-empty parts
    if (part.length > 0) {
      // Check if we already have a placeholder for this text
      const existingPlaceholder = tracker.valueToPlaceholder.get(part);
      if (existingPlaceholder) {
        result += existingPlaceholder;
      } else {
        // Generate a new placeholder for this text part
        const placeholder = generatePlaceholder(`${jsonPath}.part${partIndex}`);
        tempMappings.push({ placeholder, value: part });
        result += placeholder;
      }
      partIndex++;
    }

    // Add the template literal back (except after the last part)
    if (i < templateLiterals.length) {
      result += templateLiterals[i];
    }
  }

  // Only use the placeholder version if it saves space overall
  if (result.length < value.length) {
    // Commit the temporary mappings to the tracker
    for (const mapping of tempMappings) {
      updateTracker(tracker, mapping.placeholder, mapping.value);
    }
    return result;
  }

  // Return original string if placeholders don't save space
  return value;
}

function isJsonSchemaPath(path: string): boolean {
  if (path.endsWith('contextConfig.headersSchema') || path.endsWith('responseSchema')) {
    return true;
  }
  
  // Convert artifact component and data component props from JSON Schema to Zod
  if (path.includes('artifactComponents') && path.endsWith('props')) {
    return true;
  }
  if (path.includes('dataComponents') && path.endsWith('props')) {
    return true;
  }
  
  return false;
}

function updateTracker(tracker: PlaceholderTracker, placeholder: string, value: any) {
  tracker.placeholderToValue.set(placeholder, value);
  tracker.valueToPlaceholder.set(value, placeholder);
}

/**
 * Recursively process an object to create placeholders for large string values
 */
function processObject(obj: any, tracker: PlaceholderTracker, path: string = ''): any {
  if (typeof obj === 'string') {
    if (containsTemplateLiterals(obj)) {
      return generateMultiPlaceholderString(obj, path, tracker);
    } else {
      // Check if we already have a placeholder for this exact value
      const existingPlaceholder = tracker.valueToPlaceholder.get(obj);
      if (existingPlaceholder) {
        return existingPlaceholder;
      }

      // Generate a new placeholder
      const placeholder = generatePlaceholder(path);

      // Only use the placeholder if it saves space
      if (shouldReplaceString(obj, placeholder)) {
        // Check for collision (same placeholder, different value)
        const existingValue = tracker.placeholderToValue.get(placeholder);
        if (existingValue && existingValue !== obj) {
          throw new Error(
            `Placeholder collision detected: placeholder '${placeholder}' already exists with different value. ` +
              `Existing value length: ${existingValue.length}, New value length: ${obj.length}`
          );
        }

        // Store the mapping both ways for efficient lookup
        updateTracker(tracker, placeholder, obj);

        return placeholder;
      }
    }

    // Return original string if not worth replacing
    return obj;
  }

  if (isJsonSchemaPath(path)) {
    try {
      const zodSchema = jsonSchemaToZod(obj);

      return zodSchema;
    } catch (error) {
      console.error('Error converting JSON schema to Zod schema:', error);
    }
  }

  if (Array.isArray(obj)) {
    return obj.map((item, index) => processObject(item, tracker, `${path}[${index}]`));
  }

  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      result[key] = processObject(value, tracker, currentPath);
    }
    return result;
  }

  // Primitive values (number, boolean, null, undefined)
  return obj;
}

/**
 * Create placeholders for large string values in the given data
 *
 * @param data - The data object to process
 * @returns Object containing processed data and replacements map
 */
export function createPlaceholders(data: any): PlaceholderResult {
  const tracker: PlaceholderTracker = {
    placeholderToValue: new Map(),
    valueToPlaceholder: new Map(),
  };

  try {
    const processedData = processObject(data, tracker);

    // Convert the tracker maps to a simple Record for the result
    const replacements: Record<string, string> = {};
    for (const [placeholder, value] of tracker.placeholderToValue.entries()) {
      replacements[placeholder] = value;
    }

    return {
      processedData,
      replacements,
    };
  } catch (error) {
    // If placeholder creation fails, return original data to prevent blocking the generation
    console.warn('Placeholder creation failed, using original data:', error);
    return {
      processedData: data,
      replacements: {},
    };
  }
}

/**
 * Restore placeholders in generated code with their original values
 *
 * @param generatedCode - The code generated by the LLM containing placeholders
 * @param replacements - Map of placeholder to original value
 * @returns Code with placeholders replaced by original values
 */
export function restorePlaceholders(
  generatedCode: string,
  replacements: Record<string, string>
): string {
  let restoredCode = generatedCode;

  // Sort by placeholder length (longest first) to avoid partial replacements
  const sortedPlaceholders = Object.keys(replacements).sort((a, b) => b.length - a.length);

  for (const placeholder of sortedPlaceholders) {
    let originalValue = replacements[placeholder];

    // Escape backticks in the original value when restoring into template literals
    // This prevents syntax errors when the restored content contains backticks
    originalValue = originalValue.replace(/`/g, '\\`');

    // Use regex to find and replace all instances of the placeholder
    // Escape special regex characters in the placeholder
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedPlaceholder, 'g');

    restoredCode = restoredCode.replace(regex, originalValue);
  }

  return restoredCode;
}

/**
 * Calculate token savings from using placeholders
 *
 * @param originalData - Original data object
 * @param processedData - Data with placeholders
 * @returns Estimated token savings information
 */
export function calculateTokenSavings(
  originalData: any,
  processedData: any
): {
  originalSize: number;
  processedSize: number;
  savings: number;
  savingsPercentage: number;
} {
  const originalSize = JSON.stringify(originalData).length;
  const processedSize = JSON.stringify(processedData).length;
  const savings = originalSize - processedSize;
  const savingsPercentage = originalSize > 0 ? (savings / originalSize) * 100 : 0;

  return {
    originalSize,
    processedSize,
    savings,
    savingsPercentage,
  };
}
