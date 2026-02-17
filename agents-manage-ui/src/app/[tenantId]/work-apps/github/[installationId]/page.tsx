'use client';

import { ArrowLeft, ArrowUpRight, Building2, RefreshCw, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ErrorContent } from '@/components/errors/full-page-error';
import { DisconnectInstallationDialog } from '@/components/settings/work-app-github-disconnect-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRequireAuth } from '@/hooks/use-require-auth';
import type { WorkAppGitHubInstallationDetail, WorkAppGitHubRepository } from '@/lib/api/github';
import {
  disconnectWorkAppGitHubInstallation,
  fetchWorkAppGitHubInstallationDetail,
  syncWorkAppGitHubRepositories,
} from '@/lib/api/github';
import { formatDate, formatDateTimeTable } from '@/lib/utils/format-date';
import { getGitHubInstallationSettingsUrl } from '@/lib/utils/work-app-github-utils';
import GitHubInstallationDetailLoading from './loading';

interface PageParams {
  params: Promise<{ tenantId: string; installationId: string }>;
}

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'active':
      return 'success';
    case 'pending':
      return 'warning';
    case 'suspended':
      return 'error';
    case 'deleted':
      return 'code';
    default:
      return 'code';
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'active':
      return 'Active';
    case 'pending':
      return 'Pending Approval';
    case 'suspended':
      return 'Suspended';
    case 'deleted':
      return 'Deleted';
    default:
      return status;
  }
}

const ItemLabel = ({ children }: { children: React.ReactNode }) => {
  return <div className="text-sm font-medium leading-none">{children}</div>;
};

const ItemValue = ({ children }: { children: React.ReactNode }) => {
  return <div className="flex w-full text-sm text-muted-foreground">{children}</div>;
};

export default function GitHubInstallationDetailPage({ params }: PageParams) {
  useRequireAuth();
  const { tenantId, installationId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<WorkAppGitHubInstallationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadInstallation = useCallback(async () => {
    try {
      const detail = await fetchWorkAppGitHubInstallationDetail(tenantId, installationId);
      setData(detail);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch installation details');
    } finally {
      setLoading(false);
    }
  }, [tenantId, installationId]);

  useEffect(() => {
    loadInstallation();
  }, [loadInstallation]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncWorkAppGitHubRepositories(tenantId, installationId);
      toast.success('Repositories synced', {
        description: `Added ${result.syncResult.added}, removed ${result.syncResult.removed}, updated ${result.syncResult.updated} repositories`,
      });
      await loadInstallation();
    } catch (err) {
      toast.error('Failed to sync repositories', {
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!data) return;

    setDisconnecting(true);
    try {
      await disconnectWorkAppGitHubInstallation(tenantId, installationId);
      toast.success('Installation disconnected', {
        description: `${data.installation.accountLogin} has been disconnected`,
      });
      router.push(`/${tenantId}/work-apps/github`);
    } catch (err) {
      toast.error('Failed to disconnect installation', {
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
      });
    } finally {
      setDisconnecting(false);
      setDisconnectDialogOpen(false);
    }
  };

  if (loading) {
    return <GitHubInstallationDetailLoading />;
  }

  if (error || !data) {
    return <ErrorContent error={new Error(error || 'Installation not found')} context="github" />;
  }

  const { installation, repositories } = data;

  return (
    <div className="space-y-8">
      {/* Back link and Header */}
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link
            href={`/${tenantId}/work-apps/github`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to GitHub Settings
          </Link>
        </Button>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-lg bg-muted">
              {installation.accountType === 'Organization' ? (
                <Building2 className="size-7 text-muted-foreground" strokeWidth={1.5} />
              ) : (
                <User className="size-7 text-muted-foreground" strokeWidth={1.5} />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{installation.accountLogin}</h1>
              <p className="text-sm text-muted-foreground">GitHub {installation.accountType}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Repositories'}
            </Button>
            <Button variant="destructive-outline" onClick={() => setDisconnectDialogOpen(true)}>
              Disconnect
            </Button>
          </div>
        </div>
      </div>

      {/* Installation Info */}
      <div className="rounded-lg border p-6 space-y-6">
        <h2 className="font-medium">Installation Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <ItemLabel>Status</ItemLabel>
            <ItemValue>
              <Badge className="uppercase" variant={getStatusBadgeVariant(installation.status)}>
                {getStatusLabel(installation.status)}
              </Badge>
            </ItemValue>
          </div>

          {installation.status === 'pending' && (
            <div className="col-span-full rounded-lg border border-warning/50 bg-warning/5 p-4">
              <p className="text-sm text-warning-foreground">
                This installation is pending approval. A GitHub organization administrator needs to
                approve the installation request before it can be used.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <ItemLabel>Account Type</ItemLabel>
            <ItemValue>
              <Badge variant="code">{installation.accountType}</Badge>
            </ItemValue>
          </div>

          <div className="space-y-2">
            <ItemLabel>Installation ID</ItemLabel>
            <ItemValue>
              <Badge variant="code">{installation.installationId}</Badge>
            </ItemValue>
          </div>

          <div className="space-y-2">
            <ItemLabel>Connected</ItemLabel>
            <ItemValue>{formatDateTimeTable(installation.createdAt)}</ItemValue>
          </div>

          <div className="space-y-2">
            <ItemLabel>Last Updated</ItemLabel>
            <ItemValue>{formatDateTimeTable(installation.updatedAt)}</ItemValue>
          </div>

          <div className="space-y-2">
            <ItemLabel>GitHub Settings</ItemLabel>
            <ItemValue>
              <ExternalLink
                href={getGitHubInstallationSettingsUrl(
                  installation.installationId,
                  installation.accountType,
                  installation.accountLogin
                )}
                target="_blank"
                className="inline-flex items-center gap-1 text-primary hover:underline"
                iconClassName="text-primary"
              >
                View on GitHub
              </ExternalLink>
            </ItemValue>
          </div>
        </div>
      </div>

      {/* Repositories */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <h2 className="font-medium">Repositories</h2>
            <Badge variant="count">{repositories.length}</Badge>
          </div>
        </div>

        {repositories.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow noHover>
                <TableHead>Repository</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {repositories.map((repo: WorkAppGitHubRepository) => (
                <TableRow key={repo.id} noHover>
                  <TableCell>
                    <div className="space-y-1">
                      <a
                        href={`https://github.com/${repo.repositoryFullName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline inline-flex items-center gap-1 group/link"
                      >
                        {repo.repositoryName}
                        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover/link:opacity-100 group-hover/link:text-primary" />
                      </a>
                      <p className="text-xs text-muted-foreground">{repo.repositoryFullName}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className="uppercase" variant={repo.private ? 'code' : 'primary'}>
                      {repo.private ? 'Private' : 'Public'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(repo.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" asChild>
                      <a
                        href={`https://github.com/${repo.repositoryFullName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span className="sr-only">View on GitHub</span>
                        <ArrowUpRight className="size-4" />
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="px-4 pb-4">
            <p className="text-sm text-muted-foreground text-center py-8">
              No repositories available. Click "Sync Repositories" to refresh the list from GitHub.
            </p>
          </div>
        )}
      </div>

      {/* Disconnect Dialog */}
      <DisconnectInstallationDialog
        open={disconnectDialogOpen}
        onOpenChange={setDisconnectDialogOpen}
        accountLogin={installation.accountLogin}
        onConfirm={handleDisconnect}
        isDisconnecting={disconnecting}
      />
    </div>
  );
}
