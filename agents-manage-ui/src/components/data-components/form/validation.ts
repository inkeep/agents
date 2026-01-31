import { DataComponentInsertSchema } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

export const dataComponentSchema = z.object({
  // id: ResourceIdSchema,
  name: z.string().min(1, 'Name is required.'),
  description: z.string().optional(),
  props: z.string().min(1, 'Props schema is required.').transform().optional(),
  render: z
    .object({
      component: z.string(),
      mockData: z.record(z.string(), z.unknown()),
    })
    .nullable()
    .optional(),
});

export type DataComponentFormData = z.infer<typeof dataComponentSchema>;
