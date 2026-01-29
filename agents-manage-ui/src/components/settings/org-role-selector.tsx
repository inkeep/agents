'use client';

import { type OrgRole, OrgRoles } from '@inkeep/agents-core/client-exports';
import { ChevronDown } from 'lucide-react';
import type { FC } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ORG_ROLES: { value: OrgRole; label: string; description: string }[] = [
  {
    value: OrgRoles.ADMIN,
    label: 'Admin',
    description: 'Full access to manage organization settings and members',
  },
  {
    value: OrgRoles.MEMBER,
    label: 'Member',
    description: 'Must be added to projects individually with a project role',
  },
];

interface OrgRoleSelectorProps {
  value: OrgRole;
  onChange: (role: OrgRole) => void;
  disabled?: boolean;
  triggerClassName?: string;
}

export const OrgRoleSelector: FC<OrgRoleSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  triggerClassName,
}) => {
  const currentLabel = ORG_ROLES.find((r) => r.value === value)?.label || value;

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
        {ORG_ROLES.map((role) => (
          <DropdownMenuItem
            key={role.value}
            onClick={() => onChange(role.value)}
            className={role.value === value ? 'bg-muted' : ''}
          >
            <div className="flex flex-col">
              <span>{role.label}</span>
              <span className="text-xs text-muted-foreground">{role.description}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
