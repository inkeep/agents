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
 * Replaces the old "AccessMember" type.
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

export type ResourceType = 'project' | 'agent' | 'mcp_server' | 'workflow' | 'policy' | 'data_component';

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
// Explicit Access Configuration
// ============================================================================

export interface ExplicitAccessConfig {
  title: string;
  description: string;
  emptyMessage: string;
}

// ============================================================================
// Component Props
// ============================================================================

/**
 * Props for the generic AccessSection component.
 * Pure presentation component - all data fetching and mutations handled by parent.
 */
export interface AccessSectionProps {
  /** Overall description shown at the top */
  description?: string;

  /** Loading state */
  isLoading?: boolean;

  /** Error message */
  error?: string | null;

  /** Available roles for this resource type */
  roles: AccessRole[];

  /** Inherited access (org admins for projects, project admins for sub-resources) */
  inheritedAccess?: InheritedAccessConfig;

  /** Configuration for the explicit access section */
  explicitAccessConfig: ExplicitAccessConfig;

  /** Current explicit principals with access */
  principals: AccessPrincipal[];

  /** Available principals to add (filtered by what makes sense for this resource) */
  availablePrincipals: AccessPrincipal[];

  /** Can the current user manage access? */
  canManage: boolean;

  /** Callbacks for mutations */
  onAddPrincipal: (principalId: string, principalType: PrincipalType, role: string) => Promise<void>;
  onRemovePrincipal: (principalId: string, principalType: PrincipalType, role: string) => Promise<void>;
  onChangeRole: (principalId: string, principalType: PrincipalType, oldRole: string, newRole: string) => Promise<void>;

  /** Mutation states */
  isMutating?: boolean;
}

/**
 * Props for the ExplicitAccessList component
 */
export interface ExplicitAccessListProps {
  /** Section title */
  title: string;
  /** Section description */
  description: string;
  /** Empty state message */
  emptyMessage: string;
  /** Current principals with explicit access */
  principals: AccessPrincipal[];
  /** Available roles */
  roles: AccessRole[];
  /** Available principals to add */
  availablePrincipals: AccessPrincipal[];
  /** Can the current user manage access? */
  canManage: boolean;
  /** Callbacks */
  onAdd: (principalId: string, principalType: PrincipalType, role: string) => Promise<void>;
  onRoleChange: (principalId: string, principalType: PrincipalType, oldRole: string, newRole: string) => Promise<void>;
  onRemove: (principalId: string, principalType: PrincipalType, role: string) => Promise<void>;
  /** Loading states */
  isAdding?: boolean;
  isUpdating?: boolean;
  isRemoving?: boolean;
}

/**
 * Props for InheritedAccessCard
 */
export interface InheritedAccessCardProps {
  config: InheritedAccessConfig;
}

/**
 * Props for AddAccessDialog
 */
export interface AddAccessDialogProps {
  /** Available principals to add */
  availablePrincipals: AccessPrincipal[];
  /** Available roles to assign */
  roles: AccessRole[];
  /** Called when a principal is added */
  onAdd: (principalId: string, principalType: PrincipalType, role: string) => Promise<void>;
  /** Whether adding is in progress */
  isLoading?: boolean;
  /** IDs of principals who already have access (to filter out) */
  existingPrincipalIds?: string[];
  /** Disabled state */
  disabled?: boolean;
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
