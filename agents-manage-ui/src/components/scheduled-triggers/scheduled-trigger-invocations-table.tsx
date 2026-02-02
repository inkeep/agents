'use client';

import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  MoreHorizontal,
  XCircle,
} from 'lucide-react';
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
import { cancelScheduledTriggerInvocationAction } from '@/lib/actions/scheduled-triggers';
import type { ScheduledTriggerInvocation } from '@/lib/api/scheduled-triggers';

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
        <Badge variant="default" className="gap-1 bg-green-500">
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
  invocations,
  tenantId,
  projectId,
  agentId,
  scheduledTriggerId,
}: ScheduledTriggerInvocationsTableProps) {
  const router = useRouter();
  const [loadingInvocations, setLoadingInvocations] = useState<Set<string>>(new Set());

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
            <TableHead>Error</TableHead>
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
              const canCancel =
                invocation.status === 'pending' || invocation.status === 'running';

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
                    {invocation.errorMessage ? (
                      <div className="flex items-center gap-1 text-destructive max-w-xs truncate">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        <span className="text-sm truncate" title={invocation.errorMessage}>
                          {invocation.errorMessage}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {canCancel && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" disabled={isLoading}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => cancelInvocation(invocation.id)}
                          >
                            <Ban className="w-4 h-4 mr-2" />
                            Cancel
                          </DropdownMenuItem>
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
