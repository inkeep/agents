import { varchar, timestamp } from 'drizzle-orm/pg-core';

/**
 * Common field definitions for database schemas.
 * These ensure consistency across all tables in both manage and runtime schemas.
 */

/**
 * Standard Inkeep-generated ID field.
 * Used as primary key across all tables.
 * Length: 256 characters to accommodate various ID formats.
 */
export const inkeepId = (name = 'id') => varchar(name, { length: 256 }).notNull();

/**
 * Tenant ID field for multi-tenant scoping.
 * All entities belong to a tenant for isolation.
 */
export const tenantId = () => varchar('tenant_id', { length: 256 }).notNull();

/**
 * Project ID field for project-scoped entities.
 */
export const projectId = () => varchar('project_id', { length: 256 }).notNull();

/**
 * Agent ID field for agent-scoped entities.
 */
export const agentId = () => varchar('agent_id', { length: 256 }).notNull();

/**
 * Sub-agent ID field for sub-agent-scoped entities.
 */
export const subAgentId = () => varchar('sub_agent_id', { length: 256 }).notNull();

/**
 * User/creator ID field.
 */
export const userId = (name = 'user_id') => varchar(name, { length: 256 });

/**
 * Standard tenant-scoped entity fields.
 * Includes tenantId and id.
 */
export const tenantScoped = {
  tenantId: tenantId(),
  id: inkeepId(),
};

/**
 * Standard project-scoped entity fields.
 * Includes tenantId, projectId, and id.
 */
export const projectScoped = {
  ...tenantScoped,
  projectId: projectId(),
};

/**
 * Standard agent-scoped entity fields.
 * Includes tenantId, projectId, agentId, and id.
 */
export const agentScoped = {
  ...projectScoped,
  agentId: agentId(),
};

/**
 * Standard sub-agent-scoped entity fields.
 * Includes tenantId, projectId, agentId, subAgentId, and id.
 */
export const subAgentScoped = {
  ...agentScoped,
  subAgentId: subAgentId(),
};

/**
 * Standard timestamp fields for created/updated tracking.
 */
export const timestamps = {
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
};

/**
 * UI properties common to many entities.
 */
export const uiProperties = {
  name: varchar('name', { length: 256 }).notNull(),
  description: varchar('description', { length: 1024 }),
};