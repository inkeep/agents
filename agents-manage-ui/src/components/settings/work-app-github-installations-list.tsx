'use client';

import { Building2, ExternalLink, Github, MoreHorizontal, RefreshCw, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

  const handleSync = async (installation: WorkAppGitHubInstallation) => {
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
  };

  const handleReconnect = async (installation: WorkAppGitHubInstallation) => {
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
  };

  const openDisconnectDialog = (installation: WorkAppGitHubInstallation) => {
    setSelectedInstallation(installation);
    setDisconnectDialogOpen(true);
  };

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
      <Table>
        <TableHeader>
          <TableRow noHover>
            <TableHead>Organization</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Repositories</TableHead>
            <TableHead>Connected</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {installations.map((installation: WorkAppGitHubInstallation) => {
            const isSyncing = syncingInstallationId === installation.id;
            return (
              <TableRow key={installation.id} noHover>
                <TableCell>
                  <Link
                    href={`/${tenantId}/work-apps/github/${installation.id}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                      {installation.accountType === 'Organization' ? (
                        <Building2 className="size-4 text-muted-foreground" />
                      ) : (
                        <User className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <span className="font-medium">{installation.accountLogin}</span>
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="code">{installation.accountType}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(installation.status)}>
                    {getStatusLabel(installation.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="count">{installation.repositoryCount}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(installation.createdAt)}
                </TableCell>
                <TableCell>
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
                              className={`size-4 mr-2 ${reconnectingInstallationId === installation.id ? 'animate-spin' : ''}`}
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
                              <ExternalLink className="size-4 mr-2" />
                              Uninstall on GitHub
                            </a>
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <>
                          <DropdownMenuItem asChild>
                            <Link href={`/${tenantId}/work-apps/github/${installation.id}`}>
                              <Github className="size-4 mr-2" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSync(installation)}
                            disabled={isSyncing}
                          >
                            <RefreshCw
                              className={`size-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`}
                            />
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
                              <ExternalLink className="size-4 mr-2" />
                              View on GitHub
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => openDisconnectDialog(installation)}
                          >
                            Disconnect
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

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
