'use client';

import {
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
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
import { getProjectScheduledTriggerInvocationsAction } from '@/lib/actions/project-triggers';
import {
  cancelScheduledTriggerInvocationAction,
  rerunScheduledTriggerInvocationAction,
} from '@/lib/actions/scheduled-triggers';
import type { ScheduledTriggerInvocationWithContext } from '@/lib/api/project-triggers';

const POLLING_INTERVAL_MS = 3000;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

interface ProjectScheduledTriggerInvocationsTableProps {
  invocations: ScheduledTriggerInvocationWithContext[];
  tenantId: string;
  projectId: string;
}

type InvocationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

function getStatusBadge(status: InvocationStatus) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="outline" className="gap-1">
          <Clock className="w-3 h-3" />
          Pending
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="default" className="gap-1 bg-blue-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          Running
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="default" className="gap-1 bg-blue-500">
          <CheckCircle2 className="w-3 h-3" />
          Completed
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="w-3 h-3" />
          Failed
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="secondary" className="gap-1">
          <Ban className="w-3 h-3" />
          Cancelled
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDateTime(dateString: string | null): string {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString();
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const durationMs = end - start;

  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${(durationMs / 60000).toFixed(1)}m`;
}

export function ProjectScheduledTriggerInvocationsTable({
  invocations: initialInvocations,
  tenantId,
  projectId,
}: ProjectScheduledTriggerInvocationsTableProps) {
  const router = useRouter();
  const [invocations, setInvocations] = useState(initialInvocations);
  const [loadingInvocations, setLoadingInvocations] = useState<Set<string>>(new Set());

  // Filter state
  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');

  // Derive unique agents and triggers from the data
  const agentOptions = useMemo(() => {
    const uniqueAgents = new Map<string, string>();
    invocations.forEach((inv) => {
      if (!uniqueAgents.has(inv.agentId)) {
        uniqueAgents.set(inv.agentId, inv.agentName);
      }
    });
    return [
      { value: '', label: 'All agents' },
      ...Array.from(uniqueAgents.entries()).map(([id, name]) => ({
        value: id,
        label: name,
      })),
    ];
  }, [invocations]);

  const triggerOptions = useMemo(() => {
    const uniqueTriggers = new Map<string, string>();
    invocations.forEach((inv) => {
      if (!uniqueTriggers.has(inv.scheduledTriggerId)) {
        uniqueTriggers.set(inv.scheduledTriggerId, inv.triggerName);
      }
    });
    return [
      { value: '', label: 'All triggers' },
      ...Array.from(uniqueTriggers.entries()).map(([id, name]) => ({
        value: id,
        label: name,
      })),
    ];
  }, [invocations]);

  // Apply filters
  const filteredInvocations = useMemo(() => {
    return invocations.filter((inv) => {
      if (agentFilter && inv.agentId !== agentFilter) return false;
      if (statusFilter && inv.status !== statusFilter) return false;
      if (triggerFilter && inv.scheduledTriggerId !== triggerFilter) return false;
      return true;
    });
  }, [invocations, agentFilter, statusFilter, triggerFilter]);

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
        setInvocations(updated);
      } catch (error) {
        console.error('Failed to poll invocations:', error);
      }
    };

    const intervalId = setInterval(pollInvocations, POLLING_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [hasTransientInvocations, tenantId, projectId]);

  useEffect(() => {
    setInvocations(initialInvocations);
  }, [initialInvocations]);

  const cancelInvocation = async (invocation: ScheduledTriggerInvocationWithContext) => {
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
    } finally {
      setLoadingInvocations((prev) => {
        const newSet = new Set(prev);
        newSet.delete(invocation.id);
        return newSet;
      });
    }
  };

  const rerunInvocation = async (invocation: ScheduledTriggerInvocationWithContext) => {
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
    } finally {
      setLoadingInvocations((prev) => {
        const newSet = new Set(prev);
        newSet.delete(invocation.id);
        return newSet;
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Combobox
          options={agentOptions}
          onSelect={setAgentFilter}
          defaultValue={agentFilter}
          placeholder="Filter by agent"
          searchPlaceholder="Search agents..."
          notFoundMessage="No agents found."
          className="w-[180px]"
        />
        <Combobox
          options={triggerOptions}
          onSelect={setTriggerFilter}
          defaultValue={triggerFilter}
          placeholder="Filter by trigger"
          searchPlaceholder="Search triggers..."
          notFoundMessage="No triggers found."
          className="w-[180px]"
        />
        <Combobox
          options={STATUS_OPTIONS}
          onSelect={setStatusFilter}
          defaultValue={statusFilter}
          placeholder="Filter by status"
          searchPlaceholder="Search status..."
          notFoundMessage="No status found."
          className="w-[160px]"
        />
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 px-2 text-muted-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Clear filters
          </Button>
        )}
        {hasActiveFilters && (
          <span className="text-sm text-muted-foreground">
            Showing {filteredInvocations.length} of {invocations.length} invocations
          </span>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow noHover>
              <TableHead>Trigger</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Scheduled For</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Conversation</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvocations.length === 0 ? (
              <TableRow noHover>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {invocations.length === 0
                    ? 'No invocations yet. Create scheduled triggers to see their invocations here.'
                    : 'No invocations match the current filters.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredInvocations.map((invocation) => {
                const isLoading = loadingInvocations.has(invocation.id);
                const canCancel =
                  invocation.status === 'pending' || invocation.status === 'running';
                const canRerun =
                  invocation.status === 'completed' ||
                  invocation.status === 'failed' ||
                  invocation.status === 'cancelled';
                const hasActions = canCancel || canRerun;

                return (
                  <TableRow key={invocation.id} noHover>
                    <TableCell>
                      <Link
                        href={`/${tenantId}/projects/${projectId}/triggers/scheduled/${invocation.agentId}/${invocation.scheduledTriggerId}/invocations`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {invocation.triggerName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/${tenantId}/projects/${projectId}/agents/${invocation.agentId}`}
                        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {invocation.agentName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-sm">
                        {formatDateTime(invocation.scheduledFor)}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(invocation.status as InvocationStatus)}</TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {formatDuration(invocation.startedAt, invocation.completedAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {invocation.conversationIds && invocation.conversationIds.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {invocation.conversationIds.map((convId, idx) => (
                            <Link
                              key={convId}
                              href={`/${tenantId}/projects/${projectId}/traces/conversations/${convId}`}
                              className="flex items-center gap-1 text-blue-600 hover:underline text-sm"
                            >
                              {invocation.conversationIds &&
                                invocation.conversationIds.length > 1 && (
                                  <span className="text-muted-foreground text-xs">#{idx + 1}</span>
                                )}
                              View
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {hasActions && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" disabled={isLoading}>
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canRerun && (
                              <DropdownMenuItem onClick={() => rerunInvocation(invocation)}>
                                <RotateCcw className="w-4 h-4 mr-2" />
                                Rerun
                              </DropdownMenuItem>
                            )}
                            {canCancel && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => cancelInvocation(invocation)}
                              >
                                <Ban className="w-4 h-4 mr-2" />
                                Cancel
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
