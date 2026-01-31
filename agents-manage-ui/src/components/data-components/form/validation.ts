import { DataComponentApiInsertSchema } from '@inkeep/agents-core/client-exports';
import type { z } from 'zod';

export const DataComponentSchema = DataComponentApiInsertSchema.pick({
  id: true,
  name: true,
  description: true,
  props: true,
  render: true,
});
export type DataComponentFormData = z.infer<typeof DataComponentSchema>;
