'use client';

import { Ban, MoreHorizontal, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

const POLLING_INTERVAL_MS = 3000; // Poll every 3 seconds

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

  // Check if any invocations are in a transient state (pending or running)
  const hasTransientInvocations = invocations.some(
    (inv) => inv.status === 'pending' || inv.status === 'running'
  );

  // Poll for updates when there are pending/running invocations
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

  // Update invocations when initial props change
  useEffect(() => {
    setInvocations(initialInvocations);
  }, [initialInvocations]);

  const cancelInvocation = async (invocationId: string) => {
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
    } finally {
      setLoadingInvocations((prev) => {
        const newSet = new Set(prev);
        newSet.delete(invocationId);
        return newSet;
      });
    }
  };

  const rerunInvocation = async (invocationId: string) => {
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
    } finally {
      setLoadingInvocations((prev) => {
        const newSet = new Set(prev);
        newSet.delete(invocationId);
        return newSet;
      });
    }
  };

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow noHover>
            <TableHead>Scheduled For</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Started At</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Attempt</TableHead>
            <TableHead>Conversation</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {invocations.length === 0 ? (
            <TableRow noHover>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No invocations yet. The scheduled trigger will create invocations when it runs.
              </TableCell>
            </TableRow>
          ) : (
            invocations.map((invocation) => {
              const isLoading = loadingInvocations.has(invocation.id);
              const canCancel = invocation.status === 'pending' || invocation.status === 'running';
              const canRerun =
                invocation.status === 'completed' ||
                invocation.status === 'failed' ||
                invocation.status === 'cancelled';
              const hasActions = canCancel || canRerun;

              return (
                <TableRow key={invocation.id} noHover>
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
                      {formatInvocationDateTime(invocation.startedAt)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {formatInvocationDuration(invocation.startedAt, invocation.completedAt)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="count">{invocation.attemptNumber}</Badge>
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
                            <DropdownMenuItem
                              onClick={() => {
                                rerunInvocation(invocation.id);
                              }}
                            >
                              <RotateCcw className="w-4 h-4" />
                              Rerun
                            </DropdownMenuItem>
                          )}
                          {canCancel && (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => {
                                cancelInvocation(invocation.id);
                              }}
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
  );
}
