'use client';

import { ChevronDown } from 'lucide-react';
import type { FC } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AccessRole } from './types';

interface AccessRoleDropdownProps {
  currentRole: string;
  roles: AccessRole[];
  onRoleChange: (newRole: string) => void;
  onRemove?: () => void;
  showRemove?: boolean;
  disabled?: boolean;
}

export const AccessRoleDropdown: FC<AccessRoleDropdownProps> = ({
  currentRole,
  roles,
  onRoleChange,
  onRemove,
  showRemove = false,
  disabled = false,
}) => {
  const currentRoleLabel = roles.find((r) => r.value === currentRole)?.label || currentRole;

  // If showRemove, use a dropdown menu with role options + remove
  if (showRemove && onRemove) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground normal-case text-xs"
            disabled={disabled}
          >
            {currentRoleLabel}
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {roles.map((role) => (
            <DropdownMenuItem
              key={role.value}
              onClick={() => onRoleChange(role.value)}
              className={role.value === currentRole ? 'bg-muted' : ''}
            >
              <div className="flex flex-col">
                <span>{role.label}</span>
                {role.description && (
                  <span className="text-xs text-muted-foreground">{role.description}</span>
                )}
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onRemove} className="text-destructive focus:text-destructive">
            Remove access
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Default: use Select
  return (
    <Select value={currentRole} onValueChange={onRoleChange} disabled={disabled}>
      <SelectTrigger className="w-[140px]" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role.value} value={role.value}>
            {role.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
