/**
 * Client-Safe Schema Exports
 *
 * This file exports only the Zod schemas and types that are safe to use
 * in client-side applications (like Next.js builds) without importing
 * server-side database dependencies.
 */

import { z } from 'zod';
import { CredentialStoreType, MCPTransportType } from './types';

// Common parameter schemas
export const TenantParamsSchema = z.object({
  tenantId: z.string(),
});

export const TenantProjectParamsSchema = TenantParamsSchema.extend({
  projectId: z.string(),
});

export const TenantProjectIdParamsSchema = TenantProjectParamsSchema.extend({
  id: z.string(),
});

export const IdParamsSchema = z.object({
  id: z.string(),
});

// Response wrapper schemas
export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  total: z.number(),
  pages: z.number(),
});

export const ListResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: PaginationSchema,
  });

export const SingleResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: itemSchema,
  });

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.unknown().optional(),
});

// Model Settings Schema
export const ModelSettingsSchema = z.object({
  model: z.string().optional(),
  structuredOutput: z.string().optional(),
  summarizer: z.string().optional(),
  providerOptions: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});

// Agent API schemas (inline definitions to avoid DB imports)
export const AgentApiInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  prompt: z.string().optional(),
  model: ModelSettingsSchema.optional(),
  tools: z.array(z.string()).optional(),
  dataComponents: z.array(z.string()).optional(),
  artifactComponents: z.array(z.string()).optional(),
  canTransferTo: z.array(z.string()).optional(),
  canDelegateTo: z.array(z.string()).optional(),
  type: z.enum(['internal', 'external']).optional(),
});

// Tool API schemas (inline definitions)
export const ToolApiInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  type: z.enum(['mcp', 'hosted']),
  config: z.record(z.string(), z.unknown()),
  credentialReferenceId: z.string().optional(),
});

// API Key schemas
export const ApiKeyApiSelectSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  projectId: z.string(),
  graphId: z.string(),
  publicId: z.string(),
  keyHash: z.string(),
  keyPrefix: z.string(),
  name: z.string().optional(),
  lastUsedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ApiKeyApiCreationResponseSchema = z.object({
  data: z.object({
    apiKey: ApiKeyApiSelectSchema,
    key: z.string(),
  }),
});

// Credential Reference API schemas
export const CredentialReferenceApiInsertSchema = z.object({
  id: z.string(),
  tenantId: z.string().optional(),
  projectId: z.string().optional(),
  type: z.enum(CredentialStoreType),
  credentialStoreId: z.string(),
  retrievalParams: z.record(z.string(), z.unknown()).nullish(),
});

// Data Component API schemas (inline definitions)
export const DataComponentApiInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  props: z.record(z.string(), z.unknown()),
});

// Artifact Component API schemas (inline definitions)
export const ArtifactComponentApiInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  summaryProps: z.record(z.string(), z.unknown()),
  fullProps: z.record(z.string(), z.unknown()),
});

// Context Config API schemas (inline definitions)
export const ContextConfigApiInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  type: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

// External Agent API schemas (inline definitions)
export const ExternalAgentApiInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  baseUrl: z.string(),
  type: z.literal('external').optional(),
});

// Agent Graph API schemas (inline definitions)
export const AgentGraphApiInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  defaultAgentId: z.string().optional(),
});

// Full Graph Definition Schema - extends AgentGraph with agents and tools
export const FullGraphDefinitionSchema = AgentGraphApiInsertSchema.extend({
  agents: z.record(
    z.string(),
    z.union([
      AgentApiInsertSchema.extend({
        id: z.string(),
        tools: z.array(z.string()),
        dataComponents: z.array(z.string()).optional(),
        artifactComponents: z.array(z.string()).optional(),
        canTransferTo: z.array(z.string()).optional(),
        canDelegateTo: z.array(z.string()).optional(),
        type: z.enum(['internal', 'external']).optional(),
        models: z
          .object({
            base: z
              .object({
                model: z.string(),
                providerOptions: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
              })
              .optional(),
            structuredOutput: z
              .object({
                model: z.string(),
                providerOptions: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
              })
              .optional(),
            summarizer: z
              .object({
                model: z.string(),
                providerOptions: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
              })
              .optional(),
          })
          .optional(),
      }),
      ExternalAgentApiInsertSchema.extend({
        id: z.string(),
      }),
    ])
  ),
  tools: z.record(z.string(), ToolApiInsertSchema),
  credentialReferences: z.array(CredentialReferenceApiInsertSchema).optional(),
  dataComponents: z.record(z.string(), DataComponentApiInsertSchema).optional(),
  artifactComponents: z.record(z.string(), ArtifactComponentApiInsertSchema).optional(),
  contextConfig: z.optional(ContextConfigApiInsertSchema),
  models: z
    .object({
      base: z
        .object({
          model: z.string(),
          providerOptions: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
        })
        .optional(),
      structuredOutput: z
        .object({
          model: z.string(),
          providerOptions: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
        })
        .optional(),
      summarizer: z
        .object({
          model: z.string(),
          providerOptions: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
        })
        .optional(),
    })
    .optional(),
  stopWhen: z
    .object({
      transferCountIs: z.number().min(1).max(100).optional(),
    })
    .optional(),
  graphPrompt: z.string().max(5000).optional(),
  statusUpdates: z
    .object({
      enabled: z.boolean().optional(),
      numEvents: z.number().min(1).max(100).optional(),
      timeInSeconds: z.number().min(1).max(600).optional(),
      prompt: z.string().max(2000).optional(),
      statusComponents: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().optional(),
            schema: z.object({
              type: z.literal('object'),
              properties: z.record(z.string(), z.any()),
              required: z.array(z.string()).optional(),
            }),
          })
        )
        .optional(),
    })
    .optional(),
});

// Export inferred types
export type AgentApiInsert = z.infer<typeof AgentApiInsertSchema>;
export type ToolApiInsert = z.infer<typeof ToolApiInsertSchema>;
export type ApiKeyApiSelect = z.infer<typeof ApiKeyApiSelectSchema>;
export type ApiKeyApiCreationResponse = z.infer<typeof ApiKeyApiCreationResponseSchema>;
export type CredentialReferenceApiInsert = z.infer<typeof CredentialReferenceApiInsertSchema>;
export type DataComponentApiInsert = z.infer<typeof DataComponentApiInsertSchema>;
export type ArtifactComponentApiInsert = z.infer<typeof ArtifactComponentApiInsertSchema>;
export type ContextConfigApiInsert = z.infer<typeof ContextConfigApiInsertSchema>;
export type ExternalAgentApiInsert = z.infer<typeof ExternalAgentApiInsertSchema>;
export type AgentGraphApiInsert = z.infer<typeof AgentGraphApiInsertSchema>;
export type FullGraphDefinition = z.infer<typeof FullGraphDefinitionSchema>;
export type TenantParams = z.infer<typeof TenantParamsSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type ModelSettings = z.infer<typeof ModelSettingsSchema>;

// Resource ID validation utilities (client-safe)
export const MIN_ID_LENGTH = 1;
export const MAX_ID_LENGTH = 255;
export const URL_SAFE_ID_PATTERN = /^[a-zA-Z0-9\-_.]+$/;

export const resourceIdSchema = z
  .string()
  .min(MIN_ID_LENGTH)
  .max(MAX_ID_LENGTH)
  .regex(URL_SAFE_ID_PATTERN, {
    message: 'ID must contain only letters, numbers, hyphens, underscores, and dots',
  });

// ID generation utility
export function generateIdFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_ID_LENGTH);
}

// Type aliases for backward compatibility
export type ToolInsert = ToolApiInsert;
export type AgentGraphInsert = AgentGraphApiInsert;

// Re-export utility types for client use
export { CredentialStoreType, MCPTransportType };
