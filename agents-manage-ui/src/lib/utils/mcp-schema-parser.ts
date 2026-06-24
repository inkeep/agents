/**
 * Utility functions for parsing MCP tool input schemas for display.
 *
 * The manage API normalizes every tool's inputSchema to plain JSON Schema, so parsing is
 * delegated entirely to the shared walker in @inkeep/agents-core ($ref/$defs resolution,
 * nullable unwrapping, enums, nested objects/arrays, multi-branch union variants) — keeping
 * the UI in lockstep with the runtime prompt renderer.
 */

import {
  type NormalizedSchemaNode,
  normalizeJsonSchemaProperties,
  unwrapJsonSchemaWrapper,
} from '@inkeep/agents-core/utils/json-schema-walk';

interface ParsedSchema {
  properties: NormalizedSchemaNode[];
  hasProperties: boolean;
}

function sortNodes(nodes: NormalizedSchemaNode[]): NormalizedSchemaNode[] {
  return [...nodes].sort((a, b) => {
    if (a.required !== b.required) {
      return a.required ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Parse an MCP tool input schema into normalized nodes for display via the shared walker.
 * Defensively unwraps an AI SDK `jsonSchema()` wrapper in case one reaches the UI unconverted.
 */
export function parseMCPInputSchema(inputSchema: any): ParsedSchema {
  if (!inputSchema || typeof inputSchema !== 'object') {
    return { properties: [], hasProperties: false };
  }

  const schema = unwrapJsonSchemaWrapper(inputSchema);

  const properties = sortNodes(normalizeJsonSchemaProperties(schema));
  return { properties, hasProperties: properties.length > 0 };
}

/**
 * Get a user-friendly type badge color based on the type
 */
export function getTypeBadgeVariant(
  type: string
): 'primary' | 'code' | 'orange' | 'sky' | 'violet' {
  if (type.includes('string')) return 'primary';
  if (type.includes('number')) return 'violet';
  if (type.includes('boolean')) return 'orange';
  if (type.includes('array')) return 'sky';
  if (type.includes('object')) return 'sky';
  return 'code';
}
