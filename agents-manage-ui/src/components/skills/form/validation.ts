import { SkillFrontmatterSchema } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

export const SkillSchema = z.object({
  name: SkillFrontmatterSchema.shape.name,
  description: SkillFrontmatterSchema.shape.description,
  content: z.string().nonempty(),
  metadata: z.string().optional(),
});

export type SkillFormData = z.infer<typeof SkillSchema>;

export const defaultValues: SkillFormData = {
  id: '',
  name: '',
  description: '',
  content: '',
  metadata: '',
};

export function parseMetadataField(metadata = ''): Record<string, unknown> | null {
  if (!metadata.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadata);
    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
      throw new Error('Metadata must be a JSON object');
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid metadata JSON';
    throw new Error(message);
  }
}
