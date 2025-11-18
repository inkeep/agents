import { z } from 'zod';

const stopWhenSchema = z
  .object({
    transferCountIs: z.number().min(1).max(100).optional().nullable(),
    stepCountIs: z.number().min(1).max(1000).optional().nullable(),
  })
  .optional()
  .nullable();

const simulationAgentSchema = z
  .object({
    prompt: z.string().optional().nullable(),
    model: z
      .object({
        model: z.string().optional().nullable(),
        providerOptions: z.record(z.string(), z.unknown()).optional().nullable(),
      })
      .optional()
      .nullable(),
    stopWhen: stopWhenSchema,
  })
  .superRefine((data, ctx) => {
    const hasModel =
      data.model?.model && typeof data.model.model === 'string' ? data.model.model.trim() : '';
    const hasPrompt = data.prompt && typeof data.prompt === 'string' ? data.prompt.trim() : '';
    const hasStopWhen =
      data.stopWhen &&
      ((data.stopWhen.transferCountIs !== null && data.stopWhen.transferCountIs !== undefined) ||
        (data.stopWhen.stepCountIs !== null && data.stopWhen.stepCountIs !== undefined));

    // If any field is configured, both prompt and model are required
    if (hasModel || hasPrompt || hasStopWhen) {
      // If prompt is set but model is not, require model
      if (hasPrompt && !hasModel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Model is required when configuring the simulation agent',
          path: ['model', 'model'],
        });
      }
      // If model is set but prompt is not, require prompt
      if (hasModel && !hasPrompt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Prompt is required when configuring the simulation agent',
          path: ['prompt'],
        });
      }
      // If stopWhen is set, require both prompt and model
      if (hasStopWhen) {
        if (!hasPrompt) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Prompt is required when configuring the simulation agent',
            path: ['prompt'],
          });
        }
        if (!hasModel) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Model is required when configuring the simulation agent',
            path: ['model', 'model'],
          });
        }
      }
    }
  })
  .optional()
  .nullable();

export const datasetItemSchema = z.object({
  input: z.string().min(1, 'Input is required'),
  expectedOutput: z.string().optional(),
  simulationAgent: z.union([simulationAgentSchema, z.string()]).optional().nullable(),
});

export type DatasetItemFormData = z.infer<typeof datasetItemSchema>;
