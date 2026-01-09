'use client';

import type { FC } from 'react';
import { useProjectAccess } from './hooks/use-project-access';
import { ShareProjectPage } from './share-project-page';
import type { PrincipalType } from './types';

interface ShareProjectWrapperProps {
  projectId: string;
  projectName?: string;
  tenantId: string;
  canManage: boolean;
}

/**
 * Wrapper component for the ShareProjectPage that handles data fetching and mutations.
 */
export const ShareProjectWrapper: FC<ShareProjectWrapperProps> = ({
  projectId,
  projectName,
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

  const roles = [
    { value: 'project_admin', label: 'Admin', description: 'Full access' },
    { value: 'project_member', label: 'Member', description: 'Can use agents' },
    { value: 'project_viewer', label: 'Viewer', description: 'Read-only' },
  ];

  const handleAdd = async (principalId: string, principalType: PrincipalType, role: string) => {
    await addPrincipal(principalId, principalType, role);
  };

  return (
    <ShareProjectPage
      projectId={projectId}
      projectName={projectName}
      roles={roles}
      availableMembers={availablePrincipals}
      inheritedAccess={inheritedAccess}
      principals={principals}
      canManage={canManage}
      onAdd={handleAdd}
      onRoleChange={changeRole}
      onRemove={removePrincipal}
      isLoading={isLoading}
      isAdding={isMutating}
    />
  );
};
