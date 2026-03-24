/**
 * Client-safe authz types and constants.
 * These can be safely imported in client-side code without any Node.js dependencies.
 */

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
  PROJECT_ADMIN: 'project_admin', // Full access: view + use + edit + manage members
  PROJECT_MEMBER: 'project_member', // Operator: view + use (invoke agents, create API keys)
  PROJECT_VIEWER: 'project_viewer', // Read-only: view only
} as const;

/**
 * SpiceDB permissions for organization resources.
 *
 * From schema.zed definition organization:
 * - view: owner + admin + member
 * - manage: owner + admin (includes managing org settings and all projects)
 */
export const SpiceDbOrgPermissions = {
  VIEW: 'view',
  MANAGE: 'manage',
} as const;

export type SpiceDbOrgPermission =
  (typeof SpiceDbOrgPermissions)[keyof typeof SpiceDbOrgPermissions];

/**
 * SpiceDB permissions for project resources.
 *
 * From schema.zed definition project:
 * - view: read-only access to project and its resources
 * - use: invoke agents, create API keys, view traces
 * - edit: modify configurations, manage members
 */
export const SpiceDbProjectPermissions = {
  VIEW: 'view',
  USE: 'use',
  EDIT: 'edit',
} as const;

export type SpiceDbProjectPermission =
  (typeof SpiceDbProjectPermissions)[keyof typeof SpiceDbProjectPermissions];

/**
 * Permission levels for project access checks.
 */
export type ProjectPermissionLevel = SpiceDbProjectPermission;

/**
 * Organization roles from SpiceDB schema.
 */
export const OrgRoles = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
} as const;

export type OrgRole = (typeof OrgRoles)[keyof typeof OrgRoles];

/**
 * Project roles from SpiceDB schema.
 *
 * Hierarchy:
 * - project_admin: Full access (view + use + edit + manage members)
 * - project_member: Operator access (view + use: invoke agents, create API keys)
 * - project_viewer: Read-only access (view only)
 */
export const ProjectRoles = {
  ADMIN: 'project_admin',
  MEMBER: 'project_member',
  VIEWER: 'project_viewer',
} as const;

export type ProjectRole = (typeof ProjectRoles)[keyof typeof ProjectRoles];

/**
 * Project permission capabilities.
 * Maps to the SpiceDB permission checks (view, use, edit).
 */
export interface ProjectPermissions {
  canView: boolean;
  canUse: boolean;
  canEdit: boolean;
}
