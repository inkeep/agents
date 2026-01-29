'use client';

import { CheckCircle2, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { useSlack } from '../context/slack-provider';

export function InstalledWorkspacesCard() {
  const { installedWorkspaces, actions } = useSlack();
  const { uninstallWorkspace } = actions;
  const [mounted, setMounted] = useState(false);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleUninstall = async (connectionId: string) => {
    setUninstallingId(connectionId);
    try {
      await uninstallWorkspace(connectionId);
    } finally {
      setUninstallingId(null);
    }
  };

  const workspaces = installedWorkspaces.data;
  const isLoading = installedWorkspaces.isLoading;

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Installed Workspaces</CardTitle>
            <CardDescription>Slack workspaces where the Inkeep Agent is installed</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!mounted || isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : workspaces.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No workspaces installed yet. Click "Install to Slack" to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Team ID</TableHead>
                  <TableHead>Default Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspaces.map((workspace) => (
                  <TableRow key={workspace.connectionId || workspace.teamId}>
                    <TableCell className="font-medium">
                      <a
                        href={`https://app.slack.com/client/${workspace.teamId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {workspace.teamName || workspace.teamId}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{workspace.teamId}</TableCell>
                    <TableCell>
                      {workspace.hasDefaultAgent ? (
                        <span className="text-sm">{workspace.defaultAgentName}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not configured</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-600">Active</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUninstall(workspace.connectionId)}
                        disabled={uninstallingId === workspace.connectionId}
                      >
                        {uninstallingId === workspace.connectionId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
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
