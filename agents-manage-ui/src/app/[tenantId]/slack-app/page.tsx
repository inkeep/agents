'use client';

import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  MessageSquare,
  RefreshCw,
  Settings,
  Trash2,
  User,
  Zap,
} from 'lucide-react';
import { use, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { STATIC_LABELS } from '@/constants/theme';
import { useAuthSession } from '@/hooks/use-auth';

interface SlackWorkspace {
  ok: boolean;
  teamId?: string;
  teamName?: string;
  teamDomain?: string;
  enterpriseId?: string;
  enterpriseName?: string;
  isEnterpriseInstall?: boolean;
  botUserId?: string;
  botToken?: string;
  botScopes?: string;
  installerUserId?: string;
  installedAt?: string;
  error?: string;
}

const STORAGE_KEY = 'inkeep_slack_workspaces';

function getStoredWorkspaces(): SlackWorkspace[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveWorkspaces(workspaces: SlackWorkspace[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
}

function SlackAppPage({ params }: PageProps<'/[tenantId]/slack-app'>) {
  const { tenantId } = use(params);
  const { user, isLoading } = useAuthSession();
  const [workspaces, setWorkspaces] = useState<SlackWorkspace[]>([]);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [visibleTokens, setVisibleTokens] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  const toggleTokenVisibility = (teamId: string) => {
    setVisibleTokens((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  const maskToken = (token: string) => {
    if (token.length <= 12) return '••••••••••••';
    return `${token.substring(0, 8)}...${token.substring(token.length - 4)}`;
  };

  const processUrlParams = useCallback(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const workspaceData = urlParams.get('workspace');
    const error = urlParams.get('error');

    if (error) {
      console.error('Slack OAuth Error:', error);
      setNotification({ type: 'error', message: `Slack installation failed: ${error}` });
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (success === 'true' && workspaceData) {
      try {
        const workspace: SlackWorkspace = JSON.parse(workspaceData);
        console.log('=== SLACK WORKSPACE DATA RECEIVED ===');
        console.log(JSON.stringify(workspace, null, 2));
        console.log('=====================================');

        const existing = getStoredWorkspaces();
        const existingIndex = existing.findIndex((w) => w.teamId === workspace.teamId);

        let updatedWorkspaces: SlackWorkspace[];
        if (existingIndex >= 0) {
          updatedWorkspaces = [...existing];
          updatedWorkspaces[existingIndex] = workspace;
          setNotification({
            type: 'success',
            message: `Workspace "${workspace.teamName}" updated successfully!`,
          });
        } else {
          updatedWorkspaces = [...existing, workspace];
          setNotification({
            type: 'success',
            message: `Workspace "${workspace.teamName}" installed successfully!`,
          });
        }

        saveWorkspaces(updatedWorkspaces);
        setWorkspaces(updatedWorkspaces);

        window.history.replaceState({}, '', window.location.pathname);
      } catch (e) {
        console.error('Failed to parse workspace data:', e);
        setNotification({ type: 'error', message: 'Failed to parse workspace data from callback' });
      }
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    setWorkspaces(getStoredWorkspaces());
    processUrlParams();
  }, [processUrlParams]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleInstallClick = () => {
    const apiUrl = process.env.NEXT_PUBLIC_INKEEP_AGENTS_API_URL || 'http://localhost:3002';
    window.location.href = `${apiUrl}/manage/slack/install`;
  };

  const handleRemoveWorkspace = (teamId: string) => {
    const updated = workspaces.filter((w) => w.teamId !== teamId);
    saveWorkspaces(updated);
    setWorkspaces(updated);
    setNotification({ type: 'success', message: 'Workspace removed from local storage' });
  };

  const handleClearAll = () => {
    saveWorkspaces([]);
    setWorkspaces([]);
    setNotification({ type: 'success', message: 'All workspaces cleared from local storage' });
  };

  const latestWorkspace = workspaces.length > 0 ? workspaces[workspaces.length - 1] : null;

  return (
    <>
      <PageHeader
        title={STATIC_LABELS['slack-app']}
        description="Connect your Slack workspace to Inkeep Agents"
        action={
          <Button size="lg" className="gap-2" onClick={handleInstallClick}>
            <MessageSquare className="h-4 w-4" />
            Install to Slack
          </Button>
        }
      />

      {notification && (
        <div
          className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
            notification.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          {notification.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Account Info
            </CardTitle>
            <CardDescription>Your connected account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!mounted || isLoading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </div>
            ) : user ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Name</span>
                  <span className="text-sm font-medium">{user.name || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Email</span>
                  <span className="text-sm font-medium">{user.email || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Tenant</span>
                  <span className="text-sm font-medium font-mono">{tenantId}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Status</span>
                  <span className="text-sm text-muted-foreground">Auth disabled</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Tenant</span>
                  <span className="text-sm font-medium font-mono">{tenantId}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Connection Status
            </CardTitle>
            <CardDescription>Slack workspace connection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!mounted ? (
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">Status</span>
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        workspaces.length > 0 ? 'bg-green-500' : 'bg-yellow-500'
                      }`}
                    />
                    {workspaces.length > 0 ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Workspaces</span>
                  <span className="text-sm font-medium">{workspaces.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Latest Workspace</span>
                  <span className="text-sm font-medium">{latestWorkspace?.teamName || '—'}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuration
            </CardTitle>
            <CardDescription>App settings and permissions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!mounted ? (
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Bot Scopes</span>
                  <span
                    className="text-sm text-muted-foreground truncate max-w-[150px]"
                    title={latestWorkspace?.botScopes}
                  >
                    {latestWorkspace?.botScopes ? 'Configured' : 'Not configured'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Bot User ID</span>
                  <span className="text-sm font-mono text-muted-foreground">
                    {latestWorkspace?.botUserId || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Storage</span>
                  <Badge variant="secondary">localStorage</Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Installed Workspaces</CardTitle>
              <CardDescription>
                Preview of workspace data (stored in localStorage for now, DB integration coming
                next)
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWorkspaces(getStoredWorkspaces())}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
              {mounted && workspaces.length > 0 && (
                <Button variant="destructive" size="sm" onClick={handleClearAll}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!mounted ? (
            <div className="animate-pulse space-y-4">
              <div className="h-10 bg-muted rounded w-full" />
              <div className="h-10 bg-muted rounded w-full" />
            </div>
          ) : workspaces.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No workspaces installed yet.</p>
              <p className="text-sm mt-1">Click "Install to Slack" to add your first workspace.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team Name</TableHead>
                    <TableHead>Team ID</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Bot User ID</TableHead>
                    <TableHead>Bot Token</TableHead>
                    <TableHead>Installed At</TableHead>
                    <TableHead>Enterprise Install</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspaces.map((workspace) => {
                    const teamId = workspace.teamId || '';
                    const isTokenVisible = visibleTokens.has(teamId);

                    return (
                      <TableRow key={teamId}>
                        <TableCell className="font-medium">{workspace.teamName}</TableCell>
                        <TableCell className="font-mono text-xs">{teamId}</TableCell>
                        <TableCell>
                          {workspace.teamDomain ? (
                            <a
                              href={`https://${workspace.teamDomain}.slack.com`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline inline-flex items-center gap-1"
                            >
                              {workspace.teamDomain}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {workspace.botUserId || '—'}
                        </TableCell>
                        <TableCell>
                          {workspace.botToken ? (
                            <div className="flex items-center gap-1">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                {isTokenVisible
                                  ? workspace.botToken
                                  : maskToken(workspace.botToken)}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => toggleTokenVisibility(teamId)}
                                title={isTokenVisible ? 'Hide token' : 'Show token'}
                              >
                                {isTokenVisible ? (
                                  <EyeOff className="h-3 w-3" />
                                ) : (
                                  <Eye className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {workspace.installedAt
                            ? new Date(workspace.installedAt).toLocaleDateString()
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {workspace.isEnterpriseInstall ? (
                            <div className="space-y-1">
                              <Badge variant="default" className="bg-purple-600">
                                true
                              </Badge>
                              {workspace.enterpriseId && (
                                <div className="text-xs text-muted-foreground font-mono">
                                  {workspace.enterpriseId}
                                </div>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline">false</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {teamId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveWorkspace(teamId)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Raw Data Preview</CardTitle>
          <CardDescription>
            This shows what the database schema would look like. Data is currently in localStorage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!mounted ? (
            <div className="animate-pulse h-32 bg-muted rounded-lg" />
          ) : (
            <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-64 text-xs">
              {JSON.stringify(workspaces, null, 2) || '[]'}
            </pre>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default SlackAppPage;
