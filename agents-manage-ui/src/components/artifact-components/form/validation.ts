import { z } from 'zod';
import { getJsonParseError, validateJsonSchemaForLlm } from '@/lib/json-schema-validation';
import { idSchema } from '@/lib/validation';

const jsonSchemaValidation = () =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value, ctx) => {
      if (!value || value === '' || value === null) {
        return undefined;
      }

      try {
        const parsed = JSON.parse(value);

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
  render: z
    .object({
      component: z.string(),
      mockData: z.record(z.string(), z.unknown()),
    })
    .nullable()
    .optional(),
});

export type ArtifactComponentFormData = z.infer<typeof artifactComponentSchema>;
