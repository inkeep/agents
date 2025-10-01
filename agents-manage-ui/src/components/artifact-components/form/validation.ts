import { z } from 'zod';
import { validateJsonSchemaForLlm } from '@/lib/json-schema-validation';
import { idSchema } from '@/lib/validation';

const optionalJsonSchemaValidation = z
  .string()
  .optional()
  .refine((str) => {
    // If empty or undefined, it's valid (optional field)
    if (!str || str.trim() === '') {
      return true;
    }

    // Try to parse as JSON
    try {
      JSON.parse(str);
    } catch {
      return false;
    }

    // Validate it's a proper LLM-compatible JSON schema
    const validationResult = validateJsonSchemaForLlm(str);
    return validationResult.isValid;
  }, {
    message: 'Must be a valid JSON Schema'
  });

export const artifactComponentSchema = z.object({
  id: idSchema,
  name: z.string().min(1, 'Name is required.'),
  description: z.string().min(1, 'Description is required.'),
  summaryProps: optionalJsonSchemaValidation,
  fullProps: optionalJsonSchemaValidation,
});

export type ArtifactComponentFormData = z.infer<typeof artifactComponentSchema>;
