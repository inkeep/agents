import Ajv from 'ajv';

export interface PropsValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    value?: any;
  }>;
}

/**
 * Validates that a props object is a valid JSON Schema
 * Uses AJV to validate the schema structure without resolving references
 */
export function validatePropsAsJsonSchema(props: any): PropsValidationResult {
  // If props is null, undefined, or empty, it's valid (optional for artifact components)
  if (!props || (typeof props === 'object' && Object.keys(props).length === 0)) {
    return {
      isValid: true,
      errors: [],
    };
  }

  // Basic JSON Schema structure validation
  if (typeof props !== 'object' || Array.isArray(props)) {
    return {
      isValid: false,
      errors: [
        {
          field: 'props',
          message: 'Props must be a valid JSON Schema object',
          value: props,
        },
      ],
    };
  }

  // Check for required JSON Schema fields
  if (!props.type) {
    return {
      isValid: false,
      errors: [
        {
          field: 'props.type',
          message: 'JSON Schema must have a "type" field',
        },
      ],
    };
  }

  if (props.type !== 'object') {
    return {
      isValid: false,
      errors: [
        {
          field: 'props.type',
          message: 'JSON Schema type must be "object" for component props',
          value: props.type,
        },
      ],
    };
  }

  if (!props.properties || typeof props.properties !== 'object') {
    return {
      isValid: false,
      errors: [
        {
          field: 'props.properties',
          message: 'JSON Schema must have a "properties" object',
        },
      ],
    };
  }

  // Note: 'required' array is optional in JSON Schema
  // If present, it must be an array, but it's not mandatory
  if (props.required !== undefined && !Array.isArray(props.required)) {
    return {
      isValid: false,
      errors: [
        {
          field: 'props.required',
          message: 'If present, "required" must be an array',
        },
      ],
    };
  }

  // Use AJV to validate the schema structure (without resolving references)
  try {
    // Create a copy of the schema without $schema field to avoid external resolution
    const schemaToValidate = { ...props };
    delete schemaToValidate.$schema;

    // Create a new AJV instance that doesn't resolve references
    const schemaValidator = new Ajv({
      strict: false, // Allow unknown keywords like isPreview
      validateSchema: true, // Validate the schema itself
      addUsedSchema: false, // Don't add schemas to the instance
    });

    const isValid = schemaValidator.validateSchema(schemaToValidate);

    if (!isValid) {
      const errors = schemaValidator.errors || [];
      return {
        isValid: false,
        errors: errors.map((error: any) => ({
          field: `props${error.instancePath || ''}`,
          message: error.message || 'Invalid schema',
        })),
      };
    }

    return {
      isValid: true,
      errors: [],
    };
  } catch (error) {
    return {
      isValid: false,
      errors: [
        {
          field: 'props',
          message: `Schema validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    };
  }
}
