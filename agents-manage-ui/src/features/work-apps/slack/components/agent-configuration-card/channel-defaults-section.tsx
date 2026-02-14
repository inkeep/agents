'use client';

import { Globe, Hash, Loader2, Lock, type LucideIcon, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { BulkSelectAgentBar } from './bulk-select-agent-bar';
import { ChannelAgentCell } from './channel-agent-cell';
import type { Channel, SlackAgentOption } from './types';

interface ChannelFilterProps {
  isSelected: boolean;
  onClick: () => void;
  count: number;
  label: string;
  Icon?: LucideIcon;
}

function ChannelFilter({ isSelected, onClick, count, label, Icon }: ChannelFilterProps) {
  return (
    <Button
      variant={isSelected ? 'outline-primary' : 'outline'}
      size="sm"
      className={cn(
        'h-7 px-2.5 text-1sm rounded-full border',
        isSelected ? 'bg-primary/5 text-primary' : 'shadow-none hover:bg-muted/50'
      )}
      onClick={onClick}
    >
      {Icon && <Icon className="h-3 w-3 opacity-60" />}
      {label}
      <span
        className={cn(
          isSelected ? 'text-primary' : 'text-muted-foreground/60',
          'font-mono tabular-nums text-xs ml-1'
        )}
      >
        {count}
      </span>
    </Button>
  );
}

interface ChannelDefaultsSectionProps {
  channels: Channel[];
  filteredChannels: Channel[];
  loadingChannels: boolean;
  channelsWithCustomAgent: Channel[];
  channelFilter: 'all' | 'private' | 'connect';
  channelSearchQuery: string;
  selectedChannels: Set<string>;
  agents: SlackAgentOption[];
  savingChannel: string | null;
  bulkSaving: boolean;
  isAdmin: boolean;
  onChannelFilterChange: (filter: 'all' | 'private' | 'connect') => void;
  onSearchQueryChange: (query: string) => void;
  onToggleChannel: (channelId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSetChannelAgent: (channelId: string, channelName: string, agent: SlackAgentOption) => void;
  onResetChannelToDefault: (channelId: string, channelName: string) => void;
  onBulkSetAgent: (agent: SlackAgentOption) => void;
  onBulkResetToDefault: () => void;
  onClearFilters: () => void;
}

export function ChannelDefaultsSection({
  channels,
  filteredChannels,
  loadingChannels,
  channelsWithCustomAgent,
  channelFilter,
  channelSearchQuery,
  selectedChannels,
  agents,
  savingChannel,
  bulkSaving,
  isAdmin,
  onChannelFilterChange,
  onSearchQueryChange,
  onToggleChannel,
  onSelectAll,
  onClearSelection,
  onSetChannelAgent,
  onResetChannelToDefault,
  onBulkSetAgent,
  onBulkResetToDefault,
  onClearFilters,
}: ChannelDefaultsSectionProps) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-muted-foreground" />
          <span className="text-base font-medium">Channel Defaults</span>
          {channelsWithCustomAgent.length > 0 && (
            <Badge variant="count">{channelsWithCustomAgent.length}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Set a default agent for individual channels instead of using the workspace default.
          {!isAdmin && <> You can configure channels you&apos;re a member of.</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {channels.length > 0 && (
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <ChannelFilter
                isSelected={channelFilter === 'all'}
                onClick={() => onChannelFilterChange('all')}
                count={channels.length}
                label="All"
              />
              <ChannelFilter
                isSelected={channelFilter === 'private'}
                onClick={() => onChannelFilterChange('private')}
                count={channels.filter((c) => c.isPrivate).length}
                label="Private"
                Icon={Lock}
              />
              <ChannelFilter
                isSelected={channelFilter === 'connect'}
                onClick={() => onChannelFilterChange('connect')}
                count={channels.filter((c) => c.isShared).length}
                label="Slack Connect"
                Icon={Globe}
              />
            </div>
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-white/40" />
              <Input
                placeholder="Search channels..."
                value={channelSearchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                className="pl-8 pr-8"
              />
              {channelSearchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSearchQueryChange('')}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-accent"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )}

        {loadingChannels && channels.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin mr-2 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading channels...</span>
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">
              No channels found. Make sure the bot is invited to channels.
            </p>
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">
              {channelSearchQuery.trim()
                ? `No channels match "${channelSearchQuery.trim()}"`
                : `No ${channelFilter} channels found.`}
            </p>
            <Button variant="link" size="sm" className="text-xs mt-1" onClick={onClearFilters}>
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table
              className="table-fixed border-collapse bg-background rounded-lg"
              containerClassName="max-h-[500px] overflow-auto scrollbar-thin"
            >
              <colgroup>
                <col className="w-10" />
                <col style={{ width: '50%' }} />
                <col className="w-28" />
                <col className="w-24" />
                <col className="w-40" />
              </colgroup>
              <TableHeader className="sticky top-0 z-10 [&_tr]:bg-background [&_th]:border-b [&_th]:border-border [&_tr]:shadow-[0_1px_0_0_var(--border)]">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-fit">
                    <Checkbox
                      checked={
                        selectedChannels.size === filteredChannels.length &&
                        filteredChannels.length > 0
                          ? true
                          : selectedChannels.size > 0
                            ? 'indeterminate'
                            : false
                      }
                      onCheckedChange={onSelectAll}
                      aria-label="Select all channels"
                    />
                  </TableHead>
                  {selectedChannels.size > 0 ? (
                    <TableHead colSpan={4} className="font-sans normal-case py-1.5">
                      <BulkSelectAgentBar
                        selectedCount={selectedChannels.size}
                        agents={agents}
                        bulkSaving={bulkSaving}
                        onBulkSetAgent={onBulkSetAgent}
                        onBulkResetToDefault={onBulkResetToDefault}
                        onClearSelection={onClearSelection}
                      />
                    </TableHead>
                  ) : (
                    <>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="w-fit text-right">Members</TableHead>
                      <TableHead className="text-right">Agent</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredChannels.map((channel) => (
                  <TableRow
                    key={channel.id}
                    data-state={selectedChannels.has(channel.id) ? 'selected' : ''}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedChannels.has(channel.id)}
                        onCheckedChange={() => onToggleChannel(channel.id)}
                        aria-label={`Select ${channel.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="flex min-w-0 items-center gap-2 font-medium text-sm">
                        {channel.isShared ? (
                          <Globe
                            aria-hidden="true"
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          />
                        ) : channel.isPrivate ? (
                          <Lock
                            aria-hidden="true"
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          />
                        ) : (
                          <Hash
                            aria-hidden="true"
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          />
                        )}
                        <span className="min-w-0 truncate">{channel.name}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      {channel.isShared ? (
                        <Badge variant="primary" className="uppercase">
                          Slack Connect
                        </Badge>
                      ) : channel.isPrivate ? (
                        <Badge className="uppercase" variant="violet">
                          Private
                        </Badge>
                      ) : (
                        <Badge variant="code" className="uppercase">
                          Public
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {channel.memberCount !== undefined ? (
                        <span className="text-muted-foreground text-sm font-mono tabular-nums">
                          {channel.memberCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <ChannelAgentCell
                        channel={channel}
                        agents={agents}
                        savingChannel={savingChannel}
                        onSetAgent={onSetChannelAgent}
                        onResetToDefault={onResetChannelToDefault}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
