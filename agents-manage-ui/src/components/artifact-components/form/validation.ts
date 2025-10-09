import { z } from 'zod';
import { getJsonParseError, validateJsonSchemaForLlm } from '@/lib/json-schema-validation';
import { idSchema } from '@/lib/validation';

const jsonSchemaValidation = () =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value, ctx) => {
      // If no value provided, empty string, or null, return undefined
      if (!value || value === '' || value === null) {
        return undefined;
      }

      try {
        const parsed = JSON.parse(value);

        // Validate it's a proper LLM-compatible JSON schema
        const validationResult = validateJsonSchemaForLlm(value);
        if (!validationResult.isValid) {
          const errorMessage = validationResult.errors[0]?.message || 'Invalid JSON schema';
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: errorMessage,
          });
          return z.NEVER;
        }

        return parsed;
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: getJsonParseError(error),
        });
        return z.NEVER;
      }
    })
    .optional();

export const artifactComponentSchema = z.object({
  id: idSchema,
  name: z.string().min(1, 'Name is required.'),
  description: z.string().min(1, 'Description is required.'),
  props: jsonSchemaValidation(),
});

export type ArtifactComponentFormData = z.infer<typeof artifactComponentSchema>;
