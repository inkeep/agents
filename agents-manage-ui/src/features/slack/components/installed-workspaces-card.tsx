'use client';

import { ExternalLink, Eye, EyeOff, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
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
import { useSlack } from '../context/slack-context';

export function InstalledWorkspacesCard() {
  const { workspaces, mounted, removeWorkspace, clearAllWorkspaces, refreshWorkspaces } =
    useSlack();
  const [visibleTokens, setVisibleTokens] = useState<Set<string>>(new Set());

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

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Installed Workspaces</CardTitle>
            <CardDescription>
              Preview of workspace data (stored in localStorage for now, DB integration coming next)
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refreshWorkspaces}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            {mounted && workspaces.length > 0 && (
              <Button variant="destructive" size="sm" onClick={clearAllWorkspaces}>
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
          <p className="text-muted-foreground text-sm text-center py-8">
            No workspaces installed yet. Click "Install to Slack" to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
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
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspaces.map((workspace) => (
                  <TableRow key={workspace.teamId}>
                    <TableCell className="font-medium">
                      {workspace.teamDomain ? (
                        <a
                          href={`https://${workspace.teamDomain}.slack.com`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {workspace.teamName}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        workspace.teamName
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{workspace.teamId}</TableCell>
                    <TableCell>
                      {workspace.teamDomain ? (
                        <a
                          href={`https://${workspace.teamDomain}.slack.com`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary hover:underline"
                        >
                          {workspace.teamDomain}
                        </a>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{workspace.botUserId}</TableCell>
                    <TableCell>
                      {workspace.botToken && (
                        <div className="flex items-center gap-1">
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {visibleTokens.has(workspace.teamId || '')
                              ? workspace.botToken
                              : maskToken(workspace.botToken)}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleTokenVisibility(workspace.teamId || '')}
                          >
                            {visibleTokens.has(workspace.teamId || '') ? (
                              <EyeOff className="h-3 w-3" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {workspace.installedAt
                        ? new Date(workspace.installedAt).toLocaleDateString()
                        : '—'}
                    </TableCell>
                    <TableCell>{String(workspace.isEnterpriseInstall ?? false)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => workspace.teamId && removeWorkspace(workspace.teamId)}
                      >
                        <Trash2 className="h-4 w-4" />
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
