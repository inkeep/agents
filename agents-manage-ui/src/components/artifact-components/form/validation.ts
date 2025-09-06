import { z } from 'zod';
import { getJsonParseError, validateJsonSchemaForLlm } from '@/lib/json-schema-validation';
import { idSchema } from '@/lib/validation';

const jsonSchemaValidation = (fieldName: string) =>
  z
    .string()
    .min(1, `${fieldName} schema is required.`)
    .transform((str, ctx) => {
      try {
        const parsed = JSON.parse(str);

        // Validate it's a proper LLM-compatible JSON schema
        const validationResult = validateJsonSchemaForLlm(str);
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
    });

export const artifactComponentSchema = z.object({
  id: idSchema,
  name: z.string().min(1, 'Name is required.'),
  description: z.string().min(1, 'Description is required.'),
  summaryProps: jsonSchemaValidation('Summary props').optional(),
  fullProps: jsonSchemaValidation('Full props').optional(),
});

export type ArtifactComponentFormData = z.infer<typeof artifactComponentSchema>;
