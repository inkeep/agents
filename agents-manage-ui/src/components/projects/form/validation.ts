import { z } from 'zod';

const modelSettingsSchema = z.object({
  model: z.string().optional(), // Allow empty model - system will fall back to defaults
  providerOptions: z.record(z.string(), z.any()).optional(),
});

const projectModelsSchema = z
  .object({
    base: modelSettingsSchema.optional(),
    structuredOutput: modelSettingsSchema.optional(),
    summarizer: modelSettingsSchema.optional(),
  })
  .optional()
  .nullable();

const projectStopWhenSchema = z
  .object({
    transferCountIs: z.number().min(1).max(100).optional(),
    stepCountIs: z.number().min(1).max(1000).optional(),
  })
  .optional()
  .nullable();

export const projectSchema = z.object({
  id: z
    .string()
    .min(1, 'Project ID is required')
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
      message:
        'ID must start and end with lowercase alphanumeric characters, and may contain hyphens',
    }),
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(100, 'Name must be less than 100 characters'),
  description: z
    .string()
    .min(1, 'Project description is required')
    .max(500, 'Description must be less than 500 characters'),
  models: projectModelsSchema,
  stopWhen: projectStopWhenSchema,
});

export type ProjectFormData = z.infer<typeof projectSchema>;
