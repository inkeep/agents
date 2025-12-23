import { z } from 'zod';

export const policySchema = z.object({
  id: z
    .string({ required_error: 'Id is required' })
    .trim()
    .min(1, 'Id is required')
    .regex(/^[a-zA-Z0-9-_]+$/, 'Use letters, numbers, dashes, or underscores'),
  name: z.string({ required_error: 'Name is required' }).trim().min(1, 'Name is required'),
  description: z
    .string({ required_error: 'Description is required' })
    .trim()
    .min(1, 'Description is required'),
  content: z.string({ required_error: 'Content is required' }).trim().min(1, 'Content is required'),
  metadata: z.string().optional(),
});

export type PolicyFormData = z.infer<typeof policySchema>;

export const defaultValues: PolicyFormData = {
  id: '',
  name: '',
  description: '',
  content: '',
  metadata: '',
};

export function parseMetadataField(metadata?: string): Record<string, unknown> | null {
  if (!metadata || metadata.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadata);
    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
      throw new Error('Metadata must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid metadata JSON';
    throw new Error(message);
  }
}
