'use client';

import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ChannelAccessPopover } from './channel-access-popover';
import type { DefaultAgentConfig, SlackAgentOption } from './types';

interface WorkspaceDefaultSectionProps {
  defaultAgent: DefaultAgentConfig | null;
  agents: SlackAgentOption[];
  loadingAgents: boolean;
  savingDefault: boolean;
  canEdit: boolean;
  onSetDefaultAgent: (agent: SlackAgentOption) => void;
  onToggleGrantAccess: (grantAccess: boolean) => void;
  onRemoveDefaultAgent: () => void;
  onFetchAgents: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkspaceDefaultSection({
  defaultAgent,
  agents,
  loadingAgents,
  savingDefault,
  canEdit,
  onSetDefaultAgent,
  onToggleGrantAccess,
  onRemoveDefaultAgent,
  onFetchAgents,
  open,
  onOpenChange,
}: WorkspaceDefaultSectionProps) {
  const grantAccess = defaultAgent?.grantAccessToMembers ?? true;

  return (
    <div className="space-y-3">
      {canEdit ? (
        <Popover open={open} onOpenChange={onOpenChange}>
          <ButtonGroup className="w-full">
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="min-w-0 grid flex-1 grid-cols-[minmax(0,1fr)_auto] overflow-hidden text-left"
                onClick={() => {
                  if (agents.length === 0) onFetchAgents();
                }}
              >
                {savingDefault ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </span>
                ) : defaultAgent ? (
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{defaultAgent.agentName}</span>
                    <span className="text-gray-400 font-normal dark:text-white/40"> / </span>
                    <span className="text-gray-400 font-normal dark:text-white/40">
                      {defaultAgent.projectName}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Select a default agent...</span>
                )}
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            {defaultAgent && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={onRemoveDefaultAgent}
                    variant="outline"
                    aria-label="Clear model selection"
                    type="button"
                  >
                    <X />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove the default agent for this workspace.</TooltipContent>
              </Tooltip>
            )}
          </ButtonGroup>
          <PopoverContent className="w-full p-0" align="start">
            <Command>
              <CommandInput placeholder="Search agents..." />
              <CommandList>
                <CommandEmpty>
                  {loadingAgents ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading agents...
                    </div>
                  ) : (
                    'No agents found. Create an agent first.'
                  )}
                </CommandEmpty>
                <CommandGroup>
                  {agents.map((agent) => (
                    <CommandItem
                      key={`${agent.id}-${agent.projectId}`}
                      value={`${agent.name} ${agent.projectName}`}
                      onSelect={() => onSetDefaultAgent(agent)}
                    >
                      <Check
                        className={cn(
                          'h-4 w-4',
                          defaultAgent?.agentId === agent.id &&
                            defaultAgent?.projectId === agent.projectId
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium">{agent.name || agent.id}</span>
                        <span className="text-xs text-muted-foreground">{agent.projectName}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : (
        <div className="flex items-center h-11 px-3 rounded-md border bg-muted/50 text-sm">
          {defaultAgent ? (
            <span className="flex items-center gap-2">
              <span className="font-medium">{defaultAgent.agentName}</span>
              <span className="text-gray-400 font-normal dark:text-white/40"> / </span>
              <span className="text-gray-400 font-normal dark:text-white/40">
                {defaultAgent.projectName}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">No default agent configured.</span>
          )}
        </div>
      )}
      {defaultAgent && canEdit && (
        <div className="flex items-center justify-between gap-2 px-1">
          <Label htmlFor="workspace-grant-access">Member Access</Label>
          <ChannelAccessPopover
            grantAccess={grantAccess}
            onToggleGrantAccess={onToggleGrantAccess}
            idPrefix="workspace-grant-access"
          />
        </div>
      )}
    </div>
  );
}
