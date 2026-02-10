/**
 * Client-Safe Schema Exports
 *
 * This file exports only the Zod schemas and types that are safe to use
 * in client-side applications (like Next.js builds) without importing
 * server-side database dependencies.
 */

import type { z } from '@hono/zod-openapi';
import type {
  AgentApiInsertSchema,
  ApiKeyApiCreationResponseSchema,
  ApiKeyApiSelectSchema,
  CredentialReferenceApiInsertSchema,
  FullAgentAgentInsertSchema,
  TriggerApiSelectSchema,
  TriggerInvocationApiSelectSchema,
} from './validation/schemas';
import { MAX_ID_LENGTH } from './validation/schemas';

export { DEFAULT_NANGO_STORE_ID } from './credential-stores/default-constants';

export * from './validation/schemas';

export type AgentApiInsert = z.infer<typeof AgentApiInsertSchema>;
export type TriggerApiSelect = z.infer<typeof TriggerApiSelectSchema>;
export type TriggerInvocationApiSelect = z.infer<typeof TriggerInvocationApiSelectSchema>;
export type ApiKeyApiSelect = z.infer<typeof ApiKeyApiSelectSchema>;
export type ApiKeyApiCreationResponse = z.infer<typeof ApiKeyApiCreationResponseSchema>;
export type CredentialReferenceApiInsert = z.infer<typeof CredentialReferenceApiInsertSchema>;
export type InternalAgentDefinition = z.infer<typeof FullAgentAgentInsertSchema>;

export function generateIdFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_ID_LENGTH);
}

export { type OrgRole, OrgRoles, type ProjectRole, ProjectRoles } from './auth/authz/types';
export * from './constants/context-breakdown';
export * from './constants/otel-attributes';
export * from './constants/signoz-queries';
export { CredentialStoreType, MCPTransportType } from './types';
export { detectAuthenticationRequired } from './utils/auth-detection';
