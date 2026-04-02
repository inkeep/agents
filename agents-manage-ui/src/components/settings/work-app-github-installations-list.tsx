'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  Building2,
  ExternalLink,
  Github,
  MoreHorizontal,
  RefreshCw,
  Unplug,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { WorkAppGitHubInstallation } from '@/lib/api/github';
import {
  disconnectWorkAppGitHubInstallation,
  reconnectWorkAppGitHubInstallation,
  syncWorkAppGitHubRepositories,
} from '@/lib/api/github';
import { getGitHubInstallationSettingsUrl } from '@/lib/utils/work-app-github-utils';
import { DisconnectInstallationDialog } from './work-app-github-disconnect-dialog';

interface WorkAppGitHubInstallationsListProps {
  installations: WorkAppGitHubInstallation[];
  tenantId: string;
  onInstallationsChange?: () => void;
}

function getStatusBadgeVariant(status: WorkAppGitHubInstallation['status']) {
  switch (status) {
    case 'active':
      return 'success';
    case 'pending':
      return 'warning';
    case 'suspended':
      return 'error';
    case 'disconnected':
      return 'error';
    default:
      return 'code';
  }
}

function getStatusLabel(status: WorkAppGitHubInstallation['status']) {
  switch (status) {
    case 'active':
      return 'Active';
    case 'pending':
      return 'Pending';
    case 'suspended':
      return 'Suspended';
    case 'disconnected':
      return 'Disconnected';
    default:
      return status;
  }
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function WorkAppGitHubInstallationsList({
  installations,
  tenantId,
  onInstallationsChange,
}: WorkAppGitHubInstallationsListProps) {
  const router = useRouter();
  const [syncingInstallationId, setSyncingInstallationId] = useState<string | null>(null);
  const [reconnectingInstallationId, setReconnectingInstallationId] = useState<string | null>(null);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [selectedInstallation, setSelectedInstallation] =
    useState<WorkAppGitHubInstallation | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleSync = useCallback(
    async (installation: WorkAppGitHubInstallation) => {
      setSyncingInstallationId(installation.id);
      try {
        const result = await syncWorkAppGitHubRepositories(tenantId, installation.id);
        toast.success('Repositories synced', {
          description: `Added ${result.syncResult.added}, removed ${result.syncResult.removed}, updated ${result.syncResult.updated} repositories`,
        });
        onInstallationsChange?.();
        router.refresh();
      } catch (error) {
        toast.error('Failed to sync repositories', {
          description: error instanceof Error ? error.message : 'An unexpected error occurred',
        });
      } finally {
        setSyncingInstallationId(null);
      }
    },
    [tenantId, onInstallationsChange, router]
  );

  const handleReconnect = useCallback(
    async (installation: WorkAppGitHubInstallation) => {
      setReconnectingInstallationId(installation.id);
      try {
        await reconnectWorkAppGitHubInstallation(tenantId, installation.id);
        toast.success('Installation reconnected', {
          description: `${installation.accountLogin} has been reconnected`,
        });
        onInstallationsChange?.();
        router.refresh();
      } catch (error) {
        toast.error('Failed to reconnect installation', {
          description: error instanceof Error ? error.message : 'An unexpected error occurred',
        });
      } finally {
        setReconnectingInstallationId(null);
      }
    },
    [tenantId, onInstallationsChange, router]
  );

  const openDisconnectDialog = useCallback((installation: WorkAppGitHubInstallation) => {
    setSelectedInstallation(installation);
    setDisconnectDialogOpen(true);
  }, []);

  const handleDisconnect = async () => {
    if (!selectedInstallation) return;

    setDisconnecting(true);
    try {
      await disconnectWorkAppGitHubInstallation(tenantId, selectedInstallation.id);
      toast.success('Installation disconnected', {
        description: `${selectedInstallation.accountLogin} has been disconnected`,
      });
      setDisconnectDialogOpen(false);
      setSelectedInstallation(null);
      onInstallationsChange?.();
      router.refresh();
    } catch (error) {
      toast.error('Failed to disconnect installation', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const columns: ColumnDef<WorkAppGitHubInstallation>[] = [
    {
      id: 'accountLogin',
      accessorFn: (row) => row.accountLogin,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Organization" />,
      sortingFn: 'text',
      cell: ({ row }) => (
        <Link
          href={`/${tenantId}/work-apps/github/${row.original.id}`}
          className="flex items-center gap-2 hover:underline"
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
            {row.original.accountType === 'Organization' ? (
              <Building2 className="size-4 text-muted-foreground" />
            ) : (
              <User className="size-4 text-muted-foreground" />
            )}
          </div>
          <span className="font-medium">{row.original.accountLogin}</span>
        </Link>
      ),
    },
    {
      accessorKey: 'accountType',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      sortingFn: 'text',
      cell: ({ row }) => <Badge variant="code">{row.original.accountType}</Badge>,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      sortingFn: 'text',
      cell: ({ row }) => (
        <Badge variant={getStatusBadgeVariant(row.original.status)}>
          {getStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: 'repositoryCount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Repositories" />,
      sortingFn: 'alphanumeric',
      cell: ({ row }) => <Badge variant="count">{row.original.repositoryCount}</Badge>,
    },
    {
      id: 'createdAt',
      accessorFn: (row) => new Date(row.createdAt),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Connected" />,
      sortingFn: 'datetime',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { className: 'w-[100px]' },
      cell: ({ row }) => {
        const installation = row.original;
        const isSyncing = syncingInstallationId === installation.id;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" disabled={isSyncing}>
                {isSyncing ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="size-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {installation.status === 'disconnected' ? (
                <>
                  <DropdownMenuItem
                    onClick={() => handleReconnect(installation)}
                    disabled={reconnectingInstallationId === installation.id}
                  >
                    <RefreshCw
                      className={`size-4 ${reconnectingInstallationId === installation.id ? 'animate-spin' : ''}`}
                    />
                    Reconnect
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a
                      href={getGitHubInstallationSettingsUrl(
                        installation.installationId,
                        installation.accountType,
                        installation.accountLogin
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-destructive focus:text-destructive"
                    >
                      <ExternalLink className="size-4" />
                      Uninstall on GitHub
                    </a>
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/${tenantId}/work-apps/github/${installation.id}`}>
                      <Github className="size-4" />
                      View Details
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSync(installation)} disabled={isSyncing}>
                    <RefreshCw className={`size-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    Sync Repositories
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a
                      href={getGitHubInstallationSettingsUrl(
                        installation.installationId,
                        installation.accountType,
                        installation.accountLogin
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-4" />
                      View on GitHub
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => openDisconnectDialog(installation)}
                  >
                    <Unplug className="size-4" />
                    Disconnect
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  if (installations.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-md font-medium text-gray-700 dark:text-white/70">
            Connected Organizations
          </h2>
          <Badge variant="count">{installations.length}</Badge>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={installations}
        defaultSort={[{ id: 'accountLogin', desc: false }]}
        getRowId={(row) => row.id}
      />

      {selectedInstallation && (
        <DisconnectInstallationDialog
          open={disconnectDialogOpen}
          onOpenChange={setDisconnectDialogOpen}
          accountLogin={selectedInstallation.accountLogin}
          onConfirm={handleDisconnect}
          isDisconnecting={disconnecting}
        />
      )}
    </div>
  );
}
