'use client';

import { Loader2, Search, X } from 'lucide-react';
import { type FC, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AccessRoleDropdown } from './access-role-dropdown';
import { PrincipalAvatar } from './principal-avatar';
import type { AccessPrincipal, AccessRole, PrincipalType } from './types';

interface ShareProjectPageProps {
  projectId: string;
  projectName?: string;
  roles: AccessRole[];
  availableMembers: AccessPrincipal[];
  inheritedAccess?: {
    title: string;
    description: string;
    principals: AccessPrincipal[];
  };
  principals: AccessPrincipal[];
  canManage: boolean;
  onAdd: (principalId: string, principalType: PrincipalType, role: string) => Promise<void>;
  onRoleChange: (principalId: string, principalType: PrincipalType, oldRole: string, newRole: string) => void;
  onRemove: (principalId: string, principalType: PrincipalType, role: string) => void;
  isLoading?: boolean;
  isAdding?: boolean;
}

export const ShareProjectPage: FC<ShareProjectPageProps> = ({
  projectId: _projectId,
  projectName: _projectName,
  roles,
  availableMembers,
  inheritedAccess,
  principals,
  canManage,
  onAdd,
  onRoleChange,
  onRemove,
  isLoading = false,
  isAdding = false,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<AccessPrincipal[]>([]);
  const [selectedRole, setSelectedRole] = useState(roles[0]?.value || 'project_member');
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter out already-added principals and already-selected members
  const existingIds = new Set([...principals.map((p) => p.id), ...selectedMembers.map((m) => m.id)]);
  const filteredMembers = availableMembers.filter(
    (m) => !existingIds.has(m.id) && 
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
    setSelectedMembers([]);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Members Section */}
      {canManage && (
        <div className="space-y-3">
          <div className="flex gap-2 items-start">
            {/* Member search with badges */}
            <div className="flex-1 flex items-center flex-wrap gap-1.5 min-h-10 px-3 py-2 border rounded-md bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              {/* Selected member badges */}
              <TooltipProvider>
                {selectedMembers.map((member) => (
                  <Tooltip key={member.id}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 text-sm bg-primary/10 text-primary rounded-full">
                        <PrincipalAvatar principal={member} size="xs" />
                        <span className="max-w-[100px] truncate">{member.displayName.split(' ')[0]}</span>
                        <button
                          type="button"
                          onClick={() => removeMember(member.id)}
                          className="hover:text-destructive ml-0.5"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{member.displayName}</p>
                      {member.subtitle && <p className="text-xs text-muted-foreground">{member.subtitle}</p>}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>

              {/* Search input with dropdown */}
              <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                <PopoverTrigger asChild>
                  <div className="flex-1 min-w-[150px] flex items-center gap-2">
                    <Search className="size-4 text-muted-foreground" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (e.target.value.length > 0) setSearchOpen(true);
                      }}
                      onFocus={() => searchQuery.length > 0 && setSearchOpen(true)}
                      placeholder={selectedMembers.length === 0 ? 'Search members...' : ''}
                      className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                    />
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandList>
                      <CommandEmpty>No members found.</CommandEmpty>
                      <CommandGroup>
                        {filteredMembers.slice(0, 10).map((member) => (
                          <CommandItem
                            key={member.id}
                            value={member.id}
                            onSelect={() => selectMember(member)}
                            className="flex items-center gap-3 cursor-pointer"
                          >
                            <PrincipalAvatar principal={member} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{member.displayName}</p>
                              {member.subtitle && (
                                <p className="text-xs text-muted-foreground truncate">{member.subtitle}</p>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Role selector (appears when there are selected members) */}
              {selectedMembers.length > 0 && (
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className="w-auto h-7 border-0 bg-muted/50 text-xs gap-1 px-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
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

      {/* Inherited org access */}
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

      {/* Project members */}
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Project Members</CardTitle>
          <CardDescription className="text-xs">
            Users with direct access to this project
          </CardDescription>
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
                  {canManage ? (
                    <AccessRoleDropdown
                      currentRole={principal.role}
                      roles={roles}
                      onRoleChange={(newRole) => onRoleChange(principal.id, principal.type, principal.role, newRole)}
                      onRemove={() => onRemove(principal.id, principal.type, principal.role)}
                      showRemove
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {roles.find((r) => r.value === principal.role)?.label || principal.role}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {principals.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No project members yet. Add members above to grant them access.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
