'use client';

import { ChevronDown, Loader2, RotateCcw, X } from 'lucide-react';
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
import type { SlackAgentOption } from './types';

interface BulkSelectAgentBarProps {
  selectedCount: number;
  agents: SlackAgentOption[];
  bulkSaving: boolean;
  onBulkSetAgent: (agent: SlackAgentOption) => void;
  onBulkResetToDefault: () => void;
  onClearSelection: () => void;
}

export const BulkSelectAgentBar = memo(function BulkSelectAgentBar({
  selectedCount,
  agents,
  bulkSaving,
  onBulkSetAgent,
  onBulkResetToDefault,
  onClearSelection,
}: BulkSelectAgentBarProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  return (
    <div className="flex items-center gap-4 justify-between text-sm">
      <div className="flex items-center gap-2">
        <span className="min-w-3.5 font-mono font-medium tabular-nums">{selectedCount}</span>
        <span className="text-muted-foreground">selected</span>
      </div>
      <div className="flex items-center gap-2">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-muted-foreground"
              disabled={bulkSaving}
            >
              {bulkSaving && <Loader2 className="h-3 w-3 animate-spin" />}
              Select Agent
              <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="end">
            <Command>
              <CommandInput placeholder="Search agents..." />
              <CommandList>
                <CommandEmpty>No agents found.</CommandEmpty>

                <CommandGroup>
                  <CommandItem
                    value="Reset to workspace default"
                    onSelect={() => {
                      onBulkResetToDefault();
                      setPopoverOpen(false);
                    }}
                    disabled={bulkSaving}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset to workspace default
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup>
                  {agents.map((agent) => (
                    <CommandItem
                      key={`${agent.id}-${agent.projectId}`}
                      value={`${agent.name} ${agent.projectName}`}
                      onSelect={() => {
                        onBulkSetAgent(agent);
                        setPopoverOpen(false);
                      }}
                    >
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
        <Button size="icon-sm" variant="ghost" onClick={onClearSelection} disabled={bulkSaving}>
          <X className="h-3 w-3" />
          <span className="sr-only">Cancel</span>
        </Button>
      </div>
    </div>
  );
});
