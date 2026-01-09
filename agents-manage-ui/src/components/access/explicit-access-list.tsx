'use client';

import { Trash2 } from 'lucide-react';
import { type FC, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AccessRoleDropdown } from './access-role-dropdown';
import { AddAccessDialog } from './add-access-dialog';
import { PrincipalAvatar } from './principal-avatar';
import type { AccessPrincipal, ExplicitAccessListProps } from './types';
import { getPrincipalTypeLabel } from './types';

export const ExplicitAccessList: FC<ExplicitAccessListProps> = ({
  title,
  description,
  emptyMessage,
  principals,
  roles,
  availablePrincipals,
  canManage,
  onAdd,
  onRoleChange,
  onRemove,
  isAdding = false,
  isUpdating = false,
  isRemoving = false,
}) => {
  const [principalToRemove, setPrincipalToRemove] = useState<AccessPrincipal | null>(null);

  const handleRemove = async () => {
    if (!principalToRemove) return;
    try {
      await onRemove(principalToRemove.id, principalToRemove.type, principalToRemove.role);
      setPrincipalToRemove(null);
    } catch {
      // Error handling done in parent
    }
  };

  const existingPrincipalIds = principals.map((p) => p.id);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <CardDescription className="text-xs">{description}</CardDescription>
          {canManage && (
            <CardAction>
              <AddAccessDialog
                availablePrincipals={availablePrincipals}
                roles={roles}
                onAdd={onAdd}
                isLoading={isAdding}
                existingPrincipalIds={existingPrincipalIds}
              />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {principals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{emptyMessage}</p>
          ) : (
            <div className="space-y-3">
              {principals.map((principal) => (
                <div
                  key={`${principal.type}-${principal.id}`}
                  className="flex items-center justify-between gap-4 py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PrincipalAvatar principal={principal} size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{principal.displayName}</p>
                        {principal.type !== 'user' && (
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {getPrincipalTypeLabel(principal.type)}
                          </span>
                        )}
                      </div>
                      {principal.subtitle && (
                        <p className="text-xs text-muted-foreground truncate">
                          {principal.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canManage ? (
                      <>
                        <AccessRoleDropdown
                          currentRole={principal.role}
                          roles={roles}
                          onRoleChange={(newRole) =>
                            onRoleChange(principal.id, principal.type, principal.role, newRole)
                          }
                          disabled={isUpdating}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setPrincipalToRemove(principal)}
                          disabled={isRemoving}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {roles.find((r) => r.value === principal.role)?.label || principal.role}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remove confirmation dialog */}
      <AlertDialog open={!!principalToRemove} onOpenChange={() => setPrincipalToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove access</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove access for{' '}
              <strong>{principalToRemove?.displayName}</strong>
              {principalToRemove?.type === 'group' && ' and all its members'}? They will no longer
              have access to this resource.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
