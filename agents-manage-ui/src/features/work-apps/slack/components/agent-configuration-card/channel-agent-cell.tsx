'use client';

import { Check, ChevronDown, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Channel, SlackAgentOption } from './types';

interface ChannelAgentCellProps {
  channel: Channel;
  agents: SlackAgentOption[];
  savingChannel: string | null;
  onSetAgent: (channelId: string, channelName: string, agent: SlackAgentOption) => void;
  onResetToDefault: (channelId: string, channelName: string) => void;
  onToggleGrantAccess: (channelId: string, grantAccess: boolean) => void;
}

export const ChannelAgentCell = memo(function ChannelAgentCell({
  channel,
  agents,
  savingChannel,
  onSetAgent,
  onResetToDefault,
  onToggleGrantAccess,
}: ChannelAgentCellProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  if (savingChannel === channel.id) {
    return (
      <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center justify-end gap-2">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={cn('h-8 min-w-0 max-w-full text-xs')}>
            {channel.agentConfig ? (
              <span className="min-w-0 truncate">{channel.agentConfig.agentName}</span>
            ) : (
              <span className="min-w-0 truncate text-muted-foreground font-light">
                Workspace default
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
                      Reset to workspace default
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                  <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label
                          htmlFor={`grant-access-${channel.id}`}
                          className="flex items-center gap-2 text-xs cursor-pointer"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>Grant access to members</span>
                        </label>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[220px]">
                        When enabled, channel members can use this agent without explicit project
                        access.
                      </TooltipContent>
                    </Tooltip>
                    <Switch
                      id={`grant-access-${channel.id}`}
                      checked={channel.agentConfig?.grantAccessToMembers !== false}
                      onCheckedChange={(checked) => onToggleGrantAccess(channel.id, checked)}
                    />
                  </div>
                  <CommandSeparator />
                </>
              )}
              <CommandGroup>
                {agents.map((agent) => (
                  <CommandItem
                    key={agent.id}
                    value={`${agent.name} ${agent.projectName}`}
                    onSelect={() => {
                      onSetAgent(channel.id, channel.name, agent);
                      setPopoverOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4',
                        channel.agentConfig?.agentId === agent.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{agent.name || agent.id}</span>
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
