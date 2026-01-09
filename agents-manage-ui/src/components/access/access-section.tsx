'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import type { FC } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ExplicitAccessList } from './explicit-access-list';
import { InheritedAccessCard } from './inherited-access-card';
import type { AccessSectionProps } from './types';

/**
 * AccessSection is a generic, reusable component for managing access to any resource.
 * It's a pure presentation component - all data fetching and mutations
 * should be handled by the parent component.
 *
 * Supports multiple principal types:
 * - Users
 * - Groups
 * - Service Accounts
 * - Agents
 * - Workflows
 *
 * Usage:
 * - For projects: Use ProjectAccessWrapper which handles project-specific API calls
 * - For other resources: Create a similar wrapper that provides the right data/callbacks
 */
export const AccessSection: FC<AccessSectionProps> = ({
  isLoading = false,
  error,
  roles,
  inheritedAccess,
  explicitAccessConfig,
  principals,
  availablePrincipals,
  canManage,
  onAddPrincipal,
  onRemovePrincipal,
  onChangeRole,
  isMutating = false,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {inheritedAccess && <InheritedAccessCard config={inheritedAccess} />}
      <ExplicitAccessList
        title={explicitAccessConfig.title}
        description={explicitAccessConfig.description}
        emptyMessage={explicitAccessConfig.emptyMessage}
        principals={principals}
        roles={roles}
        availablePrincipals={availablePrincipals}
        canManage={canManage}
        onAdd={onAddPrincipal}
        onRoleChange={onChangeRole}
        onRemove={onRemovePrincipal}
        isAdding={isMutating}
        isUpdating={isMutating}
        isRemoving={isMutating}
      />
    </div>
  );
};
