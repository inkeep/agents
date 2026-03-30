'use client';

import { Building2, Github, Loader2, RefreshCw, User } from 'lucide-react';
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
import {
  fetchWorkAppGitHubInstallationDetail,
  fetchWorkAppGitHubInstallations,
  getMcpToolWorkAppGitHubAccess,
  getProjectWorkAppGitHubAccess,
  setMcpToolWorkAppGitHubAccess,
  syncWorkAppGitHubRepositories,
  type WorkAppGitHubAccessMode,
  type WorkAppGitHubInstallation,
  type WorkAppGitHubProjectAccess,
  type WorkAppGitHubRepository,
} from '@/lib/api/github';
import type { MCPTool } from '@/lib/types/tools';

interface GitHubAccessEditDialogProps {
  tool: MCPTool;
  tenantId: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface InstallationWithRepos {
  installation: WorkAppGitHubInstallation;
  repositories: WorkAppGitHubRepository[];
}

export function GitHubAccessEditDialog({
  tool,
  tenantId,
  projectId,
  open,
  onOpenChange,
  onSuccess,
}: GitHubAccessEditDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setSyncing] = useState<string | null>(null);

  const [installations, setInstallations] = useState<WorkAppGitHubInstallation[]>([]);
  const [projectAccess, setProjectAccess] = useState<WorkAppGitHubProjectAccess | null>(null);
  const [installationsWithRepos, setInstallationsWithRepos] = useState<InstallationWithRepos[]>([]);

  const [mode, setMode] = useState<WorkAppGitHubAccessMode>('all');
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);

      // Fetch all data in parallel
      const [installationsData, accessData, currentConfig] = await Promise.all([
        fetchWorkAppGitHubInstallations(tenantId),
        getProjectWorkAppGitHubAccess(tenantId, projectId),
        getMcpToolWorkAppGitHubAccess(tenantId, projectId, tool.id),
      ]);

      setInstallations(installationsData);
      setProjectAccess(accessData);

      // Pre-populate with current configuration
      setMode(currentConfig.mode);
      if (currentConfig.mode === 'selected') {
        setSelectedRepoIds(new Set(currentConfig.repositories.map((r) => r.id)));
      }

      // Load repository details
      const activeInstallations = installationsData.filter((i) => i.status === 'active');
      const installationsDataWithRepos = await Promise.all(
        activeInstallations.map(async (installation) => {
          const detail = await fetchWorkAppGitHubInstallationDetail(tenantId, installation.id);
          return {
            installation,
            repositories: detail.repositories,
          };
        })
      );
      setInstallationsWithRepos(installationsDataWithRepos);
    } catch (error) {
      console.error('Failed to load GitHub data:', error);
      toast.error('Failed to load GitHub access configuration');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, projectId, tool.id]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  const handleSync = async (installationId: string) => {
    setSyncing(installationId);
    try {
      await syncWorkAppGitHubRepositories(tenantId, installationId);
      // Reload installation details
      const installation = installations.find((i) => i.id === installationId);
      if (installation) {
        const detail = await fetchWorkAppGitHubInstallationDetail(tenantId, installationId);
        setInstallationsWithRepos((prev) =>
          prev.map((item) =>
            item.installation.id === installationId
              ? { ...item, repositories: detail.repositories }
              : item
          )
        );
      }
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

  const getAvailableRepositories = useCallback((): WorkAppGitHubRepository[] => {
    if (!projectAccess) return [];

    if (projectAccess.mode === 'all') {
      return installationsWithRepos.flatMap((i) => i.repositories);
    }

    return projectAccess.repositories;
  }, [projectAccess, installationsWithRepos]);

  const handleSelectAllForInstallation = (repos: WorkAppGitHubRepository[], checked: boolean) => {
    const availableRepoIds = new Set(getAvailableRepositories().map((r) => r.id));

    setSelectedRepoIds((prev) => {
      const newSet = new Set(prev);
      for (const repo of repos) {
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

  const getFilteredInstallationsWithRepos = (): InstallationWithRepos[] => {
    if (!projectAccess) return [];

    if (projectAccess.mode === 'all') {
      return installationsWithRepos;
    }

    const projectRepoIds = new Set(projectAccess.repositories.map((r) => r.id));

    return installationsWithRepos
      .map((item) => ({
        installation: item.installation,
        repositories: item.repositories.filter((r) => projectRepoIds.has(r.id)),
      }))
      .filter((item) => item.repositories.length > 0);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const repositoryIds = mode === 'selected' ? Array.from(selectedRepoIds) : undefined;
      await setMcpToolWorkAppGitHubAccess(tenantId, projectId, tool.id, mode, repositoryIds);
      toast.success('GitHub access updated successfully');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to update GitHub access:', error);
      toast.error('Failed to update GitHub access. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredInstallations = getFilteredInstallationsWithRepos();
  const availableRepos = getAvailableRepositories();
  const totalRepos = availableRepos.length;
  const isFormValid = mode === 'all' || selectedRepoIds.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="size-5" />
            Edit GitHub Access
          </DialogTitle>
          <DialogDescription>
            Update which repositories this MCP server can access.
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
                <Label className="text-sm font-medium">Access Mode</Label>
                <RadioGroup
                  value={mode}
                  onValueChange={(value) => setMode(value as WorkAppGitHubAccessMode)}
                  className="space-y-2"
                >
                  <label
                    htmlFor="edit-mode-all"
                    className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <RadioGroupItem value="all" id="edit-mode-all" className="mt-1" />
                    <div className="flex-1">
                      <span className="font-medium">All project repositories</span>
                      <p className="text-sm text-muted-foreground mt-1">
                        MCP server can access any repository this project has access to (
                        {totalRepos} {totalRepos === 1 ? 'repository' : 'repositories'} available)
                      </p>
                    </div>
                  </label>
                  <label
                    htmlFor="edit-mode-selected"
                    className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <RadioGroupItem value="selected" id="edit-mode-selected" className="mt-1" />
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

                  {filteredInstallations.length === 0 ? (
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
                                    id={`edit-select-all-${installation.id}`}
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
                                    htmlFor={`edit-select-all-${installation.id}`}
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

                  {mode === 'selected' && selectedRepoIds.size === 0 && (
                    <p className="text-sm text-destructive">
                      Please select at least one repository
                    </p>
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
