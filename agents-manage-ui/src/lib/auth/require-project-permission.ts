import type { ProjectPermissionLevel, ProjectPermissions } from '@inkeep/agents-core';
import { redirect } from 'next/navigation';
import { fetchProjectPermissions } from '@/lib/api/projects';

/**
 * Server-side utility to ensure user has the required permission level for a project.
 * If not, redirects to the specified fallback path.
 *
 * Usage in server components:
 * ```ts
 * // For create/edit pages
 * await checkProjectPermissionOrRedirect(tenantId, projectId, 'edit', `/${tenantId}/projects/${projectId}/artifacts`);
 *
 * // For pages that need "use" access (invoke agents, etc.)
 * await checkProjectPermissionOrRedirect(tenantId, projectId, 'use', `/${tenantId}/projects/${projectId}`);
 *
 * // For view-only pages
 * await checkProjectPermissionOrRedirect(tenantId, projectId, 'view', `/${tenantId}/projects`);
 * ```
 *
 * @param tenantId - The tenant ID
 * @param projectId - The project ID
 * @param level - The required permission level: 'view', 'use', or 'edit'
 * @param fallbackPath - Path to redirect to if user doesn't have the required permission
 * @returns The permissions object if user has the required access
 */
export async function checkProjectPermissionOrRedirect(
  tenantId: string,
  projectId: string,
  level: ProjectPermissionLevel,
  fallbackPath: string
): Promise<ProjectPermissions> {
  const permissions = await fetchProjectPermissions(tenantId, projectId);

  let hasPermission: boolean;
  switch (level) {
    case 'view':
      hasPermission = permissions.canView;
      break;
    case 'use':
      hasPermission = permissions.canUse;
      break;
    case 'edit':
      hasPermission = permissions.canEdit;
      break;
    default: {
      // Exhaustive check - this should never happen
      const _exhaustiveCheck: never = level;
      throw new Error(`Unknown permission level: ${_exhaustiveCheck}`);
    }
  }

  if (!hasPermission) {
    redirect(fallbackPath);
  }

  return permissions;
}
