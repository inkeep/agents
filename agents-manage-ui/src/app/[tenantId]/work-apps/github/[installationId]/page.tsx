'use client';

import { ArrowLeft, Building2, ExternalLink, RefreshCw, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ErrorContent } from '@/components/errors/full-page-error';
import { DisconnectInstallationDialog } from '@/components/settings/work-app-github-disconnect-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
        <Link
          href={`/${tenantId}/work-apps/github`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to GitHub Settings
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted">
              {installation.accountType === 'Organization' ? (
                <Building2 className="size-7 text-muted-foreground" />
              ) : (
                <User className="size-7 text-muted-foreground" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{installation.accountLogin}</h1>
              <p className="text-sm text-muted-foreground">GitHub {installation.accountType}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`size-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Repositories'}
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setDisconnectDialogOpen(true)}
            >
              Disconnect
            </Button>
          </div>
        </div>
      </div>

      {/* Installation Info */}
      <div className="rounded-lg border p-6 space-y-6">
        <h2 className="text-lg font-medium">Installation Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <ItemLabel>Status</ItemLabel>
            <ItemValue>
              <Badge variant={getStatusBadgeVariant(installation.status)}>
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
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {installation.installationId}
              </code>
            </ItemValue>
          </div>

          <div className="space-y-2">
            <ItemLabel>Connected</ItemLabel>
            <ItemValue>{formatDateTimeTable(installation.createdAt, { local: true })}</ItemValue>
          </div>

          <div className="space-y-2">
            <ItemLabel>Last Updated</ItemLabel>
            <ItemValue>{formatDateTimeTable(installation.updatedAt, { local: true })}</ItemValue>
          </div>

          <div className="space-y-2">
            <ItemLabel>GitHub Settings</ItemLabel>
            <ItemValue>
              <a
                href={getGitHubInstallationSettingsUrl(
                  installation.installationId,
                  installation.accountType,
                  installation.accountLogin
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                View on GitHub
                <ExternalLink className="size-3" />
              </a>
            </ItemValue>
          </div>
        </div>
      </div>

      {/* Repositories */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium">Repositories</h2>
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
                        className="font-medium hover:underline inline-flex items-center gap-1"
                      >
                        {repo.repositoryName}
                        <ExternalLink className="size-3" />
                      </a>
                      <p className="text-xs text-muted-foreground">{repo.repositoryFullName}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={repo.private ? 'code' : 'success'}>
                      {repo.private ? 'Private' : 'Public'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(repo.createdAt, { local: true })}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" asChild>
                      <a
                        href={`https://github.com/${repo.repositoryFullName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="size-4" />
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
