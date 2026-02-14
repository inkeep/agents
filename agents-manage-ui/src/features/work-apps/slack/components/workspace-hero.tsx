'use client';

import {
  AlertCircle,
  ArrowUpRight,
  HeartPulse,
  Loader2,
  MoreHorizontal,
  Send,
  SlackIcon,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import EmptyState from '@/components/layout/empty-state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { WorkAppIcon } from '../../common/components/work-app-icon';
import { slackApi } from '../api/slack-api';
import { useSlack } from '../context/slack-provider';

interface WorkspaceStats {
  linkedUsers: number;
  channelsWithCustomAgent: number;
  totalChannels: number;
}

interface HealthStatus {
  healthy: boolean;
  botName?: string;
  error?: string;
  checking: boolean;
}

interface Channel {
  id: string;
  name: string;
}

export function WorkspaceHero() {
  const { installedWorkspaces, actions } = useSlack();
  const { handleInstallClick, uninstallWorkspace } = actions;

  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [showUninstallDialog, setShowUninstallDialog] = useState(false);
  const [health, setHealth] = useState<HealthStatus>({ healthy: true, checking: false });
  const [showTestMessageDialog, setShowTestMessageDialog] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [sendingTestMessage, setSendingTestMessage] = useState(false);

  const workspace = installedWorkspaces.data[0];
  const isLoading = installedWorkspaces.isLoading;
  const hasWorkspace = !!workspace;

  useEffect(() => {
    setMounted(true);
  }, []);

  const checkHealth = useCallback(async () => {
    if (!workspace?.teamId) return;

    setHealth((h) => ({ ...h, checking: true }));
    try {
      const result = await slackApi.checkWorkspaceHealth(workspace.teamId);
      setHealth({
        healthy: result.healthy,
        botName: result.botName,
        error: result.error,
        checking: false,
      });
    } catch {
      setHealth({ healthy: false, error: 'Failed to check health', checking: false });
    }
  }, [workspace?.teamId]);

  useEffect(() => {
    if (!workspace?.teamId) return;

    const fetchStats = async () => {
      setLoadingStats(true);
      try {
        const [usersResult, channelsResult, healthResult] = await Promise.all([
          slackApi.getLinkedUsers(workspace.teamId),
          slackApi.listChannels(workspace.teamId),
          slackApi.checkWorkspaceHealth(workspace.teamId),
        ]);

        setStats({
          linkedUsers: usersResult.linkedUsers.length,
          channelsWithCustomAgent: channelsResult.channels.filter((c) => c.hasAgentConfig).length,
          totalChannels: channelsResult.channels.length,
        });

        setChannels(
          channelsResult.channels.map((c) => ({
            id: c.id,
            name: c.name,
          }))
        );

        setHealth({
          healthy: healthResult.healthy,
          botName: healthResult.botName,
          error: healthResult.error,
          checking: false,
        });
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, [workspace?.teamId]);

  const handleSendTestMessage = async () => {
    if (!workspace?.teamId || !selectedChannel) return;

    setSendingTestMessage(true);
    try {
      const result = await slackApi.sendTestMessage(workspace.teamId, selectedChannel);
      if (result.success) {
        toast.success('Test message sent successfully!');
        setShowTestMessageDialog(false);
      } else {
        toast.error(result.error || 'Failed to send test message');
      }
    } catch {
      toast.error('Failed to send test message');
    } finally {
      setSendingTestMessage(false);
    }
  };

  const handleUninstall = async () => {
    if (!workspace?.connectionId) return;

    setUninstalling(true);
    try {
      await uninstallWorkspace(workspace.connectionId);
      setShowUninstallDialog(false);
    } finally {
      setUninstalling(false);
    }
  };

  if (!mounted || isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasWorkspace) {
    return (
      <EmptyState
        title="No Slack connections."
        description="Install the Inkeep Agent to your Slack workspace to enable AI-powered responses to @mentions and /inkeep commands."
        action={
          <Button size="lg" className="gap-2 mt-2" onClick={handleInstallClick}>
            <SlackIcon className="h-4 w-4" />
            Install to Slack
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Card className="shadow-none py-4">
        <CardContent>
          <div className="flex items-center justify-between flex-wrap">
            <div className="flex gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg">
                  <WorkAppIcon appId="slack" className="h-6 w-6 text-primary" />
                </div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-md font-medium">{workspace.teamName}</h2>
                    <a
                      href={`https://app.slack.com/client/${workspace.teamId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open workspace in Slack"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowUpRight className="h-4 w-4 opacity-60" />
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant={
                            health.healthy ? 'success' : health.checking ? 'warning' : 'error'
                          }
                        >
                          {health.checking && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                          {health.checking ? 'Checking...' : health.healthy ? 'Healthy' : 'Issue'}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {health.healthy ? (
                          <p>Bot is connected and working</p>
                        ) : (
                          <p>{health.error || 'Bot connection issue'}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                    {workspace.hasDefaultAgent && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="code" className="text-xs">
                            {workspace.defaultAgentName}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            The default agent for all <code>@Inkeep</code> mentions and{' '}
                            <code>/inkeep</code> commands in {workspace.teamName}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-4 text-sm">
                {loadingStats ? (
                  <>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-32" />
                  </>
                ) : stats ? (
                  <>
                    <div className="flex items-center text-muted-foreground font-light gap-2">
                      <span className="text-foreground font-mono font-semibold">
                        {stats.linkedUsers}
                      </span>{' '}
                      user
                      {stats.linkedUsers !== 1 ? 's' : ''}
                    </div>
                    <Separator orientation="vertical" className="h-4! border-border" />
                    <div className="flex items-center gap-1.5 text-muted-foreground font-light">
                      <span className="text-foreground font-mono font-semibold">
                        {stats.totalChannels}
                      </span>{' '}
                      channel
                      {stats.totalChannels !== 1 ? 's' : ''}
                    </div>
                  </>
                ) : null}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Workspace options">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a
                      href={`https://app.slack.com/client/${workspace.teamId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                      Open in Slack
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowTestMessageDialog(true)}>
                    <Send className="h-4 w-4" />
                    Send test message
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={checkHealth} disabled={health.checking}>
                    <HeartPulse className="h-4 w-4" />
                    Check health
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setShowUninstallDialog(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Uninstall
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showUninstallDialog} onOpenChange={setShowUninstallDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Uninstall from {workspace.teamName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the Inkeep Agent from this Slack workspace. All channel
              configurations and linked user accounts will be disconnected. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={uninstalling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUninstall}
              disabled={uninstalling}
              variant="destructive"
            >
              {uninstalling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uninstalling...
                </>
              ) : (
                'Uninstall'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showTestMessageDialog} onOpenChange={setShowTestMessageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Send Test Message
            </DialogTitle>
            <DialogDescription>
              Send a test message to verify your Slack integration is working correctly.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label htmlFor="channel-select" className="text-sm font-medium mb-2 block">
              Select Channel
            </label>
            <Select value={selectedChannel} onValueChange={setSelectedChannel}>
              <SelectTrigger id="channel-select">
                <SelectValue placeholder="Choose a channel..." />
              </SelectTrigger>
              <SelectContent>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    #{channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {channels.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                No channels found. Make sure the bot is invited to at least one channel.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestMessageDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendTestMessage}
              disabled={!selectedChannel || sendingTestMessage}
            >
              {sendingTestMessage ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Test
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
