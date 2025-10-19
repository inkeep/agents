import { z } from 'zod';
import { getJsonParseError, validateJsonSchemaForLlm } from '@/lib/json-schema-validation';
import { idSchema } from '@/lib/validation';

export const dataComponentSchema = z.object({
  id: idSchema,
  name: z.string().min(1, 'Name is required.'),
  description: z.string().min(1, 'Description is required.'),
  props: z
    .string()
    .min(1, 'Props schema is required.')
    .transform((str, ctx) => {
      try {
        const parsed = JSON.parse(str);

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
    })
    .optional(),
  preview: z.object({
    code: z.string(),
    data: z.record(z.string(), z.unknown()),
  }).nullable().optional(),
});

export type DataComponentFormData = z.infer<typeof dataComponentSchema>;
