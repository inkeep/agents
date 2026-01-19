/**
 * Types for the reusable Access components
 *
 * Designed to support multiple principal types (users, groups, service accounts, agents, workflows)
 * and multiple resource types (projects, agents, MCP servers, etc.)
 */

// ============================================================================
// Principal Types (WHO can be granted access)
// ============================================================================

export type PrincipalType = 'user' | 'group' | 'service_account' | 'agent' | 'workflow';

/**
 * Metadata specific to each principal type
 */
export interface UserMetadata {
  email: string;
}

export interface GroupMetadata {
  memberCount?: number;
  isIdpManaged?: boolean;
}

export interface ServiceAccountMetadata {
  lastUsed?: string;
  keyCount?: number;
}

export interface AgentMetadata {
  projectId: string;
  projectName?: string;
}

export interface WorkflowMetadata {
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
// Resource Types (WHAT is being protected)
// ============================================================================

export type ResourceType =
  | 'project'
  | 'agent'
  | 'mcp_server'
  | 'workflow'
  | 'policy'
  | 'data_component';

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
  role: 'project_admin' | 'project_member' | 'project_viewer';
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get display icon name for a principal type
 */
export function getPrincipalIcon(type: PrincipalType): string {
  switch (type) {
    case 'user':
      return 'user';
    case 'group':
      return 'users';
    case 'service_account':
      return 'key';
    case 'agent':
      return 'bot';
    case 'workflow':
      return 'workflow';
    default:
      return 'user';
  }
}

/**
 * Get display label for a principal type
 */
export function getPrincipalTypeLabel(type: PrincipalType): string {
  switch (type) {
    case 'user':
      return 'User';
    case 'group':
      return 'Group';
    case 'service_account':
      return 'Service Account';
    case 'agent':
      return 'Agent';
    case 'workflow':
      return 'Workflow';
    default:
      return 'Unknown';
  }
}
