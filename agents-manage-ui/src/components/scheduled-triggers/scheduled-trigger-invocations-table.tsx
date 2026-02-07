'use client';

import {
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
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

const POLLING_INTERVAL_MS = 3000; // Poll every 3 seconds

interface ScheduledTriggerInvocationsTableProps {
  invocations: ScheduledTriggerInvocation[];
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
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
                      {formatDateTime(invocation.scheduledFor)}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(invocation.status as InvocationStatus)}</TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {formatDateTime(invocation.startedAt)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {formatDuration(invocation.startedAt, invocation.completedAt)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{invocation.attemptNumber}</Badge>
                  </TableCell>
                  <TableCell>
                    {invocation.conversationIds && invocation.conversationIds.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {invocation.conversationIds.map((convId: string, idx: number) => (
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
                            <DropdownMenuItem
                              onClick={() => {
                                rerunInvocation(invocation.id);
                              }}
                            >
                              <RotateCcw className="w-4 h-4 mr-2" />
                              Rerun
                            </DropdownMenuItem>
                          )}
                          {canCancel && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                cancelInvocation(invocation.id);
                              }}
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
  );
}
