'use client';

import type { FC } from 'react';
import { AccessSection } from './access-section';
import { useProjectAccess } from './hooks/use-project-access';

interface ProjectAccessWrapperProps {
  projectId: string;
  tenantId: string;
  canManage: boolean;
}

/**
 * Project-specific wrapper for the AccessSection component.
 * Handles all project-specific data fetching and mutations via useProjectAccess hook.
 */
export const ProjectAccessWrapper: FC<ProjectAccessWrapperProps> = ({
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
    error,
    addPrincipal,
    removePrincipal,
    changeRole,
  } = useProjectAccess({ tenantId, projectId });

  return (
    <AccessSection
      isLoading={isLoading}
      error={error}
      roles={[
        { value: 'project_admin', label: 'Project Admin', description: 'Full access: edit configs, manage members' },
        { value: 'project_member', label: 'Project Member', description: 'Can invoke agents and create API keys' },
        { value: 'project_viewer', label: 'Project Viewer', description: 'Read-only access' },
      ]}
      inheritedAccess={inheritedAccess}
      explicitAccessConfig={{
        title: 'Project Members',
        description: 'Add team members to grant them access to this project.',
        emptyMessage: 'No additional members. Add members to grant project access.',
      }}
      principals={principals}
      availablePrincipals={availablePrincipals}
      canManage={canManage}
      onAddPrincipal={addPrincipal}
      onRemovePrincipal={removePrincipal}
      onChangeRole={changeRole}
      isMutating={isMutating}
    />
  );
};
