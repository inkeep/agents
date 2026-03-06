'use client';

import { Hash, MessageSquare, Settings, Slack } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { slackApi } from '@/features/work-apps/slack/api/slack-api';
import { getSlackMcpToolAccess, type SlackMcpAccessConfig } from '@/lib/api/slack-mcp';
import type { MCPTool } from '@/lib/types/tools';
import { ItemLabel } from './view-mcp-server-details-shared';
import { SlackAccessEditDialog } from './work-app-slack-access-edit-dialog';

interface WorkAppSlackAccessSectionProps {
  tool: MCPTool;
  tenantId: string;
  projectId: string;
  canEdit: boolean;
}

export function WorkAppSlackAccessSection({
  tool,
  tenantId,
  projectId,
  canEdit,
}: WorkAppSlackAccessSectionProps) {
  const [accessConfig, setAccessConfig] = useState<SlackMcpAccessConfig | null>(null);
  const [channelNameMap, setChannelNameMap] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const loadAccessConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [config, workspaces] = await Promise.all([
        getSlackMcpToolAccess(tenantId, projectId, tool.id),
        slackApi.listWorkspaceInstallations(),
      ]);
      setAccessConfig(config);

      if (
        config.channelAccessMode === 'selected' &&
        config.channelIds.length > 0 &&
        workspaces.workspaces.length > 0
      ) {
        const workspace = workspaces.workspaces[0];
        const channelData = await slackApi.listChannels(workspace.teamId);
        const nameMap = new Map<string, string>();
        for (const ch of channelData.channels) {
          nameMap.set(ch.id, ch.name);
        }
        setChannelNameMap(nameMap);
      }
    } catch (err) {
      console.error('Failed to load Slack access config:', err);
      setError('Failed to load Slack access configuration');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, projectId, tool.id]);

  useEffect(() => {
    loadAccessConfig();
  }, [loadAccessConfig]);

  const handleEditSuccess = () => {
    loadAccessConfig();
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Slack className="size-4" />
            <span className="font-medium">Slack Access</span>
          </div>
        </div>
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Slack className="size-4" />
            <span className="font-medium">Slack Access</span>
          </div>
        </div>
        <div className="text-sm text-destructive">{error}</div>
      </div>
    );
  }

  if (!accessConfig) {
    return null;
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Slack className="size-4" />
            <span className="font-medium">Slack Access</span>
          </div>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
              <Settings className="size-4 mr-1.5" />
              Configure
            </Button>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <ItemLabel>Channel Access</ItemLabel>
              <Badge variant={accessConfig.channelAccessMode === 'all' ? 'success' : 'code'}>
                {accessConfig.channelAccessMode === 'all' ? 'All channels' : 'Selected channels'}
              </Badge>
            </div>
            <div className="space-y-2">
              <ItemLabel>Direct Messages</ItemLabel>
              <Badge variant={accessConfig.dmEnabled ? 'success' : 'outline'}>
                <MessageSquare className="size-3 mr-1" />
                {accessConfig.dmEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </div>

          {accessConfig.channelAccessMode === 'selected' && accessConfig.channelIds.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ItemLabel>Allowed Channels</ItemLabel>
                <Badge variant="count">{accessConfig.channelIds.length}</Badge>
              </div>
              <div className="rounded-lg border divide-y">
                {accessConfig.channelIds.map((channelId) => (
                  <div key={channelId} className="flex items-center px-3 py-2">
                    <Hash className="size-3 mr-2 text-muted-foreground" />
                    <span className="text-sm">{channelNameMap.get(channelId) ?? channelId}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {accessConfig.channelAccessMode === 'selected' &&
            accessConfig.channelIds.length === 0 && (
              <div className="text-sm text-muted-foreground">
                No channels selected. Click Configure to select channels.
              </div>
            )}

          {accessConfig.channelAccessMode === 'all' && (
            <div className="text-sm text-muted-foreground">
              This MCP server can post to any channel the bot is a member of.
            </div>
          )}
        </div>
      </div>

      <SlackAccessEditDialog
        tool={tool}
        tenantId={tenantId}
        projectId={projectId}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleEditSuccess}
      />
    </>
  );
}

export function isSlackWorkapp(tool: MCPTool): boolean {
  return (
    Boolean((tool as any).isWorkApp) &&
    tool.config.type === 'mcp' &&
    tool.config.mcp.server.url.includes('/slack/mcp')
  );
}
