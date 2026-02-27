'use client';

import { Check, ChevronDown, Loader2, RotateCcw } from 'lucide-react';
import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Channel, SlackAgentOption } from './types';
import { getAgentDisplayName } from './types';

interface ChannelAgentCellProps {
  channel: Channel;
  agents: SlackAgentOption[];
  savingChannel: string | null;
  hasWorkspaceDefault: boolean;
  onSetAgent: (channelId: string, channelName: string, agent: SlackAgentOption) => void;
  onResetToDefault: (channelId: string, channelName: string) => void;
}

export const ChannelAgentCell = memo(function ChannelAgentCell({
  channel,
  agents,
  savingChannel,
  hasWorkspaceDefault,
  onSetAgent,
  onResetToDefault,
}: ChannelAgentCellProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const isSaving = savingChannel === channel.id;

  const { agentId, projectId } = channel.agentConfig ?? {};

  return (
    <div className="flex min-w-0 items-center justify-end gap-1">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-8 min-w-0 max-w-full text-xs')}
            disabled={isSaving}
          >
            {isSaving && <Loader2 className="h-3! w-3! animate-spin" />}
            {channel.agentConfig && agentId && projectId ? (
              <span className="min-w-0 truncate">
                {getAgentDisplayName(agents, agentId, projectId)}
              </span>
            ) : hasWorkspaceDefault ? (
              <span className="min-w-0 truncate text-muted-foreground font-light">
                Workspace default
              </span>
            ) : (
              <span className="min-w-0 truncate text-amber-600 dark:text-amber-400 font-light">
                No agent
              </span>
            )}
            <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="end">
          <Command>
            <CommandInput placeholder="Search agents..." />
            <CommandList>
              <CommandEmpty>No agents found.</CommandEmpty>
              {channel.hasAgentConfig && (
                <>
                  <CommandGroup>
                    <CommandItem
                      value="Reset to workspace default"
                      onSelect={() => {
                        onResetToDefault(channel.id, channel.name);
                        setPopoverOpen(false);
                      }}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset to workspace default{!hasWorkspaceDefault && ' (not set)'}
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}
              <CommandGroup>
                {agents.map((agent) => (
                  <CommandItem
                    key={`${agent.id}-${agent.projectId}`}
                    value={`${agent.name} ${agent.projectName}`}
                    onSelect={() => {
                      onSetAgent(channel.id, channel.name, agent);
                      setPopoverOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4',
                        agentId === agent.id && projectId === agent.projectId
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="font-medium">{agent.name}</span>
                      <span className="text-xs text-muted-foreground">{agent.projectName}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
});
