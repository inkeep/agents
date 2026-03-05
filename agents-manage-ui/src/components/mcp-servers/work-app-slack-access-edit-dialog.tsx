'use client';

import { Hash, Loader2, MessageSquare } from 'lucide-react';
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
import { slackApi } from '@/features/work-apps/slack/api/slack-api';
import {
  getSlackMcpToolAccess,
  type SlackMcpChannelAccessMode,
  setSlackMcpToolAccess,
} from '@/lib/api/slack-mcp';
import type { MCPTool } from '@/lib/types/tools';

interface SlackAccessEditDialogProps {
  tool: MCPTool;
  tenantId: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface SlackChannelInfo {
  id: string;
  name: string;
  isPrivate: boolean;
  memberCount?: number;
}

export function SlackAccessEditDialog({
  tool,
  tenantId,
  projectId,
  open,
  onOpenChange,
  onSuccess,
}: SlackAccessEditDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [channels, setChannels] = useState<SlackChannelInfo[]>([]);
  const [mode, setMode] = useState<SlackMcpChannelAccessMode>('selected');
  const [dmEnabled, setDmEnabled] = useState(false);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);

      const [currentConfig, workspaces] = await Promise.all([
        getSlackMcpToolAccess(tenantId, projectId, tool.id),
        slackApi.listWorkspaceInstallations(),
      ]);

      setMode(currentConfig.channelAccessMode);
      setDmEnabled(currentConfig.dmEnabled);
      if (currentConfig.channelAccessMode === 'selected') {
        setSelectedChannelIds(new Set(currentConfig.channelIds));
      }

      if (workspaces.workspaces.length > 0) {
        const workspace = workspaces.workspaces[0];
        const channelData = await slackApi.listChannels(workspace.teamId);
        setChannels(
          channelData.channels.map((ch) => ({
            id: ch.id,
            name: ch.name,
            isPrivate: ch.isPrivate,
            memberCount: ch.memberCount,
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load Slack data:', error);
      toast.error('Failed to load Slack access configuration');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, projectId, tool.id]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setSlackMcpToolAccess(tenantId, projectId, tool.id, {
        channelAccessMode: mode,
        dmEnabled,
        channelIds: mode === 'selected' ? Array.from(selectedChannelIds) : undefined,
      });
      toast.success('Slack access updated successfully');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to update Slack access:', error);
      toast.error('Failed to update Slack access. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const isFormValid = mode === 'all' || selectedChannelIds.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="size-5" />
            Edit Slack Access
          </DialogTitle>
          <DialogDescription>
            Update which Slack channels this MCP server can post to.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Channel Access Mode</Label>
                <RadioGroup
                  value={mode}
                  onValueChange={(value) => setMode(value as SlackMcpChannelAccessMode)}
                  className="space-y-2"
                >
                  <label
                    htmlFor="edit-slack-mode-all"
                    className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <RadioGroupItem value="all" id="edit-slack-mode-all" className="mt-1" />
                    <div className="flex-1">
                      <span className="font-medium">All channels</span>
                      <p className="text-sm text-muted-foreground mt-1">
                        MCP server can post to any channel the bot is a member of
                      </p>
                    </div>
                  </label>
                  <label
                    htmlFor="edit-slack-mode-selected"
                    className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <RadioGroupItem
                      value="selected"
                      id="edit-slack-mode-selected"
                      className="mt-1"
                    />
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
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isFormValid || isLoading || isSaving}>
            {isSaving && <Loader2 className="size-4 mr-2 animate-spin" />}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
