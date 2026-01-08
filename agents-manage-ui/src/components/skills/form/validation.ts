import { z } from 'zod';

// todo reuse from core
export const skillSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-zA-Z0-9-_]+$/, 'Use letters, numbers, dashes, or underscores'),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  content: z.string().trim().min(1),
  license: z.string().trim().optional(),
  compatibility: z
    .string()
    .trim()
    .max(500, 'Compatibility must be 500 characters or less')
    .optional(),
  allowedTools: z.string().trim().optional(),
  metadata: z.string().optional(),
});

export type SkillFormData = z.infer<typeof skillSchema>;

export const defaultValues: SkillFormData = {
  id: '',
  name: '',
  description: '',
  content: '',
  license: '',
  compatibility: '',
  allowedTools: '',
  metadata: '',
};

export function parseAllowedToolsField(value = ''): string[] | null {
  if (!value.trim()) {
    return null;
  }
  return value
    .split(/\s+/)
    .map((tool) => tool.trim())
    .filter((tool) => tool.length > 0);
}

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
