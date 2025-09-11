import { MCPTransportType } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

// Discriminated union for tool selection
const toolsConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('all'),
  }),
  z.object({
    type: z.literal('selective'),
    tools: z.array(z.string()),
  }),
]);

export const mcpToolSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  config: z.object({
    type: z.literal('mcp'),
    mcp: z.object({
      server: z.object({
        url: z.string().url('Must be a valid URL.'),
      }),
      transport: z.object({
        type: z.nativeEnum(MCPTransportType),
      }),
      toolsConfig: toolsConfigSchema.default({ type: 'all' }),
    }),
  }),
  credentialReferenceId: z.string().nullish(),
  imageUrl: z.string().optional(),
});

export type MCPToolFormData = z.infer<typeof mcpToolSchema>;
