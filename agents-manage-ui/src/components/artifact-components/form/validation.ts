import { ResourceIdSchema } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

const jsonSchemaValidation = () =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((str, _ctx) => {
      if (!str) {
        return;
      }
      // SAME AS DataComponentApiInsertSchema.props
      return null as any;
    })
    .optional();

export const artifactComponentSchema = z.object({
  id: ResourceIdSchema,
  name: z.string().min(1, 'Name is required.'),
  description: z.string().optional(),
  props: jsonSchemaValidation(),
  render: z
    .object({
      component: z.string(),
      mockData: z.record(z.string(), z.unknown()),
    })
    .nullable()
    .optional(),
});

export type ArtifactComponentFormData = z.infer<typeof artifactComponentSchema>;
