'use client';

import {
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  getUpcomingRunsAction,
} from '@/lib/actions/scheduled-triggers';
import type { ScheduledTriggerInvocation } from '@/lib/api/scheduled-triggers';

const POLLING_INTERVAL_MS = 10000; // Poll every 10 seconds

interface UpcomingRunsDashboardProps {
  initialRuns: ScheduledTriggerInvocation[];
  tenantId: string;
  projectId: string;
  agentId: string;
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

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 0) {
    // In the past
    const absMins = Math.abs(diffMins);
    if (absMins < 60) return `${absMins}m ago`;
    const hours = Math.floor(absMins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // In the future
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `in ${diffMins}m`;
  const hours = Math.floor(diffMins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

export function UpcomingRunsDashboard({
  initialRuns,
  tenantId,
  projectId,
  agentId,
}: UpcomingRunsDashboardProps) {
  const router = useRouter();
  const [runs, setRuns] = useState(initialRuns);
  const [loadingInvocations, setLoadingInvocations] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check if any runs are in a transient state
  const hasTransientRuns = runs.some((run) => run.status === 'pending' || run.status === 'running');

  // Poll for updates when there are pending/running runs
  useEffect(() => {
    if (!hasTransientRuns) return;

    const pollRuns = async () => {
      try {
        const updated = await getUpcomingRunsAction(tenantId, projectId, agentId, {
          includeRunning: true,
          limit: 20,
        });
        setRuns(updated);
      } catch (error) {
        console.error('Failed to poll upcoming runs:', error);
      }
    };

    const intervalId = setInterval(pollRuns, POLLING_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [hasTransientRuns, tenantId, projectId, agentId]);

  // Update runs when initial props change
  useEffect(() => {
    setRuns(initialRuns);
  }, [initialRuns]);

  const refreshRuns = async () => {
    setIsRefreshing(true);
    try {
      const updated = await getUpcomingRunsAction(tenantId, projectId, agentId, {
        includeRunning: true,
        limit: 20,
      });
      setRuns(updated);
    } catch (error) {
      console.error('Failed to refresh upcoming runs:', error);
      toast.error('Failed to refresh upcoming runs');
    } finally {
      setIsRefreshing(false);
    }
  };

  const cancelInvocation = async (invocation: ScheduledTriggerInvocation) => {
    if (!confirm('Are you sure you want to cancel this scheduled run?')) {
      return;
    }

    setLoadingInvocations((prev) => new Set(prev).add(invocation.id));

    try {
      const result = await cancelScheduledTriggerInvocationAction(
        tenantId,
        projectId,
        agentId,
        invocation.scheduledTriggerId,
        invocation.id
      );

      if (result.success) {
        toast.success('Scheduled run cancelled successfully');
        refreshRuns();
      } else {
        toast.error(result.error || 'Failed to cancel scheduled run');
      }
    } catch (error) {
      console.error('Failed to cancel invocation:', error);
      toast.error('Failed to cancel scheduled run');
    } finally {
      setLoadingInvocations((prev) => {
        const newSet = new Set(prev);
        newSet.delete(invocation.id);
        return newSet;
      });
    }
  };

  const runningCount = runs.filter((r) => r.status === 'running').length;
  const pendingCount = runs.filter((r) => r.status === 'pending').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Upcoming Runs</CardTitle>
              <CardDescription>
                {runningCount > 0 && (
                  <span className="text-blue-500 font-medium">{runningCount} running</span>
                )}
                {runningCount > 0 && pendingCount > 0 && ' · '}
                {pendingCount > 0 && <span>{pendingCount} scheduled</span>}
                {runningCount === 0 && pendingCount === 0 && 'No upcoming runs'}
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={refreshRuns} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No upcoming scheduled runs</p>
            <p className="text-sm mt-1">
              Enable a scheduled trigger to see upcoming runs here.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow noHover>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Scheduled For</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Conversation</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const isLoading = loadingInvocations.has(run.id);
                  const canCancel = run.status === 'pending' || run.status === 'running';

                  return (
                    <TableRow key={run.id} noHover>
                      <TableCell>
                        <Link
                          href={`/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers/${run.scheduledTriggerId}/invocations`}
                          className="text-sm text-blue-600 hover:underline font-mono"
                        >
                          {run.scheduledTriggerId.slice(0, 8)}...
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-mono text-sm">
                            {formatDateTime(run.scheduledFor)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatRelativeTime(run.scheduledFor)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(run.status as InvocationStatus)}</TableCell>
                      <TableCell>
                        {run.conversationId ? (
                          <Link
                            href={`/${tenantId}/projects/${projectId}/traces/conversations/${run.conversationId}`}
                            className="flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            View
                            <ExternalLink className="w-3 h-3" />
                          </Link>
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
                                onClick={() => cancelInvocation(run)}
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
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
