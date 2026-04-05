'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Ban, MoreHorizontal, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExternalLink } from '@/components/ui/external-link';
import { getProjectScheduledTriggerInvocationsAction } from '@/lib/actions/project-triggers';
import {
  cancelScheduledTriggerInvocationAction,
  rerunScheduledTriggerInvocationAction,
} from '@/lib/actions/scheduled-triggers';
import type { ScheduledTriggerInvocationWithContext } from '@/lib/api/project-triggers';
import {
  formatInvocationDateTime,
  formatInvocationDuration,
  getInvocationStatusBadge,
  INVOCATION_STATUS_OPTIONS,
  type InvocationStatus,
} from '@/lib/utils/invocation-display';
import { FilterTriggerComponent } from '../traces/filters/filter-trigger';

const POLLING_INTERVAL_MS = 3000;

interface ProjectScheduledTriggerInvocationsTableProps {
  invocations: ScheduledTriggerInvocationWithContext[];
  tenantId: string;
  projectId: string;
}

export function ProjectScheduledTriggerInvocationsTable({
  invocations: initialInvocations,
  tenantId,
  projectId,
}: ProjectScheduledTriggerInvocationsTableProps) {
  const router = useRouter();
  const [invocationsState, setInvocationsState] = useState<{
    source: ScheduledTriggerInvocationWithContext[];
    value: ScheduledTriggerInvocationWithContext[];
  }>({
    source: initialInvocations,
    value: initialInvocations,
  });
  const [loadingInvocations, setLoadingInvocations] = useState(new Set<string>());
  const invocations =
    invocationsState.source === initialInvocations ? invocationsState.value : initialInvocations;

  // Filter state
  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');

  // Derive unique agents and triggers from the data
  const uniqueAgents = new Map<string, string>();
  invocations.forEach((inv) => {
    if (!uniqueAgents.has(inv.agentId)) {
      uniqueAgents.set(inv.agentId, inv.agentName);
    }
  });
  const agentOptions = [
    { value: '', label: 'All agents' },
    ...Array.from(uniqueAgents.entries()).map(([id, name]) => ({
      value: id,
      label: name,
    })),
  ];

  const uniqueTriggers = new Map<string, string>();
  invocations.forEach((inv) => {
    if (!uniqueTriggers.has(inv.scheduledTriggerId)) {
      uniqueTriggers.set(inv.scheduledTriggerId, inv.triggerName);
    }
  });
  const triggerOptions = [
    { value: '', label: 'All triggers' },
    ...Array.from(uniqueTriggers.entries()).map(([id, name]) => ({
      value: id,
      label: name,
    })),
  ];

  // Apply filters
  const filteredInvocations = invocations.filter((inv) => {
    if (agentFilter && inv.agentId !== agentFilter) return false;
    if (statusFilter && inv.status !== statusFilter) return false;
    if (triggerFilter && inv.scheduledTriggerId !== triggerFilter) return false;
    return true;
  });

  const hasActiveFilters = agentFilter || statusFilter || triggerFilter;

  const clearFilters = () => {
    setAgentFilter('');
    setStatusFilter('');
    setTriggerFilter('');
  };

  const hasTransientInvocations = invocations.some(
    (inv) => inv.status === 'pending' || inv.status === 'running'
  );

  useEffect(() => {
    if (!hasTransientInvocations) return;

    const pollInvocations = async () => {
      try {
        const updated = await getProjectScheduledTriggerInvocationsAction(tenantId, projectId, {
          limit: 100,
        });
        setInvocationsState({
          source: initialInvocations,
          value: updated,
        });
      } catch (error) {
        console.error('Failed to poll invocations:', error);
      }
    };

    const intervalId = setInterval(pollInvocations, POLLING_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [hasTransientInvocations, initialInvocations, tenantId, projectId]);

  async function cancelInvocation(invocation: ScheduledTriggerInvocationWithContext) {
    if (!confirm('Are you sure you want to cancel this invocation?')) {
      return;
    }

    setLoadingInvocations((prev) => new Set(prev).add(invocation.id));

    try {
      const result = await cancelScheduledTriggerInvocationAction(
        tenantId,
        projectId,
        invocation.agentId,
        invocation.scheduledTriggerId,
        invocation.id
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
      newSet.delete(invocation.id);
      return newSet;
    });
  }

  async function rerunInvocation(invocation: ScheduledTriggerInvocationWithContext) {
    if (!confirm('Are you sure you want to rerun this invocation?')) {
      return;
    }

    setLoadingInvocations((prev) => new Set(prev).add(invocation.id));

    try {
      const result = await rerunScheduledTriggerInvocationAction(
        tenantId,
        projectId,
        invocation.agentId,
        invocation.scheduledTriggerId,
        invocation.id
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
      newSet.delete(invocation.id);
      return newSet;
    });
  }

  const columns: ColumnDef<ScheduledTriggerInvocationWithContext>[] = [
    {
      id: 'triggerName',
      accessorFn: (row) => row.triggerName,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Trigger" />,
      sortingFn: 'text',
      cell: ({ row }) => (
        <Link
          href={`/${tenantId}/projects/${projectId}/triggers/scheduled/${row.original.agentId}/${row.original.scheduledTriggerId}/invocations`}
          className="font-medium text-foreground hover:underline"
        >
          {row.original.triggerName}
        </Link>
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
                <DropdownMenuItem onClick={() => rerunInvocation(row.original)}>
                  <RotateCcw className="w-4 h-4" />
                  Rerun
                </DropdownMenuItem>
              )}
              {canCancel && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => cancelInvocation(row.original)}
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
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Combobox
          options={agentOptions}
          onSelect={setAgentFilter}
          defaultValue={agentFilter}
          placeholder="Filter by agent"
          searchPlaceholder="Search agents..."
          notFoundMessage="No agents found."
          className="w-[180px]"
          TriggerComponent={
            <FilterTriggerComponent
              filterLabel={agentFilter ? 'Agent' : 'All agents'}
              multipleCheckboxValues={agentFilter ? [agentFilter] : []}
              isRemovable={true}
              onDeleteFilter={() => setAgentFilter('')}
              options={agentOptions}
            />
          }
        />
        <Combobox
          options={triggerOptions}
          onSelect={setTriggerFilter}
          defaultValue={triggerFilter}
          placeholder="Filter by trigger"
          searchPlaceholder="Search triggers..."
          notFoundMessage="No triggers found."
          className="w-[180px]"
          TriggerComponent={
            <FilterTriggerComponent
              filterLabel={triggerFilter ? 'Trigger' : 'All triggers'}
              multipleCheckboxValues={triggerFilter ? [triggerFilter] : []}
              isRemovable={true}
              onDeleteFilter={() => setTriggerFilter('')}
              options={triggerOptions}
            />
          }
        />
        <Combobox
          options={INVOCATION_STATUS_OPTIONS}
          onSelect={setStatusFilter}
          defaultValue={statusFilter}
          placeholder="Filter by status"
          searchPlaceholder="Search status..."
          notFoundMessage="No status found."
          className="w-[160px]"
          TriggerComponent={
            <FilterTriggerComponent
              filterLabel={statusFilter ? 'Status' : 'All statuses'}
              multipleCheckboxValues={statusFilter ? [statusFilter] : []}
              isRemovable={true}
              onDeleteFilter={() => setStatusFilter('')}
              options={INVOCATION_STATUS_OPTIONS}
            />
          }
        />
      </div>

      <div className="rounded-lg border">
        <DataTable
          columns={columns}
          data={filteredInvocations}
          defaultSort={[{ id: 'scheduledFor', desc: true }]}
          getRowId={(row) => row.id}
          emptyState={
            <div className="flex flex-col items-center gap-2">
              <p>
                {invocations.length === 0
                  ? 'No invocations yet. Create scheduled triggers to see their invocations here.'
                  : 'No invocations match the current filters.'}
              </p>
              {hasActiveFilters && (
                <Button variant="link" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
