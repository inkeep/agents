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
