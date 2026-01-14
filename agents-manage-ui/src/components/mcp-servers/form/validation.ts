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

export const CredentialScopeEnum = {
  project: 'project',
  user: 'user',
} as const;

export type CredentialScope = (typeof CredentialScopeEnum)[keyof typeof CredentialScopeEnum];

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
      toolOverrides: z
        .record(
          z.string(),
          z.object({
            displayName: z.string().optional(),
            description: z.string().optional(),
            schema: z.any().optional(),
            transformation: z
              .union([
                z.string(), // JMESPath expression
                z.record(z.string(), z.string()), // object mapping
              ])
              .optional(),
          })
        )
        .optional(),
      prompt: z.string().optional(),
    }),
  }),
  credentialReferenceId: z.string().nullish(),
  credentialScope: z.enum(CredentialScopeEnum).default('project'),
  imageUrl: z.string().optional(),
});

export type MCPToolFormData = z.infer<typeof mcpToolSchema>;
