'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  Clock,
  CopyPlus,
  History,
  MoreHorizontal,
  Pencil,
  Play,
  RotateCw,
  Trash2,
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
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthSession } from '@/hooks/use-auth';
import { useIsOrgAdmin } from '@/hooks/use-is-org-admin';
import { useOrgMembers } from '@/hooks/use-org-members';
import {
  deleteScheduledTriggerAction,
  runScheduledTriggerNowAction,
  updateScheduledTriggerEnabledAction,
} from '@/lib/actions/scheduled-triggers';
import type { ScheduledTriggerWithAgent } from '@/lib/api/project-triggers';
import { getCronDescription } from '@/lib/utils/cron';
import {
  formatDateTimeLocal,
  getLocalTimezoneAbbreviation,
  getTimezoneAbbreviation,
} from '@/lib/utils/format-date';

interface ProjectScheduledTriggersTableProps {
  triggers: ScheduledTriggerWithAgent[];
  tenantId: string;
  projectId: string;
}

function getScheduleType(trigger: ScheduledTriggerWithAgent): 'cron' | 'one-time' {
  return trigger.cronExpression ? 'cron' : 'one-time';
}

function getTriggerTimezone(trigger: ScheduledTriggerWithAgent): string {
  return trigger.cronTimezone || 'UTC';
}

function formatLastRun(trigger: ScheduledTriggerWithAgent): string {
  if (trigger.lastRunAt) {
    return formatDateTimeLocal(trigger.lastRunAt);
  }
  return '—';
}

function formatNextRun(trigger: ScheduledTriggerWithAgent): string {
  if (!trigger.enabled) {
    return '—';
  }
  if (trigger.nextRunAt) {
    return formatDateTimeLocal(trigger.nextRunAt);
  }
  return '—';
}

export function ProjectScheduledTriggersTable({
  triggers,
  tenantId,
  projectId,
}: ProjectScheduledTriggersTableProps) {
  const router = useRouter();
  const [loadingTriggers, setLoadingTriggers] = useState<Set<string>>(new Set());
  const { members: orgMembers } = useOrgMembers(tenantId);
  const { user } = useAuthSession();
  const { isAdmin } = useIsOrgAdmin();

  const canManageTrigger = useCallback(
    (trigger: ScheduledTriggerWithAgent): boolean => {
      if (isAdmin) return true;
      if (!user) return false;
      return trigger.createdBy === user.id || trigger.runAsUserId === user.id;
    },
    [isAdmin, user]
  );

  const getUserDisplayName = useCallback(
    (userId: string): string => {
      const member = orgMembers.find((m) => m.id === userId);
      return member?.name || member?.email || userId;
    },
    [orgMembers]
  );

  const toggleEnabled = useCallback(
    async (triggerId: string, agentId: string, currentEnabled: boolean) => {
      const newEnabled = !currentEnabled;
      setLoadingTriggers((prev) => new Set(prev).add(triggerId));

      try {
        const result = await updateScheduledTriggerEnabledAction(
          tenantId,
          projectId,
          agentId,
          triggerId,
          newEnabled
        );
        if (result.success) {
          toast.success(`Scheduled trigger ${newEnabled ? 'enabled' : 'disabled'}`);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch (error) {
        console.error('Failed to update scheduled trigger:', error);
        toast.error('Failed to update scheduled trigger status');
      } finally {
        setLoadingTriggers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(triggerId);
          return newSet;
        });
      }
    },
    [tenantId, projectId, router]
  );

  const deleteTrigger = useCallback(
    async (triggerId: string, agentId: string, name: string) => {
      if (!confirm(`Are you sure you want to delete the scheduled trigger "${name}"?`)) {
        return;
      }

      setLoadingTriggers((prev) => new Set(prev).add(triggerId));

      try {
        const result = await deleteScheduledTriggerAction(tenantId, projectId, agentId, triggerId);
        if (result.success) {
          toast.success(`Scheduled trigger "${name}" deleted successfully`);
          router.refresh();
        } else {
          toast.error(result.error);
          setLoadingTriggers((prev) => {
            const newSet = new Set(prev);
            newSet.delete(triggerId);
            return newSet;
          });
        }
      } catch (error) {
        console.error('Failed to delete scheduled trigger:', error);
        toast.error('Failed to delete scheduled trigger');
        setLoadingTriggers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(triggerId);
          return newSet;
        });
      }
    },
    [tenantId, projectId, router]
  );

  const runTrigger = useCallback(
    async (triggerId: string, agentId: string, name: string) => {
      setLoadingTriggers((prev) => new Set(prev).add(triggerId));

      try {
        const result = await runScheduledTriggerNowAction(tenantId, projectId, agentId, triggerId);
        if (result.success) {
          toast.success(`Scheduled trigger "${name}" started`);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch (error) {
        console.error('Failed to run scheduled trigger:', error);
        toast.error('Failed to run scheduled trigger');
      } finally {
        setLoadingTriggers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(triggerId);
          return newSet;
        });
      }
    },
    [tenantId, projectId, router]
  );

  const localTz = getLocalTimezoneAbbreviation();

  const columns = useMemo<ColumnDef<ScheduledTriggerWithAgent>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        sortingFn: 'text',
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{row.original.name}</div>
            {row.original.description && (
              <div className="text-sm text-muted-foreground max-w-md truncate">
                {row.original.description}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'agentName',
        accessorFn: (row) => row.agentName,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Agent" />,
        sortingFn: 'text',
        cell: ({ row }) => (
          <Link
            href={`/${tenantId}/projects/${projectId}/agents/${row.original.agentId}`}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            {row.original.agentName}
          </Link>
        ),
      },
      {
        id: 'runAs',
        header: 'Run As',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.runAsUserId ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm text-muted-foreground truncate max-w-[150px] inline-block cursor-default">
                    {getUserDisplayName(row.original.runAsUserId)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <code className="font-mono text-xs">{row.original.runAsUserId}</code>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'type',
        header: 'Type',
        enableSorting: false,
        cell: ({ row }) => {
          const scheduleType = getScheduleType(row.original);
          return (
            <Badge variant="code" className="gap-1 uppercase">
              {scheduleType === 'cron' ? (
                <RotateCw className="w-3 h-3" />
              ) : (
                <Clock className="w-3 h-3" />
              )}
              {scheduleType === 'cron' ? 'Recurring' : 'One-time'}
            </Badge>
          );
        },
      },
      {
        id: 'schedule',
        header: 'Schedule',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.cronExpression ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-xs w-fit">
                    {getCronDescription(row.original.cronExpression)}{' '}
                    {getTimezoneAbbreviation(getTriggerTimezone(row.original))}
                  </code>
                </TooltipTrigger>
                <TooltipContent>
                  <code className="font-mono">
                    {row.original.cronExpression} ({getTriggerTimezone(row.original)})
                  </code>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-xs w-fit">
              {row.original.runAt ? formatDateTimeLocal(row.original.runAt) : '—'}
            </code>
          ),
      },
      {
        id: 'lastRunAt',
        accessorFn: (row) => (row.lastRunAt ? new Date(row.lastRunAt) : undefined),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={localTz ? `Last Run (${localTz})` : 'Last Run'}
          />
        ),
        sortingFn: 'datetime',
        sortUndefined: 'last',
        cell: ({ row }) =>
          row.original.lastRunConversationIds.length > 0 ? (
            <Link
              href={`/${tenantId}/projects/${projectId}/traces/conversations/${row.original.lastRunConversationIds[row.original.lastRunConversationIds.length - 1]}`}
              className={`text-sm hover:underline ${
                row.original.lastRunStatus === 'completed'
                  ? 'text-primary'
                  : row.original.lastRunStatus === 'failed'
                    ? 'text-red-500'
                    : 'text-muted-foreground'
              }`}
            >
              {formatLastRun(row.original)}
            </Link>
          ) : (
            <span
              className={`text-sm ${
                row.original.lastRunStatus === 'completed'
                  ? 'text-primary'
                  : row.original.lastRunStatus === 'failed'
                    ? 'text-red-500'
                    : 'text-muted-foreground'
              }`}
            >
              {formatLastRun(row.original)}
            </span>
          ),
      },
      {
        id: 'nextRunAt',
        accessorFn: (row) => (row.nextRunAt ? new Date(row.nextRunAt) : undefined),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={localTz ? `Next Run (${localTz})` : 'Next Run'}
          />
        ),
        sortingFn: 'datetime',
        sortUndefined: 'last',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{formatNextRun(row.original)}</span>
        ),
      },
      {
        accessorKey: 'enabled',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        sortingFn: 'basic',
        cell: ({ row }) => {
          const scheduleType = getScheduleType(row.original);
          const isLoading = loadingTriggers.has(row.original.id);
          const canManage = canManageTrigger(row.original);
          if (scheduleType === 'one-time' && row.original.lastRunAt) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <div className="flex items-center gap-2">
              <Switch
                checked={row.original.enabled}
                onCheckedChange={() =>
                  toggleEnabled(row.original.id, row.original.agentId, row.original.enabled)
                }
                disabled={isLoading || !canManage}
              />
              <Badge className="uppercase" variant={row.original.enabled ? 'primary' : 'code'}>
                {row.original.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { className: 'w-12' },
        cell: ({ row }) => {
          const isLoading = loadingTriggers.has(row.original.id);
          const canManage = canManageTrigger(row.original);
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" disabled={isLoading}>
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canManage && (
                  <DropdownMenuItem
                    onClick={() =>
                      runTrigger(row.original.id, row.original.agentId, row.original.name)
                    }
                  >
                    <Play className="w-4 h-4" />
                    Run Now
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link
                    href={`/${tenantId}/projects/${projectId}/triggers/scheduled/${row.original.agentId}/${row.original.id}/invocations`}
                  >
                    <History className="w-4 h-4" />
                    View Invocations
                  </Link>
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/${tenantId}/projects/${projectId}/triggers/scheduled/${row.original.agentId}/${row.original.id}/edit`}
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link
                    href={`/${tenantId}/projects/${projectId}/triggers/scheduled/${row.original.agentId}/new?${new URLSearchParams(
                      {
                        ...(row.original.cronExpression
                          ? {
                              scheduleType: 'cron',
                              cronExpression: row.original.cronExpression,
                              cronTimezone: row.original.cronTimezone || 'UTC',
                            }
                          : {
                              scheduleType: 'one-time',
                              ...(row.original.runAt ? { runAt: row.original.runAt } : {}),
                            }),
                        ...(row.original.payload
                          ? { payloadJson: JSON.stringify(row.original.payload) }
                          : {}),
                        ...(row.original.messageTemplate
                          ? { messageTemplate: row.original.messageTemplate }
                          : {}),
                        maxRetries: String(row.original.maxRetries ?? 1),
                        retryDelaySeconds: String(row.original.retryDelaySeconds ?? 60),
                        timeoutSeconds: String(row.original.timeoutSeconds ?? 780),
                      }
                    ).toString()}`}
                  >
                    <CopyPlus className="w-4 h-4" />
                    Duplicate
                  </Link>
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() =>
                      deleteTrigger(row.original.id, row.original.agentId, row.original.name)
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [
      tenantId,
      projectId,
      localTz,
      loadingTriggers,
      canManageTrigger,
      toggleEnabled,
      deleteTrigger,
      runTrigger,
      getUserDisplayName,
    ]
  );

  return (
    <div className="rounded-lg border">
      <DataTable
        columns={columns}
        data={triggers}
        defaultSort={[{ id: 'name', desc: false }]}
        emptyState="No scheduled triggers configured yet. Create a scheduled trigger to run your agents on a schedule."
        getRowId={(row) => row.id}
      />
    </div>
  );
}
