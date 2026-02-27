/**
 * Extended JSON Schema that includes preview field indicators
 */
export interface ExtendedJsonSchema {
  type: string;
  properties?: Record<string, ExtendedJsonSchemaProperty>;
  required?: string[];
  [key: string]: any;
}

export interface ExtendedJsonSchemaProperty {
  type: string;
  description?: string;
  inPreview?: boolean; // New field to indicate if this should be shown in preview
  [key: string]: any;
}

/**
 * Extract preview fields from a schema (fields marked with inPreview: true)
 */
export function extractPreviewFields(schema: ExtendedJsonSchema): Record<string, any> {
  const previewProperties: Record<string, any> = {};

  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (prop.inPreview === true) {
        // Remove the inPreview flag for the extracted schema
        const cleanProp = { ...prop };
        delete cleanProp.inPreview;
        previewProperties[key] = cleanProp;
      }
    }
  }

  return {
    type: 'object',
    properties: previewProperties,
    required: schema.required?.filter((field) => previewProperties[field]),
  };
}

/**
 * Convert a JSON Schema properties map into a compact readable shape.
 * Arrays become [{...}], objects recurse, primitives become their type string.
 * Useful for displaying artifact schemas in prompts.
 */
export function buildSchemaShape(properties: Record<string, any>): Record<string, unknown> {
  const shape: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value.type === 'array') {
      if (value.items?.properties) {
        shape[key] = [buildSchemaShape(value.items.properties)];
      } else if (value.items?.type) {
        shape[key] = [value.items.type];
      } else {
        shape[key] = [];
      }
    } else if (value.type === 'object' && value.properties) {
      shape[key] = buildSchemaShape(value.properties);
    } else {
      shape[key] = value.type || 'unknown';
    }
  }
  return shape;
}

/**
 * Extract full fields from a schema (all fields, with inPreview flags removed)
 */
export function extractFullFields(schema: ExtendedJsonSchema): Record<string, any> {
  const fullProperties: Record<string, any> = {};

  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      // Remove the inPreview flag for the extracted schema
      const cleanProp = { ...prop };
      delete cleanProp.inPreview;
      fullProperties[key] = cleanProp;
    }
  }

  return {
    type: 'object',
    properties: fullProperties,
    required: schema.required,
  };
}
