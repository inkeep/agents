'use client';

import { type ProjectRole, ProjectRoles } from '@inkeep/agents-core/client-exports';
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

const PROJECT_ROLES: { value: ProjectRole; label: string; description: string }[] = [
  { value: ProjectRoles.ADMIN, label: 'Admin', description: 'Full access to manage the project' },
  { value: ProjectRoles.MEMBER, label: 'Member', description: 'Can use agents in the project' },
  { value: ProjectRoles.VIEWER, label: 'Viewer', description: 'Can view the project' },
];

export const getProjectRoleLabel = (role: ProjectRole): string => {
  return PROJECT_ROLES.find((r) => r.value === role)?.label || role;
};

interface ProjectRoleSelectorProps {
  value: ProjectRole;
  onChange: (role: ProjectRole) => void;
  onRemove?: () => void;
  disabled?: boolean;
  /** Additional trigger classes */
  triggerClassName?: string;
}

export const ProjectRoleSelector: FC<ProjectRoleSelectorProps> = ({
  value,
  onChange,
  onRemove,
  disabled = false,
  triggerClassName,
}) => {
  const currentLabel = PROJECT_ROLES.find((r) => r.value === value)?.label || value;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`gap-1 text-muted-foreground normal-case text-xs ${triggerClassName || ''}`}
          disabled={disabled}
        >
          {currentLabel}
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PROJECT_ROLES.map((role) => (
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
        {onRemove && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onRemove}
              className="text-destructive focus:text-destructive"
            >
              Remove access
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
