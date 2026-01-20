'use client';

import type { FC } from 'react';
import { useProjectAccess } from './hooks/use-project-access';
import { ResourceMembersPage } from './resource-members-page';

interface ProjectMembersWrapperProps {
  projectId: string;
  tenantId: string;
  canManage: boolean;
}

const roles = [
  {
    value: 'project_admin',
    label: 'Project Admin',
    description: 'Full access to project settings and members',
  },
  {
    value: 'project_member',
    label: 'Project Member',
    description: 'Can invoke agents and create API keys',
  },
  {
    value: 'project_viewer',
    label: 'Project Viewer',
    description: 'Read-only access to project resources',
  },
];

const membersConfig = {
  title: 'Project Members',
  description: 'Users with direct access to this project',
  emptyMessage: 'No project members yet. Add members above to grant them access.',
};

/**
 * Project-specific wrapper for the ResourceMembersPage component.
 * Handles project-specific data fetching and mutations via useProjectAccess hook.
 *
 * Future: Create similar wrappers for other resources:
 * - AgentMembersWrapper (uses useAgentAccess hook)
 * - McpServerMembersWrapper (uses useMcpServerAccess hook)
 */
export const ProjectMembersWrapper: FC<ProjectMembersWrapperProps> = ({
  projectId,
  tenantId,
  canManage,
}) => {
  const {
    principals,
    availablePrincipals,
    inheritedAccess,
    isLoading,
    isMutating,
    addPrincipal,
    removePrincipal,
    changeRole,
  } = useProjectAccess({ tenantId, projectId });

  return (
    <ResourceMembersPage
      roles={roles}
      availableMembers={availablePrincipals}
      inheritedAccess={inheritedAccess}
      principals={principals}
      membersConfig={membersConfig}
      canManage={canManage}
      onAdd={addPrincipal}
      onRoleChange={changeRole}
      onRemove={removePrincipal}
      isLoading={isLoading}
      isAdding={isMutating}
    />
  );
};
