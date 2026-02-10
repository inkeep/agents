'use client';

import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ExternalLink,
  Hash,
  HeartPulse,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Send,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
      <Card className="overflow-hidden border-dashed">
        <CardContent className="p-8">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="rounded-full bg-primary/10 p-4">
              <MessageSquare className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">Connect Your Slack Workspace</h3>
              <p className="text-muted-foreground max-w-md">
                Install the Inkeep Agent to your Slack workspace to enable AI-powered responses to
                @mentions and /inkeep commands.
              </p>
            </div>
            <Button size="lg" className="gap-2 mt-2" onClick={handleInstallClick}>
              <MessageSquare className="h-4 w-4" />
              Install to Slack
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-green-500 to-emerald-500" />
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2.5">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{workspace.teamName}</h2>
                    <a
                      href={`https://app.slack.com/client/${workspace.teamId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="secondary"
                          className={
                            health.checking
                              ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                              : health.healthy
                                ? 'bg-green-500/10 text-green-600 border-green-500/20'
                                : 'bg-red-500/10 text-red-600 border-red-500/20'
                          }
                        >
                          {health.checking ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : health.healthy ? (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          ) : (
                            <XCircle className="h-3 w-3 mr-1" />
                          )}
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
                      <Badge variant="outline" className="text-xs">
                        <Bot className="h-3 w-3 mr-1" />
                        {workspace.defaultAgentName}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 text-sm">
                {loadingStats ? (
                  <>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-32" />
                  </>
                ) : stats ? (
                  <>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>
                        <strong className="text-foreground">{stats.linkedUsers}</strong> linked user
                        {stats.linkedUsers !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Hash className="h-4 w-4" />
                      <span>
                        <strong className="text-foreground">{stats.totalChannels}</strong> channel
                        {stats.totalChannels !== 1 ? 's' : ''}
                        {stats.channelsWithCustomAgent > 0 && (
                          <span className="text-xs">
                            {' '}
                            ({stats.channelsWithCustomAgent} with custom agent)
                          </span>
                        )}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>
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
                    <ExternalLink className="h-4 w-4" />
                    Open in Slack
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowTestMessageDialog(true)}>
                  <Send className="h-4 w-4 mr-2" />
                  Send Test Message
                </DropdownMenuItem>
                <DropdownMenuItem onClick={checkHealth} disabled={health.checking}>
                  <HeartPulse className="h-4 w-4 mr-2" />
                  Check Health
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setShowUninstallDialog(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Uninstall
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
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
