import type { PassCriteria } from '@inkeep/agents-core/evaluation';
import { MAX_PASS_CRITERIA_DEPTH } from '@inkeep/agents-core/types';
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

const passCriteriaConditionSchema = z
  .object({
    field: z.string().min(1, 'Field name is required'),
    operator: z.enum(['>', '<', '>=', '<=', '=', '!=']),
    value: z.union([z.number(), z.boolean()]),
  })
  .superRefine((val, ctx) => {
    if (typeof val.value === 'boolean' && val.operator !== '=' && val.operator !== '!=') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Boolean values only support '=' and '!=' operators`,
        path: ['operator'],
      });
    }
  });

const passCriteriaSchema: z.ZodType<PassCriteria, any, any> = z
  .lazy(() =>
    z.object({
      operator: z.enum(['and', 'or']),
      conditions: z
        .array(z.union([passCriteriaConditionSchema, passCriteriaSchema]))
        .min(1, 'At least one condition is required'),
    })
  )
  .superRefine((val, ctx) => {
    const checkDepth = (node: unknown, depth: number): void => {
      if (depth > MAX_PASS_CRITERIA_DEPTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Pass criteria exceeds maximum nesting depth of ${MAX_PASS_CRITERIA_DEPTH}`,
        });
        return;
      }
      const obj = node as Record<string, unknown>;
      if ('conditions' in obj && Array.isArray(obj.conditions)) {
        for (const child of obj.conditions) {
          if (child && typeof child === 'object' && 'conditions' in child) {
            checkDepth(child, depth + 1);
          }
        }
      }
    };
    checkDepth(val, 0);
  });

export const evaluatorSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
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
    )
    .refine(
      (value) => {
        try {
          const parsed = JSON.parse(value);
          if (parsed.type === 'object') {
            return (
              parsed.properties !== undefined &&
              typeof parsed.properties === 'object' &&
              Object.keys(parsed.properties).length > 0
            );
          }
          return parsed.type !== undefined;
        } catch {
          return false;
        }
      },
      {
        message: 'Schema must define at least one property',
      }
    ),
  model: modelSettingsSchema,
  passCriteria: passCriteriaSchema.nullish(),
});

export type EvaluatorFormData = z.infer<typeof evaluatorSchema>;
