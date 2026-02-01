import { DataComponentApiInsertSchema } from '@inkeep/agents-core/client-exports';
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
    .nonempty()
    .transform((value, ctx) => {
      try {
        return JSON.parse(value);
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid JSON syntax',
        });
        return z.NEVER;
      }
    })
    .pipe(PropsSchema),
});

export type DataComponentFormData = z.infer<typeof DataComponentSchema>;
