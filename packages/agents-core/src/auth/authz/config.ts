/**
 * SpiceDB Authorization Configuration
 *
 * Feature flag and configuration for the SpiceDB authorization system.
 */

/**
 * Check if authorization is enabled.
 * When false, all permission checks return true (current behavior).
 * When true, SpiceDB is used for authorization.
 */
export function isAuthzEnabled(): boolean {
  return process.env.ENABLE_AUTHZ === 'true';
}

/**
 * Get SpiceDB connection configuration from environment variables.
 */
export function getSpiceDbConfig() {
  return {
    endpoint: process.env.SPICEDB_ENDPOINT || 'localhost:50051',
    token: process.env.SPICEDB_PRESHARED_KEY || '',
    tlsEnabled: process.env.SPICEDB_TLS_ENABLED === 'true',
  };
}

/**
 * SpiceDB resource types used in the schema
 */
export const SpiceDbResourceTypes = {
  USER: 'user',
  ORGANIZATION: 'organization',
  PROJECT: 'project',
} as const;

/**
 * SpiceDB relations used in the schema
 * 
 * Relations are named as nouns (roles) per SpiceDB best practices.
 * Project roles are prefixed for clarity when debugging/grepping.
 */
export const SpiceDbRelations = {
  // Organization relations (roles)
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  // Project relations (roles) - prefixed for clarity
  ORGANIZATION: 'organization',
  PROJECT_ADMIN: 'project_admin',   // Full access: view + use + edit + manage members
  PROJECT_MEMBER: 'project_member', // Operator: view + use (invoke agents, create API keys)
  PROJECT_VIEWER: 'project_viewer', // Read-only: view only
} as const;

/**
 * SpiceDB permissions used in the schema
 * 
 * Permissions are named as verbs (actions) per SpiceDB best practices.
 */
/**
 * SpiceDB permissions used in permission checks.
 * 
 * Note: Organization-level permissions (manage, delete) are handled via
 * orgRole bypass in permission functions, not direct SpiceDB checks.
 */
export const SpiceDbPermissions = {
  VIEW: 'view',
  USE: 'use',    // Can invoke agents, create API keys
  EDIT: 'edit',  // Can modify configurations and manage members
  DELETE: 'delete',
} as const;

export type OrgRole = 'owner' | 'admin' | 'member';

/**
 * Project roles hierarchy:
 * - project_admin: Full access (view + use + edit + manage members + delete)
 * - project_member: Operator access (view + use: invoke agents, create API keys)
 * - project_viewer: Read-only access (view only)
 */
export type ProjectRole = 'project_admin' | 'project_member' | 'project_viewer';
