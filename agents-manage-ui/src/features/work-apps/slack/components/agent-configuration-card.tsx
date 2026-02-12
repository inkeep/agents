'use client';

import {
  Bot,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Globe,
  Hash,
  Loader2,
  Lock,
  RefreshCw,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsOrgAdmin } from '@/hooks/use-is-org-admin';
import { cn } from '@/lib/utils';
import { getAllAgentsForSlack, type SlackAgentOption } from '../actions/agents';
import { slackApi } from '../api/slack-api';
import { useSlack } from '../context/slack-provider';

interface Channel {
  id: string;
  name: string;
  isPrivate: boolean;
  isShared?: boolean;
  memberCount?: number;
  hasAgentConfig: boolean;
  agentConfig?: {
    projectId: string;
    agentId: string;
    agentName?: string;
  };
}

interface DefaultAgentConfig {
  agentId: string;
  agentName?: string;
  projectId: string;
  projectName?: string;
}

export function AgentConfigurationCard() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { installedWorkspaces, actions } = useSlack();
  const { isAdmin, isLoading: isLoadingAdmin } = useIsOrgAdmin();

  const [agents, setAgents] = useState<SlackAgentOption[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [savingChannel, setSavingChannel] = useState<string | null>(null);
  const [defaultAgent, setDefaultAgent] = useState<DefaultAgentConfig | null>(null);
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [channelPopovers, setChannelPopovers] = useState<Record<string, boolean>>({});
  const [channelsExpanded, setChannelsExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [bulkPopoverOpen, setBulkPopoverOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [channelFilter, setChannelFilter] = useState<'all' | 'private' | 'connect'>('all');

  const firstWorkspace = installedWorkspaces.data[0];
  const teamId = firstWorkspace?.teamId;
  const workspaceName = firstWorkspace?.teamName || 'your workspace';
  const canEditWorkspaceDefault = isAdmin;

  const filteredChannels = channels.filter((c) => {
    if (channelFilter === 'private') return c.isPrivate;
    if (channelFilter === 'connect') return c.isShared;
    return true;
  });

  const channelsWithCustomAgent = filteredChannels.filter((c) => c.hasAgentConfig);
  const channelsUsingDefault = filteredChannels.filter((c) => !c.hasAgentConfig);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally clear selections when filter changes
  useEffect(() => {
    setSelectedChannels(new Set());
  }, [channelFilter]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchAgents = useCallback(async () => {
    setLoadingAgents(true);
    try {
      const result = await getAllAgentsForSlack(tenantId);
      if (result.success) {
        setAgents(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch agents:', error);
    } finally {
      setLoadingAgents(false);
    }
  }, [tenantId]);

  const fetchChannels = useCallback(async () => {
    if (!teamId) return;
    setLoadingChannels(true);
    try {
      const result = await slackApi.listChannels(teamId);
      setChannels(result.channels);
    } catch (error) {
      console.error('Failed to fetch channels:', error);
    } finally {
      setLoadingChannels(false);
    }
  }, [teamId]);

  const fetchWorkspaceSettings = useCallback(async () => {
    if (!teamId) return;
    try {
      const settings = await slackApi.getWorkspaceSettings(teamId);
      if (settings.defaultAgent) {
        setDefaultAgent(settings.defaultAgent);
      }
    } catch {
      console.log('No saved workspace settings found');
    }
  }, [teamId]);

  useEffect(() => {
    if (teamId && mounted) {
      fetchAgents();
      fetchChannels();
      fetchWorkspaceSettings();
    }
  }, [teamId, mounted, fetchAgents, fetchChannels, fetchWorkspaceSettings]);

  const handleSetDefaultAgent = async (agent: SlackAgentOption) => {
    if (!teamId) return;

    const config: DefaultAgentConfig = {
      agentId: agent.id,
      agentName: agent.name || agent.id,
      projectId: agent.projectId,
      projectName: agent.projectName || 'Unknown Project',
    };

    setDefaultAgent(config);
    setDefaultOpen(false);
    setSavingDefault(true);

    try {
      await slackApi.setWorkspaceDefaultAgent({
        teamId,
        defaultAgent: config,
      });

      installedWorkspaces.refetch();
      actions.setNotification({
        type: 'success',
        message: `Default agent set to "${config.agentName}"`,
        action: 'connected',
      });
    } catch (error) {
      console.error('Failed to save default agent:', error);
      actions.setNotification({
        type: 'error',
        message: 'Failed to save default agent',
        action: 'error',
      });
    } finally {
      setSavingDefault(false);
    }
  };

  const handleSetChannelAgent = async (
    channelId: string,
    channelName: string,
    agent: SlackAgentOption
  ) => {
    if (!teamId) return;

    setSavingChannel(channelId);
    setChannelPopovers((prev) => ({ ...prev, [channelId]: false }));

    const config = {
      projectId: agent.projectId,
      agentId: agent.id,
      agentName: agent.name || agent.id,
    };

    try {
      await slackApi.setChannelDefaultAgent({
        teamId,
        channelId,
        agentConfig: config,
        channelName,
      });

      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === channelId ? { ...ch, hasAgentConfig: true, agentConfig: config } : ch
        )
      );

      actions.setNotification({
        type: 'success',
        message: `#${channelName} now uses "${config.agentName}"`,
        action: 'connected',
      });
    } catch (error) {
      console.error('Failed to set channel agent:', error);
      const errorMessage =
        error instanceof Error && error.message.includes('forbidden')
          ? `You can only configure channels you're a member of`
          : 'Failed to set channel agent';
      actions.setNotification({
        type: 'error',
        message: errorMessage,
        action: 'error',
      });
    } finally {
      setSavingChannel(null);
    }
  };

  const handleResetChannelToDefault = async (channelId: string, channelName: string) => {
    if (!teamId) return;

    setSavingChannel(channelId);

    try {
      await slackApi.removeChannelConfig(teamId, channelId);

      setChannels((prev) =>
        prev.map((ch) =>
          ch.id === channelId ? { ...ch, hasAgentConfig: false, agentConfig: undefined } : ch
        )
      );

      actions.setNotification({
        type: 'success',
        message: `#${channelName} now uses the workspace default`,
        action: 'connected',
      });
    } catch (error) {
      console.error('Failed to reset channel:', error);
      const errorMessage =
        error instanceof Error && error.message.includes('forbidden')
          ? `You can only configure channels you're a member of`
          : 'Failed to reset channel to default';
      actions.setNotification({
        type: 'error',
        message: errorMessage,
        action: 'error',
      });
    } finally {
      setSavingChannel(null);
    }
  };

  const handleToggleChannel = (channelId: string) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedChannels.size === filteredChannels.length) {
      setSelectedChannels(new Set());
    } else {
      setSelectedChannels(new Set(filteredChannels.map((c) => c.id)));
    }
  };

  const handleBulkSetAgent = async (agent: SlackAgentOption) => {
    if (!teamId || selectedChannels.size === 0) return;

    setBulkSaving(true);
    setBulkPopoverOpen(false);

    try {
      const result = await slackApi.bulkSetChannelAgents(teamId, Array.from(selectedChannels), {
        projectId: agent.projectId,
        agentId: agent.id,
        agentName: agent.name || agent.id,
      });

      setChannels((prev) =>
        prev.map((ch) =>
          selectedChannels.has(ch.id)
            ? {
                ...ch,
                hasAgentConfig: true,
                agentConfig: {
                  projectId: agent.projectId,
                  agentId: agent.id,
                  agentName: agent.name || agent.id,
                },
              }
            : ch
        )
      );

      setSelectedChannels(new Set());
      toast.success(`Updated ${result.updated} channel${result.updated !== 1 ? 's' : ''}`);

      if (result.failed > 0) {
        toast.error(`Failed to update ${result.failed} channel${result.failed !== 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error('Bulk update failed:', error);
      toast.error('Failed to update channels');
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkResetToDefault = async () => {
    if (!teamId || selectedChannels.size === 0) return;

    setBulkSaving(true);

    try {
      const result = await slackApi.bulkRemoveChannelConfigs(teamId, Array.from(selectedChannels));

      setChannels((prev) =>
        prev.map((ch) =>
          selectedChannels.has(ch.id)
            ? { ...ch, hasAgentConfig: false, agentConfig: undefined }
            : ch
        )
      );

      setSelectedChannels(new Set());
      toast.success(`Reset ${result.removed} channel${result.removed !== 1 ? 's' : ''} to default`);
    } catch (error) {
      console.error('Bulk reset failed:', error);
      toast.error('Failed to reset channels');
    } finally {
      setBulkSaving(false);
    }
  };

  if (!teamId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Agent Configuration
          </CardTitle>
          <CardDescription>
            Configure which AI agents respond in your Slack workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Bot className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground max-w-[280px]">
              Install the Slack app to a workspace first to configure agents.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Agent Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-16 bg-muted rounded-lg" />
            <div className="h-12 bg-muted rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Agent Configuration
            </CardTitle>
            <CardDescription className="mt-1.5">
              Configure which AI agents respond to @mentions and commands
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              fetchAgents();
              fetchChannels();
              fetchWorkspaceSettings();
            }}
            disabled={loadingAgents || loadingChannels}
            aria-label="Refresh agent and channel data"
            title="Refresh"
          >
            {loadingAgents || loadingChannels ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Workspace Default Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Workspace Default</span>
            {!canEditWorkspaceDefault && !isLoadingAdmin && (
              <Tooltip>
                <TooltipTrigger>
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>Only admins can modify workspace defaults</TooltipContent>
              </Tooltip>
            )}
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-start gap-4">
              <div className="flex-1 space-y-1">
                <p className="text-sm text-muted-foreground">
                  The default agent for all @Inkeep mentions and /inkeep commands in{' '}
                  <strong>{workspaceName}</strong>
                </p>
              </div>
            </div>

            <div className="mt-3">
              {canEditWorkspaceDefault ? (
                <Popover open={defaultOpen} onOpenChange={setDefaultOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between h-11 bg-background"
                      onClick={() => {
                        if (agents.length === 0) fetchAgents();
                      }}
                    >
                      {savingDefault ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </span>
                      ) : defaultAgent ? (
                        <span className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-primary" />
                          <span className="font-medium">{defaultAgent.agentName}</span>
                          <span className="text-muted-foreground text-xs">
                            · {defaultAgent.projectName}
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
                              onSelect={() => handleSetDefaultAgent(agent)}
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
                      <Bot className="h-4 w-4 text-primary" />
                      <span className="font-medium">{defaultAgent.agentName}</span>
                      <span className="text-muted-foreground text-xs">
                        · {defaultAgent.projectName}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No default agent configured</span>
                  )}
                </div>
              )}
            </div>

            {defaultAgent && (
              <p className="text-xs text-muted-foreground mt-2">
                {channelsUsingDefault.length} channel
                {channelsUsingDefault.length !== 1 ? 's' : ''} using this default
              </p>
            )}
          </div>
        </div>

        <Separator />

        {/* Channel Defaults Section */}
        <Collapsible open={channelsExpanded} onOpenChange={setChannelsExpanded}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center justify-between w-full group hover:bg-muted/50 -mx-2 px-2 py-2 rounded-md transition-colors"
            >
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Channel Defaults</span>
                {channelsWithCustomAgent.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {channelsWithCustomAgent.length}
                  </Badge>
                )}
              </div>
              <ChevronRight
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform duration-200',
                  channelsExpanded && 'rotate-90'
                )}
              />
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground mb-3">
              Set a default agent for individual channels instead of using the workspace default.
              {!isAdmin && <> You can configure channels you&apos;re a member of.</>}
            </p>

            {/* Channel Type Filters */}
            {channels.length > 0 && (
              <div className="flex items-center gap-1 mb-3">
                <span className="text-xs text-muted-foreground mr-2">Filter:</span>
                <Button
                  variant={channelFilter === 'all' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => setChannelFilter('all')}
                >
                  All
                  <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[10px]">
                    {channels.length}
                  </Badge>
                </Button>
                <Button
                  variant={channelFilter === 'private' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => setChannelFilter('private')}
                >
                  <Lock className="h-3 w-3 mr-1" />
                  Private
                  <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[10px]">
                    {channels.filter((c) => c.isPrivate).length}
                  </Badge>
                </Button>
                <Button
                  variant={channelFilter === 'connect' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => setChannelFilter('connect')}
                >
                  <Globe className="h-3 w-3 mr-1" />
                  Slack Connect
                  <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[10px]">
                    {channels.filter((c) => c.isShared).length}
                  </Badge>
                </Button>
              </div>
            )}

            {filteredChannels.length > 0 && (
              <div className="flex items-center justify-between mb-2 p-2 bg-muted/30 rounded-lg">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {selectedChannels.size === filteredChannels.length &&
                  filteredChannels.length > 0 ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : selectedChannels.size > 0 ? (
                    <CheckSquare className="h-4 w-4 opacity-50" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  {selectedChannels.size === 0 ? 'Select all' : `${selectedChannels.size} selected`}
                </button>

                {selectedChannels.size > 0 && (
                  <div className="flex items-center gap-2">
                    <Popover open={bulkPopoverOpen} onOpenChange={setBulkPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs"
                          disabled={bulkSaving}
                        >
                          {bulkSaving ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Bot className="h-3 w-3 mr-1" />
                          )}
                          Set Agent
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="end">
                        <Command>
                          <CommandInput placeholder="Search agents..." />
                          <CommandList>
                            <CommandEmpty>No agents found.</CommandEmpty>
                            <CommandGroup>
                              {agents.map((agent) => (
                                <CommandItem
                                  key={agent.id}
                                  value={`${agent.name} ${agent.projectName}`}
                                  onSelect={() => handleBulkSetAgent(agent)}
                                >
                                  <Bot className="mr-2 h-4 w-4" />
                                  <div className="flex flex-col">
                                    <span>{agent.name || agent.id}</span>
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

                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={handleBulkResetToDefault}
                      disabled={bulkSaving}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Reset
                    </Button>
                  </div>
                )}
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
                <p className="text-sm text-muted-foreground">No {channelFilter} channels found.</p>
                <Button
                  variant="link"
                  size="sm"
                  className="text-xs mt-1"
                  onClick={() => setChannelFilter('all')}
                >
                  Show all channels
                </Button>
              </div>
            ) : (
              <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                {filteredChannels.map((channel) => (
                  <div
                    key={channel.id}
                    className={cn(
                      'flex items-center justify-between rounded-lg border p-3 transition-colors',
                      channel.hasAgentConfig
                        ? 'bg-primary/5 border-primary/20'
                        : 'bg-background hover:bg-muted/50',
                      selectedChannels.has(channel.id) && 'ring-2 ring-primary/50'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox
                        checked={selectedChannels.has(channel.id)}
                        onCheckedChange={() => handleToggleChannel(channel.id)}
                        aria-label={`Select ${channel.name}`}
                        className="shrink-0"
                      />
                      {channel.isPrivate ? (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-medium text-sm truncate">{channel.name}</span>
                      {channel.isPrivate && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 h-4 shrink-0 border-amber-500/50 text-amber-600 bg-amber-500/10"
                        >
                          Private
                        </Badge>
                      )}
                      {channel.isShared && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 h-4 shrink-0 border-blue-500/50 text-blue-600 bg-blue-500/10"
                        >
                          <Globe className="h-2.5 w-2.5 mr-0.5" />
                          Slack Connect
                        </Badge>
                      )}
                      {channel.memberCount !== undefined && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {channel.memberCount}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {savingChannel === channel.id ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        </div>
                      ) : (
                        <>
                          <Popover
                            open={channelPopovers[channel.id] || false}
                            onOpenChange={(open) =>
                              setChannelPopovers((prev) => ({ ...prev, [channel.id]: open }))
                            }
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant={channel.hasAgentConfig ? 'secondary' : 'ghost'}
                                size="sm"
                                className={cn(
                                  'h-8 text-xs',
                                  channel.hasAgentConfig && 'border border-primary/20'
                                )}
                              >
                                {channel.agentConfig ? (
                                  <span className="flex items-center gap-1.5">
                                    <Bot className="h-3 w-3" />
                                    {channel.agentConfig.agentName}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">Default</span>
                                )}
                                <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[300px] p-0" align="end">
                              <Command>
                                <CommandInput placeholder="Search agents..." />
                                <CommandList>
                                  <CommandEmpty>No agents found.</CommandEmpty>
                                  <CommandGroup>
                                    {agents.map((agent) => (
                                      <CommandItem
                                        key={agent.id}
                                        value={`${agent.name} ${agent.projectName}`}
                                        onSelect={() =>
                                          handleSetChannelAgent(channel.id, channel.name, agent)
                                        }
                                      >
                                        <Check
                                          className={cn(
                                            'mr-2 h-4 w-4',
                                            channel.agentConfig?.agentId === agent.id
                                              ? 'opacity-100'
                                              : 'opacity-0'
                                          )}
                                        />
                                        <div className="flex flex-col">
                                          <span>{agent.name || agent.id}</span>
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

                          {channel.hasAgentConfig && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleResetChannelToDefault(channel.id, channel.name)}
                              aria-label="Reset channel to workspace default"
                              title="Reset to workspace default"
                            >
                              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
