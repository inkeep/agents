'use client';

import { Building2, Github, Settings, User } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getMcpToolWorkAppGitHubAccess, type McpToolWorkAppGitHubAccess } from '@/lib/api/github';
import type { MCPTool } from '@/lib/types/tools';
import { ItemLabel } from './view-mcp-server-details-shared';
import { GitHubAccessEditDialog } from './work-app-github-access-edit-dialog';

interface WorkAppGitHubAccessSectionProps {
  tool: MCPTool;
  tenantId: string;
  projectId: string;
  canEdit: boolean;
}

export function WorkAppGitHubAccessSection({
  tool,
  tenantId,
  projectId,
  canEdit,
}: WorkAppGitHubAccessSectionProps) {
  const [accessConfig, setAccessConfig] = useState<McpToolWorkAppGitHubAccess | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const loadAccessConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const config = await getMcpToolWorkAppGitHubAccess(tenantId, projectId, tool.id);
      setAccessConfig(config);
    } catch (err) {
      console.error('Failed to load GitHub access config:', err);
      setError('Failed to load GitHub access configuration');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, projectId, tool.id]);

  useEffect(() => {
    loadAccessConfig();
  }, [loadAccessConfig]);

  const handleEditSuccess = () => {
    // Refresh the access config after successful edit
    loadAccessConfig();
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Github className="size-4" />
            <span className="font-medium">GitHub Access</span>
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
            <Github className="size-4" />
            <span className="font-medium">GitHub Access</span>
          </div>
        </div>
        <div className="text-sm text-destructive">{error}</div>
      </div>
    );
  }

  if (!accessConfig) {
    return null;
  }

  // Group repositories by installation account
  const repositoriesByInstallation = accessConfig.repositories.reduce(
    (acc, repo) => {
      const key = repo.installationAccountLogin;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(repo);
      return acc;
    },
    {} as Record<string, typeof accessConfig.repositories>
  );

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Github className="size-4" />
            <span className="font-medium">GitHub Access</span>
          </div>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
              <Settings className="size-4 mr-1.5" />
              Configure
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {accessConfig.mode === 'selected' && accessConfig.repositories.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ItemLabel>Repositories</ItemLabel>
                <Badge variant="count">{accessConfig.repositories.length}</Badge>
              </div>
              <div className="rounded-lg border divide-y">
                {Object.entries(repositoriesByInstallation).map(([accountLogin, repos]) => (
                  <div key={accountLogin}>
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                      <div className="flex size-6 items-center justify-center rounded-full bg-background border">
                        {repos[0]?.private !== undefined ? (
                          <Building2 className="size-3 text-muted-foreground" />
                        ) : (
                          <User className="size-3 text-muted-foreground" />
                        )}
                      </div>
                      <span className="text-sm font-medium">{accountLogin}</span>
                    </div>
                    <div className="divide-y">
                      {repos.map((repo) => (
                        <div key={repo.id} className="flex items-center justify-between px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{repo.repositoryName}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {repo.repositoryFullName}
                            </p>
                          </div>
                          <Badge variant={repo.private ? 'code' : 'success'}>
                            {repo.private ? 'Private' : 'Public'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {accessConfig.mode === 'selected' && accessConfig.repositories.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No repositories selected. Click Configure to select repositories.
            </div>
          )}

          {accessConfig.mode === 'all' && (
            <div className="text-sm text-muted-foreground">
              This MCP server has access to all repositories{' '}
              <Link
                href={`/${tenantId}/projects/${projectId}/settings`}
                className="text-primary underline-offset-4 hover:underline"
              >
                configured for this project
              </Link>
              .
            </div>
          )}
        </div>
      </div>

      <GitHubAccessEditDialog
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

/**
 * Helper function to check if a tool is a GitHub workapp
 */
export function isGitHubWorkapp(tool: MCPTool): boolean {
  return (
    Boolean((tool as any).isWorkApp) &&
    tool.config.type === 'mcp' &&
    tool.config.mcp.server.url.includes('/github')
  );
}
