'use client';

import { Check, ChevronDown, Loader2, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { DefaultAgentConfig, SlackAgentOption } from './types';

interface WorkspaceDefaultSectionProps {
  workspaceName: string;
  defaultAgent: DefaultAgentConfig | null;
  agents: SlackAgentOption[];
  loadingAgents: boolean;
  savingDefault: boolean;
  canEdit: boolean;
  isLoadingAdmin?: boolean;
  channelsUsingDefault: number;
  onSetDefaultAgent: (agent: SlackAgentOption) => void;
  onFetchAgents: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkspaceDefaultSection({
  workspaceName,
  defaultAgent,
  agents,
  loadingAgents,
  savingDefault,
  canEdit,
  isLoadingAdmin = false,
  channelsUsingDefault,
  onSetDefaultAgent,
  onFetchAgents,
  open,
  onOpenChange,
}: WorkspaceDefaultSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center">
        <span className="text-sm font-medium">Workspace Default</span>
        {!canEdit && !isLoadingAdmin && (
          <Tooltip>
            <TooltipTrigger>
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>Only admins can modify workspace defaults</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div>
        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-1">
            <p className="text-sm text-muted-foreground">
              The default agent for all <Badge variant="code">@Inkeep</Badge> mentions and{' '}
              <Badge variant="code">/inkeep</Badge> commands in{' '}
              <span className="font-medium">{workspaceName}</span>.
            </p>
          </div>
        </div>

        <div className="mt-3">
          {canEdit ? (
            <Popover open={open} onOpenChange={onOpenChange}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between h-11 bg-background"
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
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{defaultAgent.agentName}</span>
                      <span className="text-gray-400 font-normal dark:text-white/40"> / </span>
                      <span className="text-gray-400 font-normal dark:text-white/40">
                        {defaultAgent.projectName}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select a default agent...</span>
                  )}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
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
                          key={agent.id}
                          value={`${agent.name} ${agent.projectName}`}
                          onSelect={() => onSetDefaultAgent(agent)}
                          className="py-3"
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              defaultAgent?.agentId === agent.id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <div className="flex flex-col">
                            <span className="font-medium">{agent.name || agent.id}</span>
                            <span className="text-xs text-muted-foreground">
                              {agent.projectName}
                            </span>
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
        </div>

        {defaultAgent && (
          <p className="text-xs text-muted-foreground mt-2">
            Used by {channelsUsingDefault} channel
            {channelsUsingDefault !== 1 ? 's' : ''}.
          </p>
        )}
      </div>
    </div>
  );
}
