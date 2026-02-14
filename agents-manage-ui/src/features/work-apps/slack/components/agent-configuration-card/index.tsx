'use client';

import { Bot, Loader2, RefreshCw, Settings2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useIsOrgAdmin } from '@/hooks/use-is-org-admin';
import { getAllAgentsForSlack } from '../../actions/agents';
import { slackApi } from '../../api/slack-api';
import { useSlack } from '../../context/slack-provider';
import { ChannelDefaultsSection } from './channel-defaults-section';
import type { Channel, DefaultAgentConfig, SlackAgentOption } from './types';
import { WorkspaceDefaultSection } from './workspace-default-section';

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
  const [channelsExpanded, setChannelsExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [channelFilter, setChannelFilter] = useState<'all' | 'private' | 'connect'>('all');
  const [channelSearchQuery, setChannelSearchQuery] = useState('');

  const firstWorkspace = installedWorkspaces.data[0];
  const teamId = firstWorkspace?.teamId;
  const workspaceName = firstWorkspace?.teamName || 'your workspace';
  const canEditWorkspaceDefault = isAdmin;

  const filteredChannels = channels
    .filter((c) => {
      if (channelFilter === 'private') return c.isPrivate;
      if (channelFilter === 'connect') return c.isShared;
      return true;
    })
    .filter((c) => {
      if (!channelSearchQuery.trim()) return true;
      const q = channelSearchQuery.trim().toLowerCase();
      return c.name.toLowerCase().includes(q);
    });

  const channelsWithCustomAgent = filteredChannels.filter((c) => c.hasAgentConfig);
  const channelsUsingDefault = filteredChannels.filter((c) => !c.hasAgentConfig);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally clear selections when filter changes
  useEffect(() => {
    setSelectedChannels(new Set());
  }, [channelFilter, channelSearchQuery]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchAgents = useCallback(async () => {
    if (!teamId) return;
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
  }, [tenantId, teamId]);

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
        <WorkspaceDefaultSection
          workspaceName={workspaceName}
          defaultAgent={defaultAgent}
          agents={agents}
          loadingAgents={loadingAgents}
          savingDefault={savingDefault}
          canEdit={canEditWorkspaceDefault}
          isLoadingAdmin={isLoadingAdmin}
          channelsUsingDefault={channelsUsingDefault.length}
          onSetDefaultAgent={handleSetDefaultAgent}
          onFetchAgents={fetchAgents}
          open={defaultOpen}
          onOpenChange={setDefaultOpen}
        />

        <Separator />

        <ChannelDefaultsSection
          channels={channels}
          filteredChannels={filteredChannels}
          loadingChannels={loadingChannels}
          channelsWithCustomAgent={channelsWithCustomAgent}
          channelFilter={channelFilter}
          channelSearchQuery={channelSearchQuery}
          selectedChannels={selectedChannels}
          agents={agents}
          savingChannel={savingChannel}
          bulkSaving={bulkSaving}
          isAdmin={isAdmin}
          expanded={channelsExpanded}
          onExpandedChange={setChannelsExpanded}
          onChannelFilterChange={setChannelFilter}
          onSearchQueryChange={setChannelSearchQuery}
          onToggleChannel={handleToggleChannel}
          onSelectAll={handleSelectAll}
          onClearSelection={() => setSelectedChannels(new Set())}
          onSetChannelAgent={handleSetChannelAgent}
          onResetChannelToDefault={handleResetChannelToDefault}
          onBulkSetAgent={handleBulkSetAgent}
          onBulkResetToDefault={handleBulkResetToDefault}
          onClearFilters={() => {
            setChannelSearchQuery('');
            setChannelFilter('all');
          }}
        />
      </CardContent>
    </Card>
  );
}
