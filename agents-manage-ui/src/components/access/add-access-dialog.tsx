'use client';

import { Plus, UserPlus } from 'lucide-react';
import { type FC, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PrincipalAvatar } from './principal-avatar';
import type { AddAccessDialogProps } from './types';
import { getPrincipalTypeLabel } from './types';

export const AddAccessDialog: FC<AddAccessDialogProps> = ({
  availablePrincipals,
  roles,
  onAdd,
  isLoading = false,
  existingPrincipalIds = [],
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [selectedPrincipalId, setSelectedPrincipalId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>(roles[0]?.value || '');

  // Filter out principals who already have access
  const filteredPrincipals = availablePrincipals.filter(
    (principal) => !existingPrincipalIds.includes(principal.id)
  );

  const selectedPrincipal = filteredPrincipals.find((p) => p.id === selectedPrincipalId);
  const selectedRoleLabel = roles.find((r) => r.value === selectedRole)?.label || '';

  const handleSubmit = async () => {
    if (!selectedPrincipal || !selectedRole) return;

    try {
      await onAdd(selectedPrincipal.id, selectedPrincipal.type, selectedRole);
      setOpen(false);
      setSelectedPrincipalId('');
      setSelectedRole(roles[0]?.value || '');
    } catch {
      // Error handling is done in the parent
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || filteredPrincipals.length === 0}>
          <Plus className="size-4 mr-1" />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5" />
            Add Access
          </DialogTitle>
          <DialogDescription>Grant access to a user.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="principal-select">User</Label>
            <Select value={selectedPrincipalId} onValueChange={setSelectedPrincipalId}>
              <SelectTrigger id="principal-select">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {filteredPrincipals.map((principal) => (
                  <SelectItem key={principal.id} value={principal.id}>
                    <div className="flex items-center gap-2">
                      <PrincipalAvatar principal={principal} size="sm" />
                      <span>{principal.displayName}</span>
                      {principal.type !== 'user' && (
                        <span className="text-xs text-muted-foreground">
                          ({getPrincipalTypeLabel(principal.type)})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPrincipal?.subtitle && (
              <p className="text-xs text-muted-foreground">{selectedPrincipal.subtitle}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role-select">Role</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger id="role-select">
                <SelectValue>{selectedRoleLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    <div className="flex flex-col">
                      <span>{role.label}</span>
                      {role.description && (
                        <span className="text-xs text-muted-foreground">{role.description}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedPrincipalId || !selectedRole || isLoading}
          >
            {isLoading ? 'Adding...' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
