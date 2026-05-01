'use client';

import { ProjectRoles } from '@inkeep/agents-core/client-exports';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { type FC, use } from 'react';
import { useIsOrgAdmin } from '@/hooks/use-is-org-admin';
import { useProjectAccess } from './hooks/use-project-access';
import { ResourceMembersPage } from './resource-members-page';

const roles = [
  {
    value: ProjectRoles.ADMIN,
    label: 'Project Admin',
    description: 'Full access to project settings and members',
  },
  {
    value: ProjectRoles.MEMBER,
    label: 'Project Member',
    description: 'Can invoke agents and create API keys',
  },
  {
    value: ProjectRoles.VIEWER,
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
export const ProjectMembersWrapper: FC<PageProps<'/[tenantId]/projects/[projectId]/members'>> = ({
  params,
}) => {
  const { tenantId, projectId } = use(params);
  const { isAdmin: isOrgAdmin } = useIsOrgAdmin();
  const {
    principals,
    availablePrincipals,
    inheritedAccess,
    isLoading,
    isMutating,
    addPrincipal,
    removePrincipal,
    changeRole,
    refetch,
  } = useProjectAccess({ tenantId, projectId });

  return (
    <>
      <ResourceMembersPage
        roles={roles}
        availableMembers={availablePrincipals}
        inheritedAccess={inheritedAccess}
        principals={principals}
        membersConfig={membersConfig}
        onAdd={addPrincipal}
        onRefresh={refetch}
        onRoleChange={changeRole}
        onRemove={removePrincipal}
        isLoading={isLoading}
        isAdding={isMutating}
      />
      {isOrgAdmin && (
        <div className="max-w-xl mx-auto mt-4 text-sm text-muted-foreground">
          Need to invite someone new to the platform?{' '}
          <Link
            href={`/${tenantId}/members`}
            className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
          >
            Open organization members
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        </div>
      )}
    </>
  );
};
