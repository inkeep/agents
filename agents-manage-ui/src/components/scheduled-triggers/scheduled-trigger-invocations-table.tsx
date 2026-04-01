'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Ban, ChevronDown, ChevronRight, MoreHorizontal, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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
import { ExternalLink } from '@/components/ui/external-link';
import { useOrgMembers } from '@/hooks/use-org-members';
import {
  cancelScheduledTriggerInvocationAction,
  getScheduledTriggerInvocationsAction,
  rerunScheduledTriggerInvocationAction,
} from '@/lib/actions/scheduled-triggers';
import type { ScheduledTriggerInvocation } from '@/lib/api/scheduled-triggers';
import {
  formatInvocationDateTime,
  formatInvocationDuration,
  getInvocationStatusBadge,
  type InvocationStatus,
} from '@/lib/utils/invocation-display';

const POLLING_INTERVAL_MS = 3000;

interface TickGroup {
  scheduledFor: string;
  invocations: ScheduledTriggerInvocation[];
  summary: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    pending: number;
    cancelled: number;
  };
}

function groupByTick(invocations: ScheduledTriggerInvocation[]): TickGroup[] {
  const map = new Map<string, ScheduledTriggerInvocation[]>();
  for (const inv of invocations) {
    const key = inv.scheduledFor;
    const group = map.get(key);
    if (group) {
      group.push(inv);
    } else {
      map.set(key, [inv]);
    }
  }

  return Array.from(map.entries())
    .map(([scheduledFor, invs]) => ({
      scheduledFor,
      invocations: invs,
      summary: {
        total: invs.length,
        completed: invs.filter((i) => i.status === 'completed').length,
        failed: invs.filter((i) => i.status === 'failed').length,
        running: invs.filter((i) => i.status === 'running').length,
        pending: invs.filter((i) => i.status === 'pending').length,
        cancelled: invs.filter((i) => i.status === 'cancelled').length,
      },
    }))
    .sort((a, b) => new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime());
}

function TickStatusSummary({ summary }: { summary: TickGroup['summary'] }) {
  if (summary.total === 1) return null;

  const parts: {
    label: string;
    count: number;
    variant: 'default' | 'destructive' | 'secondary' | 'outline';
  }[] = [];
  if (summary.completed > 0)
    parts.push({ label: 'completed', count: summary.completed, variant: 'default' });
  if (summary.failed > 0)
    parts.push({ label: 'failed', count: summary.failed, variant: 'destructive' });
  if (summary.running > 0)
    parts.push({ label: 'running', count: summary.running, variant: 'secondary' });
  if (summary.pending > 0)
    parts.push({ label: 'pending', count: summary.pending, variant: 'outline' });
  if (summary.cancelled > 0)
    parts.push({ label: 'cancelled', count: summary.cancelled, variant: 'outline' });

  return (
    <div className="flex items-center gap-1.5">
      {parts.map((p) => (
        <Badge key={p.label} variant={p.variant} className="text-xs">
          {p.count} {p.label}
        </Badge>
      ))}
    </div>
  );
}

interface ScheduledTriggerInvocationsTableProps {
  invocations: ScheduledTriggerInvocation[];
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
}

export function ScheduledTriggerInvocationsTable({
  invocations: initialInvocations,
  tenantId,
  projectId,
  agentId,
  scheduledTriggerId,
}: ScheduledTriggerInvocationsTableProps) {
  const router = useRouter();
  const [invocations, setInvocations] = useState(initialInvocations);
  const [loadingInvocations, setLoadingInvocations] = useState<Set<string>>(new Set());
  const [expandedTicks, setExpandedTicks] = useState<Set<string>>(new Set());
  const { members: orgMembers } = useOrgMembers(tenantId);

  const hasTransientInvocations = invocations.some(
    (inv) => inv.status === 'pending' || inv.status === 'running',
  );

  useEffect(() => {
    if (!hasTransientInvocations) return;

    const pollInvocations = async () => {
      try {
        const updated = await getScheduledTriggerInvocationsAction(
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId,
          { limit: 50 },
        );
        setInvocations(updated);
      } catch (error) {
        console.error('Failed to poll invocations:', error);
      }
    };

    const intervalId = setInterval(pollInvocations, POLLING_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [hasTransientInvocations, tenantId, projectId, agentId, scheduledTriggerId]);

  useEffect(() => {
    setInvocations(initialInvocations);
  }, [initialInvocations]);

  const tickGroups = groupByTick(invocations);
  const isMultiUser = tickGroups.some((g) => g.invocations.length > 1);

  function toggleTick(scheduledFor: string) {
    setExpandedTicks((prev) => {
      const next = new Set(prev);
      if (next.has(scheduledFor)) {
        next.delete(scheduledFor);
      } else {
        next.add(scheduledFor);
      }
      return next;
    });
  }

  function getUserDisplayName(userId: string | null | undefined) {
    if (!userId) return '—';
    const member = orgMembers.find((m) => m.id === userId);
    return member?.name || member?.email || userId;
  }

  async function cancelInvocation(invocationId: string) {
    if (!confirm('Are you sure you want to cancel this invocation?')) {
      return;
    }

    setLoadingInvocations((prev) => new Set(prev).add(invocationId));

    try {
      const result = await cancelScheduledTriggerInvocationAction(
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        invocationId,
      );

      if (result.success) {
        toast.success('Invocation cancelled successfully');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to cancel invocation');
      }
    } catch (error) {
      console.error('Failed to cancel invocation:', error);
      toast.error('Failed to cancel invocation');
    } finally {
      setLoadingInvocations((prev) => {
        const newSet = new Set(prev);
        newSet.delete(invocationId);
        return newSet;
      });
    }
  }

  async function rerunInvocation(invocationId: string) {
    if (!confirm('Are you sure you want to rerun this invocation?')) {
      return;
    }

    setLoadingInvocations((prev) => new Set(prev).add(invocationId));

    try {
      const result = await rerunScheduledTriggerInvocationAction(
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        invocationId,
      );

      if (result.success) {
        toast.success('Invocation rerun started successfully');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to rerun invocation');
      }
    } catch (error) {
      console.error('Failed to rerun invocation:', error);
      toast.error('Failed to rerun invocation');
    } finally {
      setLoadingInvocations((prev) => {
        const newSet = new Set(prev);
        newSet.delete(invocationId);
        return newSet;
      });
    }
  }

  function renderInvocationActions(inv: ScheduledTriggerInvocation) {
    const isLoading = loadingInvocations.has(inv.id);
    const canCancel = inv.status === 'pending' || inv.status === 'running';
    const canRerun =
      inv.status === 'completed' || inv.status === 'failed' || inv.status === 'cancelled';
    const hasActions = canCancel || canRerun;

    if (!hasActions) return null;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" disabled={isLoading}>
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canRerun && (
            <DropdownMenuItem onClick={() => rerunInvocation(inv.id)}>
              <RotateCcw className="w-4 h-4" />
              Rerun
            </DropdownMenuItem>
          )}
          {canCancel && (
            <DropdownMenuItem variant="destructive" onClick={() => cancelInvocation(inv.id)}>
              <Ban className="w-4 h-4" />
              Cancel
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (isMultiUser) {
    return (
      <div className="rounded-lg border">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b">
              <tr className="border-b transition-colors hover:bg-muted/50">
                <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground w-8" />
                <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">
                  Scheduled For
                </th>
                <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">
                  Status
                </th>
                <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">
                  Users
                </th>
                <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {tickGroups.length === 0 && (
                <tr>
                  <td colSpan={5} className="h-24 text-center text-muted-foreground">
                    No invocations yet. The scheduled trigger will create invocations when it
                    runs.
                  </td>
                </tr>
              )}
              {tickGroups.map((group) => {
                const isExpanded = expandedTicks.has(group.scheduledFor);
                const latestCompletedAt = group.invocations
                  .filter((i) => i.completedAt)
                  .map((i) => new Date(i.completedAt!).getTime())
                  .sort((a, b) => b - a)[0];
                const earliestStartedAt = group.invocations
                  .filter((i) => i.startedAt)
                  .map((i) => new Date(i.startedAt!).getTime())
                  .sort((a, b) => a - b)[0];

                return (
                  <TickGroupRows
                    key={group.scheduledFor}
                    group={group}
                    isExpanded={isExpanded}
                    onToggle={() => toggleTick(group.scheduledFor)}
                    tickDuration={
                      earliestStartedAt && latestCompletedAt
                        ? formatInvocationDuration(
                            new Date(earliestStartedAt).toISOString(),
                            new Date(latestCompletedAt).toISOString(),
                          )
                        : '—'
                    }
                    tenantId={tenantId}
                    projectId={projectId}
                    getUserDisplayName={getUserDisplayName}
                    renderActions={renderInvocationActions}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const columns: ColumnDef<ScheduledTriggerInvocation>[] = [
    {
      id: 'scheduledFor',
      accessorFn: (row) => new Date(row.scheduledFor),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Scheduled For" />,
      sortingFn: 'datetime',
      cell: ({ row }) => (
        <div className="font-mono text-sm">
          {formatInvocationDateTime(row.original.scheduledFor)}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => getInvocationStatusBadge(row.original.status as InvocationStatus),
    },
    {
      id: 'startedAt',
      accessorFn: (row) => (row.startedAt ? new Date(row.startedAt) : undefined),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Started At" />,
      sortingFn: 'datetime',
      sortUndefined: 'last',
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">
          {formatInvocationDateTime(row.original.startedAt)}
        </div>
      ),
    },
    {
      id: 'duration',
      header: 'Duration',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">
          {formatInvocationDuration(row.original.startedAt, row.original.completedAt)}
        </div>
      ),
    },
    {
      id: 'attempt',
      header: 'Attempt',
      enableSorting: false,
      cell: ({ row }) => <Badge variant="count">{row.original.attemptNumber}</Badge>,
    },
    {
      id: 'conversation',
      header: 'Conversation',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.conversationIds && row.original.conversationIds.length > 0 ? (
          <div className="flex flex-col gap-1">
            {row.original.conversationIds.map((convId: string, idx: number) => (
              <ExternalLink
                key={convId}
                href={`/${tenantId}/projects/${projectId}/traces/conversations/${convId}`}
                className="text-primary no-underline"
                iconClassName="text-primary"
              >
                {row.original.conversationIds && row.original.conversationIds.length > 1 && (
                  <span className="text-muted-foreground text-xs">#{idx + 1}</span>
                )}
                View
              </ExternalLink>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { className: 'w-12' },
      cell: ({ row }) => renderInvocationActions(row.original),
    },
  ];

  return (
    <div className="rounded-lg border">
      <DataTable
        columns={columns}
        data={invocations}
        defaultSort={[{ id: 'scheduledFor', desc: true }]}
        emptyState="No invocations yet. The scheduled trigger will create invocations when it runs."
        getRowId={(row) => row.id}
      />
    </div>
  );
}

function TickGroupRows({
  group,
  isExpanded,
  onToggle,
  tickDuration,
  tenantId,
  projectId,
  getUserDisplayName,
  renderActions,
}: {
  group: TickGroup;
  isExpanded: boolean;
  onToggle: () => void;
  tickDuration: string;
  tenantId: string;
  projectId: string;
  getUserDisplayName: (userId: string | null | undefined) => string;
  renderActions: (inv: ScheduledTriggerInvocation) => React.ReactNode;
}) {
  return (
    <>
      <tr
        className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="p-4 align-middle">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
        <td className="p-4 align-middle">
          <div className="font-mono text-sm">{formatInvocationDateTime(group.scheduledFor)}</div>
        </td>
        <td className="p-4 align-middle">
          <TickStatusSummary summary={group.summary} />
        </td>
        <td className="p-4 align-middle">
          <span className="text-sm text-muted-foreground">
            {group.summary.total} user{group.summary.total !== 1 ? 's' : ''}
          </span>
        </td>
        <td className="p-4 align-middle">
          <span className="text-sm text-muted-foreground">{tickDuration}</span>
        </td>
      </tr>
      {isExpanded &&
        group.invocations.map((inv) => (
          <tr key={inv.id} className="border-b transition-colors hover:bg-muted/30 bg-muted/10">
            <td className="p-4 align-middle" />
            <td className="p-4 align-middle pl-8">
              <div className="text-sm font-medium">
                {getUserDisplayName(
                  (inv as ScheduledTriggerInvocation & { runAsUserId?: string }).runAsUserId,
                )}
              </div>
            </td>
            <td className="p-4 align-middle">
              {getInvocationStatusBadge(inv.status as InvocationStatus)}
            </td>
            <td className="p-4 align-middle">
              {inv.conversationIds && inv.conversationIds.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {inv.conversationIds.map((convId: string) => (
                    <ExternalLink
                      key={convId}
                      href={`/${tenantId}/projects/${projectId}/traces/conversations/${convId}`}
                      className="text-primary no-underline text-sm"
                      iconClassName="text-primary"
                    >
                      View trace
                    </ExternalLink>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )}
            </td>
            <td className="p-4 align-middle">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {formatInvocationDuration(inv.startedAt, inv.completedAt)}
                </span>
                {renderActions(inv)}
              </div>
            </td>
          </tr>
        ))}
    </>
  );
}
