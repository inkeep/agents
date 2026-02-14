'use client';

import { Layers2, Loader2, RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useIsOrgAdmin } from '@/hooks/use-is-org-admin';
import { getAllAgentsForSlack } from '../../actions/agents';
import { slackApi } from '../../api/slack-api';
import { useSlack } from '../../context/slack-provider';
import { ChannelDefaultsSection } from './channel-defaults-section';
import type { Channel, DefaultAgentConfig, SlackAgentOption } from './types';
import { WorkspaceDefaultSection } from './workspace-default-section';

export function AgentConfigurationCard() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { installedWorkspaces } = useSlack();
  const { isAdmin } = useIsOrgAdmin();

  const [agents, setAgents] = useState<SlackAgentOption[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [savingChannel, setSavingChannel] = useState<string | null>(null);
  const [defaultAgent, setDefaultAgent] = useState<DefaultAgentConfig | null>(null);
  const [defaultOpen, setDefaultOpen] = useState(false);
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
      toast.success(`Default agent set to "${config.agentName}"`);
    } catch (error) {
      console.error('Failed to save default agent:', error);
      toast.error('Failed to save default agent');
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

      toast.success(`#${channelName} now uses "${config.agentName}"`);
    } catch (error) {
      console.error('Failed to set channel agent:', error);
      const errorMessage =
        error instanceof Error && error.message.includes('forbidden')
          ? `You can only configure channels you're a member of`
          : 'Failed to set channel agent';
      toast.error(errorMessage);
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

      toast.success(`#${channelName} now uses the workspace default`);
    } catch (error) {
      console.error('Failed to reset channel:', error);
      const errorMessage =
        error instanceof Error && error.message.includes('forbidden')
          ? `You can only configure channels you're a member of`
          : 'Failed to reset channel to default';
      toast.error(errorMessage);
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

  const cardTitle = (
    <CardTitle className="flex items-center gap-2">
      <Layers2 className="h-4 w-4 text-muted-foreground" />
      <span className="text-base font-medium">Agent Configuration</span>
    </CardTitle>
  );

  if (!teamId) {
    return (
      <Card className="shadow-none">
        <CardHeader>
          {cardTitle}
          <CardDescription>
            Configure which AI agents respond in your Slack workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
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
      <Card className="shadow-none">
        <CardHeader>{cardTitle}</CardHeader>
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
    <>
      <Card className="shadow-none">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Layers2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-base font-medium">Workspace Default</span>
            </CardTitle>
            <Button
              variant="ghost"
              size="icon-sm"
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
          <p className="text-sm text-muted-foreground">
            The default agent for all <Badge variant="code">@Inkeep</Badge> mentions and{' '}
            <Badge variant="code">/inkeep</Badge> commands in{' '}
            <span className="font-medium">{workspaceName}</span>.{' '}
            {defaultAgent &&
              `Used by ${channelsUsingDefault.length} channel${channelsUsingDefault.length !== 1 ? 's' : ''}.`}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <WorkspaceDefaultSection
            defaultAgent={defaultAgent}
            agents={agents}
            loadingAgents={loadingAgents}
            savingDefault={savingDefault}
            canEdit={canEditWorkspaceDefault}
            onSetDefaultAgent={handleSetDefaultAgent}
            onFetchAgents={fetchAgents}
            open={defaultOpen}
            onOpenChange={setDefaultOpen}
          />
        </CardContent>
      </Card>

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
    </>
  );
}
