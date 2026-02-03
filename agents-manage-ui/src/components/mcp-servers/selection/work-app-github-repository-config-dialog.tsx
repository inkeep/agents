'use client';

import { Building2, ExternalLink, Github, Loader2, RefreshCw, User } from 'lucide-react';
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
import { useRuntimeConfig } from '@/contexts/runtime-config';
import {
  fetchWorkAppGitHubInstallationDetail,
  fetchWorkAppGitHubInstallations,
  getProjectWorkAppGitHubAccess,
  setMcpToolWorkAppGitHubAccess,
  syncWorkAppGitHubRepositories,
  type WorkAppGitHubAccessMode,
  type WorkAppGitHubInstallation,
  type WorkAppGitHubProjectAccess,
  type WorkAppGitHubRepository,
} from '@/lib/api/github';
import { createMCPTool } from '@/lib/api/tools';
import { generateId } from '@/lib/utils/id-utils';

interface WorkAppGitHubRepositoryConfigDialogProps {
  tenantId: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (toolId: string) => void;
}

type DialogState = 'loading' | 'no-installations' | 'no-project-access' | 'ready';

interface InstallationWithRepos {
  installation: WorkAppGitHubInstallation;
  repositories: WorkAppGitHubRepository[];
}

export function WorkAppGitHubRepositoryConfigDialog({
  tenantId,
  projectId,
  open,
  onOpenChange,
  onSuccess,
}: WorkAppGitHubRepositoryConfigDialogProps) {
  const [dialogState, setDialogState] = useState<DialogState>('loading');
  const [installations, setInstallations] = useState<WorkAppGitHubInstallation[]>([]);
  const [projectAccess, setProjectAccess] = useState<WorkAppGitHubProjectAccess | null>(null);

  const loadData = useCallback(async () => {
    try {
      setDialogState('loading');

      const [installationsData, accessData] = await Promise.all([
        fetchWorkAppGitHubInstallations(tenantId),
        getProjectWorkAppGitHubAccess(tenantId, projectId),
      ]);

      setInstallations(installationsData);
      setProjectAccess(accessData);

      // Check for empty states
      const activeInstallations = installationsData.filter((i) => i.status === 'active');

      if (activeInstallations.length === 0) {
        setDialogState('no-installations');
        return;
      }

      // Check if project has access configured
      // If mode is 'all' OR mode is 'selected' with repositories, project has access
      const hasProjectAccess =
        accessData.mode === 'all' ||
        (accessData.mode === 'selected' && accessData.repositories.length > 0);

      if (!hasProjectAccess) {
        setDialogState('no-project-access');
        return;
      }

      setDialogState('ready');
    } catch (error) {
      console.error('Failed to load GitHub data:', error);
      setDialogState('no-installations');
    }
  }, [tenantId, projectId]);

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
            <Github className="size-5" />
            Configure GitHub MCP Server
          </DialogTitle>
          <DialogDescription>
            Set up a GitHub MCP server with access to your repositories.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {dialogState === 'loading' && <LoadingState />}

          {dialogState === 'no-installations' && (
            <NoInstallationsState tenantId={tenantId} onOpenChange={onOpenChange} />
          )}

          {dialogState === 'no-project-access' && (
            <NoProjectAccessState
              tenantId={tenantId}
              projectId={projectId}
              onOpenChange={onOpenChange}
            />
          )}

          {dialogState === 'ready' && (
            <ReadyState
              tenantId={tenantId}
              projectId={projectId}
              installations={installations}
              projectAccess={projectAccess}
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

interface NoInstallationsStateProps {
  tenantId: string;
  onOpenChange: (open: boolean) => void;
}

function NoInstallationsState({ tenantId, onOpenChange }: NoInstallationsStateProps) {
  return (
    <div className="rounded-lg border bg-muted/50 p-6">
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="size-12 rounded-full bg-muted flex items-center justify-center">
          <Github className="size-6 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h3 className="font-medium">Install the GitHub App</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            To use the GitHub integration, you need to install the GitHub App and connect it to your
            organization.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button asChild>
            <Link href={`/${tenantId}/work-apps/github`}>
              Connect GitHub
              <ExternalLink className="size-3 ml-1.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

interface NoProjectAccessStateProps {
  tenantId: string;
  projectId: string;
  onOpenChange: (open: boolean) => void;
}

function NoProjectAccessState({ tenantId, projectId, onOpenChange }: NoProjectAccessStateProps) {
  return (
    <div className="rounded-lg border bg-muted/50 p-6">
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="size-12 rounded-full bg-muted flex items-center justify-center">
          <Github className="size-6 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h3 className="font-medium">Configure GitHub Access for This Project</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            This project doesn't have GitHub repository access configured yet. Configure which
            repositories this project can access in project settings.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button asChild>
            <Link href={`/${tenantId}/projects/${projectId}/settings`}>
              Configure Project Settings
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
  installations: WorkAppGitHubInstallation[];
  projectAccess: WorkAppGitHubProjectAccess | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (toolId: string) => void;
}

function ReadyState({
  tenantId,
  projectId,
  installations,
  projectAccess,
  onOpenChange,
  onSuccess,
}: ReadyStateProps) {
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const [mode, setMode] = useState<WorkAppGitHubAccessMode>('all');
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<string>>(new Set());
  const [installationsWithRepos, setInstallationsWithRepos] = useState<InstallationWithRepos[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setSyncing] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get the available repositories based on project access
  const getAvailableRepositories = useCallback((): WorkAppGitHubRepository[] => {
    if (!projectAccess) return [];

    if (projectAccess.mode === 'all') {
      // Return all repositories from all installations
      return installationsWithRepos.flatMap((i) => i.repositories);
    }

    // Return only the repositories the project has access to
    return projectAccess.repositories;
  }, [projectAccess, installationsWithRepos]);

  const loadInstallationDetails = useCallback(async () => {
    try {
      setIsLoading(true);
      const activeInstallations = installations.filter((i) => i.status === 'active');

      const installationsData = await Promise.all(
        activeInstallations.map(async (installation) => {
          const detail = await fetchWorkAppGitHubInstallationDetail(tenantId, installation.id);
          return {
            installation,
            repositories: detail.repositories,
          };
        })
      );

      setInstallationsWithRepos(installationsData);
    } catch (error) {
      console.error('Failed to load installation details:', error);
      toast.error('Failed to load repository details');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, installations]);

  useEffect(() => {
    loadInstallationDetails();
  }, [loadInstallationDetails]);

  const handleSync = async (installationId: string) => {
    setSyncing(installationId);
    try {
      await syncWorkAppGitHubRepositories(tenantId, installationId);
      await loadInstallationDetails();
      toast.success('Repositories synced');
    } catch {
      toast.error('Failed to sync repositories');
    } finally {
      setSyncing(null);
    }
  };

  const handleRepoToggle = (repoId: string) => {
    setSelectedRepoIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(repoId)) {
        newSet.delete(repoId);
      } else {
        newSet.add(repoId);
      }
      return newSet;
    });
  };

  const handleSelectAllForInstallation = (repos: WorkAppGitHubRepository[], checked: boolean) => {
    const availableRepoIds = new Set(getAvailableRepositories().map((r) => r.id));

    setSelectedRepoIds((prev) => {
      const newSet = new Set(prev);
      for (const repo of repos) {
        // Only toggle repos that are available to this project
        if (availableRepoIds.has(repo.id)) {
          if (checked) {
            newSet.add(repo.id);
          } else {
            newSet.delete(repo.id);
          }
        }
      }
      return newSet;
    });
  };

  // Filter installations to only show repositories the project has access to
  const getFilteredInstallationsWithRepos = (): InstallationWithRepos[] => {
    if (!projectAccess) return [];

    if (projectAccess.mode === 'all') {
      // Show all repositories
      return installationsWithRepos;
    }

    // Filter to only show repositories the project has access to
    const projectRepoIds = new Set(projectAccess.repositories.map((r) => r.id));

    return installationsWithRepos
      .map((item) => ({
        installation: item.installation,
        repositories: item.repositories.filter((r) => projectRepoIds.has(r.id)),
      }))
      .filter((item) => item.repositories.length > 0);
  };

  const filteredInstallations = getFilteredInstallationsWithRepos();
  const availableRepos = getAvailableRepositories();
  const totalRepos = availableRepos.length;

  const isFormValid = mode === 'all' || selectedRepoIds.size > 0;

  const handleSubmit = async () => {
    if (!isFormValid) return;

    setIsSubmitting(true);
    try {
      // Build the GitHub MCP server URL - must contain '/github' for validation
      const githubMcpUrl = `${PUBLIC_INKEEP_AGENTS_API_URL}/work-apps/github/mcp`;

      // Create the MCP tool with isWorkApp=true
      const toolId = generateId();
      const newTool = await createMCPTool(tenantId, projectId, {
        id: toolId,
        name: 'GitHub',
        config: {
          type: 'mcp' as const,
          mcp: {
            server: {
              url: githubMcpUrl,
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

      // Set the GitHub access configuration
      const repositoryIds = mode === 'selected' ? Array.from(selectedRepoIds) : undefined;
      await setMcpToolWorkAppGitHubAccess(tenantId, projectId, newTool.id, mode, repositoryIds);

      toast.success('GitHub MCP server created successfully');
      onOpenChange(false);
      onSuccess?.(newTool.id);
    } catch (error) {
      console.error('Failed to create GitHub MCP server:', error);
      toast.error('Failed to create GitHub MCP server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-sm font-medium">Access Mode</Label>
        <RadioGroup
          value={mode}
          onValueChange={(value) => setMode(value as WorkAppGitHubAccessMode)}
          className="space-y-2"
        >
          <label
            htmlFor="mode-all"
            className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <RadioGroupItem value="all" id="mode-all" className="mt-1" />
            <div className="flex-1">
              <span className="font-medium">All project repositories</span>
              <p className="text-sm text-muted-foreground mt-1">
                MCP server can access any repository this project has access to ({totalRepos}{' '}
                {totalRepos === 1 ? 'repository' : 'repositories'} available)
              </p>
            </div>
          </label>
          <label
            htmlFor="mode-selected"
            className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <RadioGroupItem value="selected" id="mode-selected" className="mt-1" />
            <div className="flex-1">
              <span className="font-medium">Selected repositories</span>
              <p className="text-sm text-muted-foreground mt-1">
                MCP server can only access specific repositories you select below
                {selectedRepoIds.size > 0 && ` (${selectedRepoIds.size} selected)`}
              </p>
            </div>
          </label>
        </RadioGroup>
      </div>

      {mode === 'selected' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Select Repositories</Label>
            {selectedRepoIds.size > 0 && (
              <Badge variant="count">{selectedRepoIds.size} selected</Badge>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : filteredInstallations.length === 0 ? (
            <div className="rounded-lg border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
              No repositories available.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredInstallations.map(({ installation, repositories }) => {
                const allSelected = repositories.every((r) => selectedRepoIds.has(r.id));
                const someSelected =
                  repositories.some((r) => selectedRepoIds.has(r.id)) && !allSelected;

                return (
                  <div key={installation.id} className="rounded-lg border">
                    <div className="flex items-center justify-between gap-3 p-3 border-b bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-full bg-background border">
                          {installation.accountType === 'Organization' ? (
                            <Building2 className="size-4 text-muted-foreground" />
                          ) : (
                            <User className="size-4 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{installation.accountLogin}</p>
                          <p className="text-xs text-muted-foreground">
                            {repositories.length} repositories
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSync(installation.id)}
                          disabled={isSyncing === installation.id}
                        >
                          <RefreshCw
                            className={`size-4 mr-1.5 ${isSyncing === installation.id ? 'animate-spin' : ''}`}
                          />
                          Sync
                        </Button>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`select-all-${installation.id}`}
                            checked={allSelected}
                            ref={(el) => {
                              if (el) {
                                (
                                  el as HTMLButtonElement & { indeterminate: boolean }
                                ).indeterminate = someSelected;
                              }
                            }}
                            onCheckedChange={(checked) =>
                              handleSelectAllForInstallation(repositories, checked === true)
                            }
                          />
                          <Label
                            htmlFor={`select-all-${installation.id}`}
                            className="text-xs text-muted-foreground cursor-pointer"
                          >
                            Select all
                          </Label>
                        </div>
                      </div>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      {repositories.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No repositories found. Try syncing.
                        </div>
                      ) : (
                        <div className="divide-y">
                          {repositories.map((repo) => (
                            <div
                              key={repo.id}
                              role="button"
                              tabIndex={0}
                              className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors cursor-pointer"
                              onClick={() => handleRepoToggle(repo.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleRepoToggle(repo.id);
                                }
                              }}
                            >
                              <Checkbox
                                checked={selectedRepoIds.has(repo.id)}
                                onCheckedChange={() => handleRepoToggle(repo.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {repo.repositoryName}
                                </p>
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
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {mode === 'selected' && selectedRepoIds.size === 0 && !isLoading && (
            <p className="text-sm text-destructive">Please select at least one repository</p>
          )}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!isFormValid || isLoading || isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 mr-2 animate-spin" />}
          {isSubmitting ? 'Creating...' : 'Create GitHub MCP Server'}
        </Button>
      </DialogFooter>
    </div>
  );
}
