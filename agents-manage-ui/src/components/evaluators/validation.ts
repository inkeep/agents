import { z } from 'zod';

const modelSettingsSchema = z
  .object({
    model: z.string().min(1, 'Model is required'),
    providerOptions: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => !!data.model?.trim(), {
    message: 'Model is required',
    path: ['model'],
  });

const passCriteriaConditionSchema = z.object({
  field: z.string().min(1, 'Field name is required'),
  operator: z.enum(['>', '<', '>=', '<=', '=', '!=']),
  value: z.number(),
});

const passCriteriaSchema = z.object({
  operator: z.enum(['and', 'or']),
  conditions: z.array(passCriteriaConditionSchema).min(1, 'At least one condition is required'),
});

export const evaluatorSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  schema: z
    .string()
    .min(1, 'Schema is required')
    .refine(
      (value) => {
        try {
          const parsed = JSON.parse(value);
          return typeof parsed === 'object' && parsed !== null;
        } catch {
          return false;
        }
      },
      {
        message: 'Schema must be valid JSON',
      }
    ),
  model: modelSettingsSchema,
  passCriteria: passCriteriaSchema.optional(),
});

export type EvaluatorFormData = z.infer<typeof evaluatorSchema>;
