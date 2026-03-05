'use client';

import { ExternalLink, Hash, Loader2, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { slackApi } from '@/features/work-apps/slack/api/slack-api';
import { type SlackMcpChannelAccessMode, setSlackMcpToolAccess } from '@/lib/api/slack-mcp';
import { createMCPTool } from '@/lib/api/tools';
import { generateId } from '@/lib/utils/id-utils';

interface WorkAppSlackChannelConfigDialogProps {
  tenantId: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (toolId: string) => void;
}

interface SlackChannelInfo {
  id: string;
  name: string;
  isPrivate: boolean;
  memberCount?: number;
}

type DialogState = 'loading' | 'no-workspace' | 'ready';

export function WorkAppSlackChannelConfigDialog({
  tenantId,
  projectId,
  open,
  onOpenChange,
  onSuccess,
}: WorkAppSlackChannelConfigDialogProps) {
  const [dialogState, setDialogState] = useState<DialogState>('loading');
  const [channels, setChannels] = useState<SlackChannelInfo[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setDialogState('loading');

      const workspaces = await slackApi.listWorkspaceInstallations();

      if (workspaces.workspaces.length === 0) {
        setDialogState('no-workspace');
        return;
      }

      const workspace = workspaces.workspaces[0];
      setTeamId(workspace.teamId);

      const channelData = await slackApi.listChannels(workspace.teamId);
      setChannels(
        channelData.channels.map((ch) => ({
          id: ch.id,
          name: ch.name,
          isPrivate: ch.isPrivate,
          memberCount: ch.memberCount,
        }))
      );

      setDialogState('ready');
    } catch (error) {
      console.error('Failed to load Slack data:', error);
      setDialogState('no-workspace');
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="size-5" />
            Configure Slack MCP Server
          </DialogTitle>
          <DialogDescription>
            Set up a Slack MCP server with channel access controls.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {dialogState === 'loading' && <LoadingState />}

          {dialogState === 'no-workspace' && (
            <NoWorkspaceState tenantId={tenantId} onOpenChange={onOpenChange} />
          )}

          {dialogState === 'ready' && teamId && (
            <ReadyState
              tenantId={tenantId}
              projectId={projectId}
              channels={channels}
              onOpenChange={onOpenChange}
              onSuccess={onSuccess}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

interface NoWorkspaceStateProps {
  tenantId: string;
  onOpenChange: (open: boolean) => void;
}

function NoWorkspaceState({ tenantId, onOpenChange }: NoWorkspaceStateProps) {
  return (
    <div className="rounded-lg border bg-muted/50 p-6">
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="size-12 rounded-full bg-muted flex items-center justify-center">
          <Hash className="size-6 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h3 className="font-medium">Install the Slack App</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            To use the Slack integration, you need to install the Slack app and connect it to your
            workspace.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button asChild>
            <Link href={`/${tenantId}/work-apps/slack`}>
              Connect Slack
              <ExternalLink className="size-3 ml-1.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ReadyStateProps {
  tenantId: string;
  projectId: string;
  channels: SlackChannelInfo[];
  onOpenChange: (open: boolean) => void;
  onSuccess?: (toolId: string) => void;
}

function ReadyState({ tenantId, projectId, channels, onOpenChange, onSuccess }: ReadyStateProps) {
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const [mode, setMode] = useState<SlackMcpChannelAccessMode>('all');
  const [dmEnabled, setDmEnabled] = useState(true);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChannelToggle = (channelId: string) => {
    setSelectedChannelIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(channelId)) {
        newSet.delete(channelId);
      } else {
        newSet.add(channelId);
      }
      return newSet;
    });
  };

  const isFormValid = mode === 'all' || selectedChannelIds.size > 0;

  const handleSubmit = async () => {
    if (!isFormValid) return;

    setIsSubmitting(true);
    try {
      const slackMcpUrl = `${PUBLIC_INKEEP_AGENTS_API_URL}/work-apps/slack/mcp`;

      const toolId = generateId();
      const newTool = await createMCPTool(tenantId, projectId, {
        id: toolId,
        name: 'Slack',
        config: {
          type: 'mcp' as const,
          mcp: {
            server: {
              url: slackMcpUrl,
            },
            transport: {
              type: 'streamable_http',
            },
          },
        },
        credentialReferenceId: null,
        credentialScope: 'project',
        isWorkApp: true,
      });

      await setSlackMcpToolAccess(tenantId, projectId, newTool.id, {
        channelAccessMode: mode,
        dmEnabled,
        channelIds: mode === 'selected' ? Array.from(selectedChannelIds) : undefined,
      });

      toast.success('Slack MCP server created successfully');
      onOpenChange(false);
      onSuccess?.(newTool.id);
    } catch (error) {
      console.error('Failed to create Slack MCP server:', error);
      toast.error('Failed to create Slack MCP server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-sm font-medium">Channel Access Mode</Label>
        <RadioGroup
          value={mode}
          onValueChange={(value) => setMode(value as SlackMcpChannelAccessMode)}
          className="space-y-2"
        >
          <label
            htmlFor="slack-mode-all"
            className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <RadioGroupItem value="all" id="slack-mode-all" className="mt-1" />
            <div className="flex-1">
              <span className="font-medium">All channels</span>
              <p className="text-sm text-muted-foreground mt-1">
                MCP server can post to any channel the bot is a member of ({channels.length}{' '}
                {channels.length === 1 ? 'channel' : 'channels'} available)
              </p>
            </div>
          </label>
          <label
            htmlFor="slack-mode-selected"
            className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <RadioGroupItem value="selected" id="slack-mode-selected" className="mt-1" />
            <div className="flex-1">
              <span className="font-medium">Selected channels</span>
              <p className="text-sm text-muted-foreground mt-1">
                MCP server can only post to specific channels you select below
                {selectedChannelIds.size > 0 && ` (${selectedChannelIds.size} selected)`}
              </p>
            </div>
          </label>
        </RadioGroup>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <MessageSquare className="size-5 text-muted-foreground" />
          <div>
            <span className="font-medium">Direct Messages</span>
            <p className="text-sm text-muted-foreground mt-0.5">
              Allow this MCP server to send direct messages
            </p>
          </div>
        </div>
        <Switch checked={dmEnabled} onCheckedChange={setDmEnabled} />
      </div>

      {mode === 'selected' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Select Channels</Label>
            {selectedChannelIds.size > 0 && (
              <Badge variant="count">{selectedChannelIds.size} selected</Badge>
            )}
          </div>

          {channels.length === 0 ? (
            <div className="rounded-lg border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
              No channels available. Make sure the bot is added to channels in Slack.
            </div>
          ) : (
            <div className="rounded-lg border max-h-[300px] overflow-y-auto">
              <div className="divide-y">
                {channels.map((channel) => (
                  <div
                    key={channel.id}
                    role="button"
                    tabIndex={0}
                    className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => handleChannelToggle(channel.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleChannelToggle(channel.id);
                      }
                    }}
                  >
                    <Checkbox
                      checked={selectedChannelIds.has(channel.id)}
                      onCheckedChange={() => handleChannelToggle(channel.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Hash className="size-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{channel.name}</p>
                    </div>
                    {channel.isPrivate && <Badge variant="code">Private</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === 'selected' && selectedChannelIds.size === 0 && (
            <p className="text-sm text-destructive">Please select at least one channel</p>
          )}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!isFormValid || isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 mr-2 animate-spin" />}
          {isSubmitting ? 'Creating...' : 'Create Slack MCP Server'}
        </Button>
      </DialogFooter>
    </div>
  );
}
