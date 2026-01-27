'use client';

import { Building2, ChevronRight, ExternalLink, Github, Info, RefreshCw, User } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InfoCard } from '@/components/ui/info-card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  fetchGitHubInstallations,
  type GitHubAccessMode,
  type GitHubInstallation,
  type GitHubRepository,
  getProjectGitHubAccess,
  type ProjectGitHubAccess,
  setProjectGitHubAccess,
} from '@/lib/api/github';

interface ProjectGitHubAccessSectionProps {
  tenantId: string;
  projectId: string;
  disabled?: boolean;
}

interface InstallationWithRepos {
  installation: GitHubInstallation;
  repositories: GitHubRepository[];
}

export function ProjectGitHubAccessSection({
  tenantId,
  projectId,
  disabled = false,
}: ProjectGitHubAccessSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [accessConfig, setAccessConfig] = useState<ProjectGitHubAccess | null>(null);
  const [hasInstallations, setHasInstallations] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadAccessConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      const [access, installations] = await Promise.all([
        getProjectGitHubAccess(tenantId, projectId),
        fetchGitHubInstallations(tenantId),
      ]);
      setAccessConfig(access);
      setHasInstallations(installations.length > 0);
    } catch (error) {
      console.error('Failed to load GitHub access config:', error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, projectId]);

  useEffect(() => {
    loadAccessConfig();
  }, [loadAccessConfig]);

  const handleConfigSaved = useCallback(() => {
    loadAccessConfig();
    setDialogOpen(false);
  }, [loadAccessConfig]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64 mt-1" />
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!hasInstallations) {
    return (
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">GitHub repository access</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Control which GitHub repositories this project can access for tools and integrations.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex items-start gap-3">
            <Github className="size-5 text-muted-foreground mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                No GitHub organizations connected to this tenant.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/${tenantId}/settings/github`}>
                  Connect GitHub
                  <ExternalLink className="size-3 ml-1.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">GitHub repository access</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Control which GitHub repositories this project can access for tools and integrations.
        </p>
      </div>

      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className="border rounded-md bg-background"
      >
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex items-center justify-start gap-2 w-full group p-0 h-auto hover:!bg-transparent transition-colors py-2 px-4"
          >
            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            Configure GitHub access
            <span className="ml-auto text-muted-foreground font-normal">
              {accessConfig?.mode === 'all'
                ? 'All repositories'
                : `${accessConfig?.repositories.length || 0} selected`}
            </span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 mt-4 data-[state=closed]:animate-[collapsible-up_200ms_ease-out] data-[state=open]:animate-[collapsible-down_200ms_ease-out] overflow-hidden px-4 pb-6">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Github className="size-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {accessConfig?.mode === 'all' ? 'All repositories' : 'Selected repositories'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {accessConfig?.mode === 'all'
                      ? 'This project can access all repositories from connected GitHub organizations'
                      : `This project can access ${accessConfig?.repositories.length || 0} specific repositories`}
                  </p>
                </div>
              </div>
              {!disabled && (
                <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                  Configure Access
                </Button>
              )}
            </div>
          </div>

          {accessConfig?.mode === 'selected' && accessConfig.repositories.length > 0 && (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow noHover>
                    <TableHead>Repository</TableHead>
                    <TableHead>Visibility</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessConfig.repositories.map((repo) => (
                    <TableRow key={repo.id} noHover>
                      <TableCell>
                        <a
                          href={`https://github.com/${repo.repositoryFullName}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 hover:underline"
                        >
                          <span className="font-medium">{repo.repositoryName}</span>
                          <span className="text-muted-foreground text-xs">
                            {repo.repositoryFullName.split('/')[0]}
                          </span>
                          <ExternalLink className="size-3 text-muted-foreground" />
                        </a>
                      </TableCell>
                      <TableCell>
                        <Badge variant={repo.private ? 'code' : 'success'}>
                          {repo.private ? 'Private' : 'Public'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <InfoCard title="About GitHub access:" Icon={Info}>
            <ul className="space-y-1.5 list-disc list-outside pl-4">
              <li>
                <span className="font-medium">All repositories</span>: Project can access any
                repository from connected GitHub organizations
              </li>
              <li>
                <span className="font-medium">Selected repositories</span>: Project is scoped to
                specific repositories you choose
              </li>
              <li>
                Repository access is used for GitHub-related tools and integrations within agents
              </li>
            </ul>
          </InfoCard>
        </CollapsibleContent>
      </Collapsible>

      {dialogOpen && (
        <ConfigureAccessDialog
          tenantId={tenantId}
          projectId={projectId}
          currentConfig={accessConfig}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSaved={handleConfigSaved}
        />
      )}
    </div>
  );
}

interface ConfigureAccessDialogProps {
  tenantId: string;
  projectId: string;
  currentConfig: ProjectGitHubAccess | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function ConfigureAccessDialog({
  tenantId,
  projectId,
  currentConfig,
  open,
  onOpenChange,
  onSaved,
}: ConfigureAccessDialogProps) {
  const [mode, setMode] = useState<GitHubAccessMode>(currentConfig?.mode || 'all');
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<string>>(
    new Set(currentConfig?.repositories.map((r) => r.id) || [])
  );
  const [installationsWithRepos, setInstallationsWithRepos] = useState<InstallationWithRepos[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setSyncing] = useState<string | null>(null);

  const loadInstallations = useCallback(async () => {
    try {
      setIsLoading(true);
      const installations = await fetchGitHubInstallations(tenantId);

      const installationsData = await Promise.all(
        installations
          .filter((i) => i.status === 'active')
          .map(async (installation) => {
            const { fetchGitHubInstallationDetail } = await import('@/lib/api/github');
            const detail = await fetchGitHubInstallationDetail(tenantId, installation.id);
            return {
              installation,
              repositories: detail.repositories,
            };
          })
      );

      setInstallationsWithRepos(installationsData);
    } catch (error) {
      console.error('Failed to load installations:', error);
      toast.error('Failed to load GitHub installations');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (open) {
      loadInstallations();
    }
  }, [open, loadInstallations]);

  const handleSync = async (installationId: string) => {
    setSyncing(installationId);
    try {
      const { syncGitHubRepositories } = await import('@/lib/api/github');
      await syncGitHubRepositories(tenantId, installationId);
      await loadInstallations();
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

  const handleSelectAllForInstallation = (repos: GitHubRepository[], checked: boolean) => {
    setSelectedRepoIds((prev) => {
      const newSet = new Set(prev);
      for (const repo of repos) {
        if (checked) {
          newSet.add(repo.id);
        } else {
          newSet.delete(repo.id);
        }
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    if (mode === 'selected' && selectedRepoIds.size === 0) {
      toast.error('Please select at least one repository');
      return;
    }

    setIsSaving(true);
    try {
      await setProjectGitHubAccess(
        tenantId,
        projectId,
        mode,
        mode === 'selected' ? Array.from(selectedRepoIds) : undefined
      );
      toast.success('GitHub access configuration saved');
      onSaved();
    } catch (error) {
      toast.error('Failed to save configuration', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const totalRepos = installationsWithRepos.reduce((acc, i) => acc + i.repositories.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="size-5" />
            Configure GitHub Repository Access
          </DialogTitle>
          <DialogDescription>
            Choose which GitHub repositories this project can access.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Access Mode</Label>
            <RadioGroup
              value={mode}
              onValueChange={(value) => setMode(value as GitHubAccessMode)}
              className="space-y-2"
            >
              <div className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="all" id="mode-all" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="mode-all" className="cursor-pointer font-medium">
                    All repositories
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Project can access any repository from connected GitHub organizations (
                    {totalRepos} repositories available)
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="selected" id="mode-selected" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="mode-selected" className="cursor-pointer font-medium">
                    Selected repositories
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Project can only access specific repositories you select below
                    {selectedRepoIds.size > 0 && ` (${selectedRepoIds.size} selected)`}
                  </p>
                </div>
              </div>
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
              ) : installationsWithRepos.length === 0 ? (
                <div className="rounded-lg border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                  No active GitHub installations found.
                </div>
              ) : (
                <div className="space-y-4">
                  {installationsWithRepos.map(({ installation, repositories }) => {
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
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
