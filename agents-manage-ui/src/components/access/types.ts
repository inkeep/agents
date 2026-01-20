/**
 * Types for the reusable Access components
 *
 * Designed to support multiple principal types (users, groups, service accounts, agents, workflows)
 * and multiple resource types (projects, agents, MCP servers, etc.)
 */

import type { ProjectRole } from '@inkeep/agents-core';

// ============================================================================
// Principal Types (WHO can be granted access)
// ============================================================================

export type PrincipalType = 'user' | 'group' | 'service_account' | 'agent' | 'workflow';

/**
 * Metadata specific to each principal type
 */
interface UserMetadata {
  email: string;
}

interface GroupMetadata {
  memberCount?: number;
  isIdpManaged?: boolean;
}

interface ServiceAccountMetadata {
  lastUsed?: string;
  keyCount?: number;
}

interface AgentMetadata {
  projectId: string;
  projectName?: string;
}

interface WorkflowMetadata {
  projectId: string;
  projectName?: string;
}

export type PrincipalMetadata =
  | { type: 'user'; data: UserMetadata }
  | { type: 'group'; data: GroupMetadata }
  | { type: 'service_account'; data: ServiceAccountMetadata }
  | { type: 'agent'; data: AgentMetadata }
  | { type: 'workflow'; data: WorkflowMetadata };

/**
 * A principal that can be granted access to a resource.
 */
export interface AccessPrincipal {
  /** Unique identifier for this principal */
  id: string;

  /** Type of principal */
  type: PrincipalType;

  /** Display name (user name, group name, service account name, etc.) */
  displayName: string;

  /** Secondary display text (email for users, member count for groups, etc.) */
  subtitle?: string;

  /** The role/permission level granted */
  role: string;

  /** Type-specific metadata */
  metadata?: PrincipalMetadata;
}

// ============================================================================
// Role Configuration
// ============================================================================

export interface AccessRole {
  value: string;
  label: string;
  description?: string;
}

// ============================================================================
// Inherited Access (from parent relationships)
// ============================================================================

export interface InheritedAccessConfig {
  title: string;
  description: string;
  principals: AccessPrincipal[];
}

// ============================================================================
// API Types (for transforming API responses)
// ============================================================================

/**
 * Project member from SpiceDB API
 *
 * Role hierarchy:
 * - project_admin: Full access (view + use + edit)
 * - project_member: Operator access (view + use: invoke agents, create API keys)
 * - project_viewer: Read-only access (view only)
 */
export interface ProjectMemberFromApi {
  userId: string;
  role: ProjectRole;
}
