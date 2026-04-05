'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Ban, MoreHorizontal, RotateCcw } from 'lucide-react';
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

interface ScheduledTriggerInvocationsTableProps {
  initialInvocations: ScheduledTriggerInvocation[];
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
}

export function ScheduledTriggerInvocationsTable({
  initialInvocations,
  tenantId,
  projectId,
  agentId,
  scheduledTriggerId,
}: ScheduledTriggerInvocationsTableProps) {
  const router = useRouter();
  const [invocations, setInvocations] = useState(initialInvocations);
  const [loadingInvocations, setLoadingInvocations] = useState(new Set<string>());

  const hasTransientInvocations = invocations.some(
    (inv) => inv.status === 'pending' || inv.status === 'running'
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
          { limit: 50 }
        );
        setInvocations(updated);
      } catch (error) {
        console.error('Failed to poll invocations:', error);
      }
    };

    const intervalId = setInterval(pollInvocations, POLLING_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [hasTransientInvocations, tenantId, projectId, agentId, scheduledTriggerId]);

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
        invocationId
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
    }
    setLoadingInvocations((prev) => {
      const newSet = new Set(prev);
      newSet.delete(invocationId);
      return newSet;
    });
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
        invocationId
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
    }
    setLoadingInvocations((prev) => {
      const newSet = new Set(prev);
      newSet.delete(invocationId);
      return newSet;
    });
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
      cell: ({ row }) => {
        const isLoading = loadingInvocations.has(row.original.id);
        const canCancel = row.original.status === 'pending' || row.original.status === 'running';
        const canRerun =
          row.original.status === 'completed' ||
          row.original.status === 'failed' ||
          row.original.status === 'cancelled';
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
                <DropdownMenuItem onClick={() => rerunInvocation(row.original.id)}>
                  <RotateCcw className="w-4 h-4" />
                  Rerun
                </DropdownMenuItem>
              )}
              {canCancel && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => cancelInvocation(row.original.id)}
                >
                  <Ban className="w-4 h-4" />
                  Cancel
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
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
