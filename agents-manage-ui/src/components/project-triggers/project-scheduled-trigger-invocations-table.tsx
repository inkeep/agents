'use client';

import { Ban, MoreHorizontal, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExternalLink } from '@/components/ui/external-link';
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
                        {formatInvocationDateTime(invocation.scheduledFor)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getInvocationStatusBadge(invocation.status as InvocationStatus)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {formatInvocationDuration(invocation.startedAt, invocation.completedAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {invocation.conversationIds && invocation.conversationIds.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {invocation.conversationIds.map((convId: string, idx: number) => (
                            <ExternalLink
                              key={convId}
                              href={`/${tenantId}/projects/${projectId}/traces/conversations/${convId}`}
                              className="text-primary no-underline"
                              iconClassName="text-primary"
                            >
                              {invocation.conversationIds &&
                                invocation.conversationIds.length > 1 && (
                                  <span className="text-muted-foreground text-xs">#{idx + 1}</span>
                                )}
                              View
                            </ExternalLink>
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
                                <RotateCcw className="w-4 h-4" />
                                Rerun
                              </DropdownMenuItem>
                            )}
                            {canCancel && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => cancelInvocation(invocation)}
                              >
                                <Ban className="w-4 h-4" />
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
