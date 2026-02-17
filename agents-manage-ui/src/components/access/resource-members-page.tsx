'use client';

import { Loader2, UserPlus, X } from 'lucide-react';
import { type FC, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthSession } from '@/hooks/use-auth';
import { PrincipalAvatar } from './principal-avatar';
import { ProjectRoleSelector } from './project-role-selector';
import type { AccessPrincipal, AccessRole, PrincipalType } from './types';

/**
 * Configuration for the explicit members section
 */
interface MembersConfig {
  title: string;
  description: string;
  emptyMessage: string;
}

/**
 * Configuration for inherited access section
 */
interface InheritedAccessConfig {
  title: string;
  description: string;
  principals: AccessPrincipal[];
}

/**
 * Generic props for the ResourceMembersPage component.
 * This component can be used for any resource type (projects, agents, etc.)
 */
interface ResourceMembersPageProps {
  /** Available roles that can be assigned */
  roles: AccessRole[];
  /** Members available to add (e.g., org members not yet added) */
  availableMembers: AccessPrincipal[];
  /** Configuration for inherited access section (optional) */
  inheritedAccess?: InheritedAccessConfig;
  /** Current explicit members of this resource */
  principals: AccessPrincipal[];
  /** Configuration for the explicit members section */
  membersConfig: MembersConfig;
  /** Whether the current user can manage members */
  canManage: boolean;
  /** Callback when adding a principal */
  onAdd: (principalId: string, principalType: PrincipalType, role: string) => Promise<void>;
  /** Callback to refresh the data */
  onRefresh?: () => Promise<void>;
  /** Callback when changing a principal's role */
  onRoleChange: (
    principalId: string,
    principalType: PrincipalType,
    oldRole: string,
    newRole: string
  ) => Promise<void>;
  /** Callback when removing a principal */
  onRemove: (principalId: string, principalType: PrincipalType, role: string) => Promise<void>;
  /** Loading state */
  isLoading?: boolean;
  /** Adding/mutating state */
  isAdding?: boolean;
}

/**
 * Generic members page component for managing access to any resource.
 * Used by ProjectMembersWrapper, and can be reused for AgentMembersWrapper, etc.
 */
export const ResourceMembersPage: FC<ResourceMembersPageProps> = ({
  roles,
  availableMembers,
  inheritedAccess,
  principals,
  membersConfig,
  canManage,
  onAdd,
  onRefresh,
  onRoleChange,
  onRemove,
  isLoading = false,
  isAdding = false,
}) => {
  const { user } = useAuthSession();
  const [searchOpen, setSearchOpen] = useState(false);

  const canEditPrincipal = (principal: AccessPrincipal): boolean => {
    if (!canManage) return false;
    if (principal.type === 'user' && principal.id === user?.id) return false;
    return true;
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<AccessPrincipal[]>([]);
  const [selectedRole, setSelectedRole] = useState(roles[0]?.value || '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter out already-added principals and already-selected members
  const existingIds = new Set([
    ...principals.map((p) => p.id),
    ...selectedMembers.map((m) => m.id),
  ]);
  const filteredMembers = availableMembers.filter(
    (m) =>
      !existingIds.has(m.id) &&
      (m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.subtitle?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectMember = (member: AccessPrincipal) => {
    setSelectedMembers((prev) => [...prev, member]);
    setSearchQuery('');
    setSearchOpen(false);
  };

  const removeMember = (memberId: string) => {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const handleAdd = async () => {
    if (selectedMembers.length === 0) return;

    for (const member of selectedMembers) {
      await onAdd(member.id, member.type, selectedRole);
    }

    if (onRefresh) {
      await onRefresh();
    }

    setSelectedMembers([]);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      {/* Add Members Section */}
      {canManage && (
        <div className="space-y-3">
          <div className="flex gap-2 items-start">
            {/* Member search with badges */}
            <div className="flex-1 flex items-center gap-2 min-h-10 px-3 py-2 border rounded-md bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              {/* Left side: search icon, badges, input (wraps) */}
              <div className="flex-1 flex items-center flex-wrap gap-1.5 min-w-0">
                {/* Add member icon */}
                <UserPlus className="size-4 text-muted-foreground shrink-0" />

                {/* Selected member badges (after search icon) */}
                <TooltipProvider>
                  {selectedMembers.map((member) => (
                    <Tooltip key={member.id}>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-sm bg-primary/10 text-primary rounded-full">
                          <span className="max-w-[100px] truncate">
                            {member.displayName.split(' ')[0]}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeMember(member.id)}
                            className="hover:text-destructive"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">{member.displayName}</p>
                        {member.subtitle && (
                          <p className="text-xs text-muted-foreground">{member.subtitle}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TooltipProvider>

                {/* Search input with dropdown */}
                <div className="flex-1 min-w-[80px] relative">
                  <input
                    autoComplete="off"
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSearchOpen(true);
                    }}
                    onFocus={() => setSearchOpen(true)}
                    onBlur={() => {
                      // Delay closing to allow click on dropdown items
                      setTimeout(() => setSearchOpen(false), 150);
                    }}
                    placeholder={
                      selectedMembers.length === 0 ? 'Add member by name or email...' : ''
                    }
                    className="w-full bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                  />
                  {/* Dropdown results */}
                  {searchOpen && (
                    <div className="absolute top-full left-0 mt-2 z-50 bg-popover border rounded-md shadow-md min-w-[280px] max-h-[300px] overflow-y-auto">
                      {filteredMembers.length === 0 ? (
                        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                          {searchQuery
                            ? `No member found matching "${searchQuery}"`
                            : 'No members available to add'}
                        </div>
                      ) : (
                        <div className="py-1">
                          {filteredMembers.map((member) => (
                            <button
                              key={member.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault(); // Prevent blur
                                selectMember(member);
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent cursor-pointer"
                            >
                              <PrincipalAvatar principal={member} size="sm" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{member.displayName}</p>
                                {member.subtitle && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {member.subtitle}
                                  </p>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Role selector - fixed on right side */}
              {selectedMembers.length > 0 && (
                <ProjectRoleSelector
                  value={selectedRole as import('@inkeep/agents-core/client-exports').ProjectRole}
                  onChange={(role) => setSelectedRole(role)}
                  triggerClassName="h-7 bg-muted/50 px-2 shrink-0"
                />
              )}
            </div>
            <Button
              onClick={handleAdd}
              disabled={isAdding || selectedMembers.length === 0}
              className="h-10"
            >
              {isAdding ? <Loader2 className="size-4 animate-spin" /> : 'Add'}
            </Button>
          </div>
        </div>
      )}

      {/* Explicit members */}
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{membersConfig.title}</CardTitle>
          <CardDescription className="text-xs">{membersConfig.description}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="divide-y">
            {principals.map((principal) => (
              <div
                key={`${principal.type}-${principal.id}`}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <PrincipalAvatar principal={principal} size="md" />
                  <div>
                    <p className="text-sm font-medium">{principal.displayName}</p>
                    {principal.subtitle && (
                      <p className="text-xs text-muted-foreground">{principal.subtitle}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canEditPrincipal(principal) ? (
                    <ProjectRoleSelector
                      value={
                        principal.role as import('@inkeep/agents-core/client-exports').ProjectRole
                      }
                      onChange={(newRole) =>
                        onRoleChange(principal.id, principal.type, principal.role, newRole)
                      }
                      onRemove={() => onRemove(principal.id, principal.type, principal.role)}
                    />
                  ) : (
                    <Badge variant="code">
                      {roles.find((r) => r.value === principal.role)?.label || principal.role}
                    </Badge>
                  )}
                </div>
              </div>
            ))}

            {principals.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {membersConfig.emptyMessage}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Inherited access */}
      {inheritedAccess && inheritedAccess.principals.length > 0 && (
        <Card className="border-dashed shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{inheritedAccess.title}</CardTitle>
            <CardDescription className="text-xs">{inheritedAccess.description}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y">
              {inheritedAccess.principals.map((principal) => (
                <div
                  key={`inherited-${principal.id}`}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <PrincipalAvatar principal={principal} size="md" />
                    <div>
                      <p className="text-sm font-medium">{principal.displayName}</p>
                      {principal.subtitle && (
                        <p className="text-xs text-muted-foreground">{principal.subtitle}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
