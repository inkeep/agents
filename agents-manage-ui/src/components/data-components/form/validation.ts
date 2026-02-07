import { DataComponentApiInsertSchema, transformToJson } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

const PropsSchema = DataComponentApiInsertSchema.shape.props;

export const DataComponentSchema = DataComponentApiInsertSchema.pick({
  id: true,
  name: true,
  description: true,
  render: true,
}).extend({
  props: z
    .string()
    .trim()
    .nonempty('Props schema is required')
    .transform(transformToJson)
    .pipe(PropsSchema),
});

export type DataComponentInput = z.input<typeof DataComponentSchema>;
export type DataComponentOutput = z.output<typeof DataComponentSchema>;
