import { DataComponentApiInsertSchema, toJson } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

const PropsSchema = DataComponentApiInsertSchema.shape.props;

export const DataComponentSchema = DataComponentApiInsertSchema.pick({
  id: true,
  name: true,
  description: true,
  render: true,
}).extend({
  props: z.string().trim().nonempty().transform(toJson).pipe(PropsSchema),
});

export type DataComponentFormData = z.infer<typeof DataComponentSchema>;
