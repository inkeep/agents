'use client';

import type { OrgRole } from '@inkeep/agents-core/client-exports';
import { ChevronDown } from 'lucide-react';
import type { FC } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ROLE_OPTIONS } from './types';

interface OrgRoleSelectorProps {
  value: OrgRole;
  onChange: (role: OrgRole) => void;
  disabled?: boolean;
  triggerClassName?: string;
  isRoleDisabled?: (role: OrgRole) => boolean;
}

export const OrgRoleSelector: FC<OrgRoleSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  triggerClassName,
  isRoleDisabled,
}) => {
  const currentLabel = ROLE_OPTIONS.find((r) => r.value === value)?.label || value;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`gap-1 normal-case text-xs justify-between ${triggerClassName || ''}`}
          disabled={disabled}
        >
          {currentLabel}
          <ChevronDown className="size-3 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[300px]">
        {ROLE_OPTIONS.map((role) => {
          const roleDisabled = isRoleDisabled?.(role.value) ?? false;
          return (
            <DropdownMenuItem
              key={role.value}
              onClick={() => !roleDisabled && onChange(role.value)}
              className={`${role.value === value ? 'bg-muted' : ''} ${roleDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={roleDisabled}
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span>{role.label}</span>
                  {roleDisabled && (
                    <span className="text-[10px] text-destructive font-medium">
                      Seat limit reached
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{role.description}</span>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
