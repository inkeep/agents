// import { SandboxConfigSchema } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

const modelSettingsSchema = z.object({
  model: z.string().optional(), // Allow empty model - system will fall back to defaults
  providerOptions: z.record(z.string(), z.any()).optional().nullable(),
});

const baseModelSettingsSchema = z.object({
  model: z.string().min(1, 'Base model is required'),
  providerOptions: z.record(z.string(), z.any()).optional().nullable(),
});

const projectModelsSchema = z.object({
  base: baseModelSettingsSchema,
  structuredOutput: modelSettingsSchema.optional(),
  summarizer: modelSettingsSchema.optional(),
});

// Use the shared StopWhen schema with optional and nullable modifiers
const projectStopWhenSchema = z
  .object({
    transferCountIs: z.number().min(1).max(100).optional().nullable(),
    stepCountIs: z.number().min(1).max(1000).optional().nullable(),
  })
  .optional();

// const sandboxConfigSchema = SandboxConfigSchema.optional();

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
  // sandboxConfig: sandboxConfigSchema,
});

export type ProjectFormData = z.infer<typeof projectSchema>;
