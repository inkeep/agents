'use client';

import { Clock, History, MoreHorizontal, Pencil, Play, RotateCw, Trash2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getProjectScheduledTriggersAction } from '@/lib/actions/project-triggers';
import {
  deleteScheduledTriggerAction,
  runScheduledTriggerNowAction,
  updateScheduledTriggerEnabledAction,
} from '@/lib/actions/scheduled-triggers';
import type { ScheduledTriggerWithAgent } from '@/lib/api/project-triggers';
import { getCronDescription } from '@/lib/utils/cron';

const POLLING_INTERVAL_MS = 3000; // Poll every 3 seconds

interface ProjectScheduledTriggersTableProps {
  triggers: ScheduledTriggerWithAgent[];
  tenantId: string;
  projectId: string;
}

function getScheduleType(trigger: ScheduledTriggerWithAgent): 'cron' | 'one-time' {
  return trigger.cronExpression ? 'cron' : 'one-time';
}

function formatLastRun(trigger: ScheduledTriggerWithAgent): string {
  if (trigger.lastRunAt) {
    return new Date(trigger.lastRunAt).toLocaleString();
  }
  return '—';
}

function formatNextRun(trigger: ScheduledTriggerWithAgent): string {
  if (!trigger.enabled) {
    return '—';
  }
  if (trigger.nextRunAt) {
    return new Date(trigger.nextRunAt).toLocaleString();
  }
  return '—';
}

export function ProjectScheduledTriggersTable({
  triggers: initialTriggers,
  tenantId,
  projectId,
}: ProjectScheduledTriggersTableProps) {
  const router = useRouter();
  const [triggers, setTriggers] = useState<ScheduledTriggerWithAgent[]>(initialTriggers);
  const [loadingTriggers, setLoadingTriggers] = useState<Set<string>>(new Set());

  // Poll for updates
  useEffect(() => {
    const fetchTriggers = async () => {
      try {
        const updatedTriggers = await getProjectScheduledTriggersAction(tenantId, projectId);
        setTriggers(updatedTriggers);
      } catch (error) {
        console.error('Failed to fetch scheduled triggers:', error);
      }
    };

    fetchTriggers();
    const intervalId = setInterval(fetchTriggers, POLLING_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [tenantId, projectId]);

  // Update triggers when initial data changes
  useEffect(() => {
    setTriggers(initialTriggers);
  }, [initialTriggers]);

  const toggleEnabled = async (triggerId: string, agentId: string, currentEnabled: boolean) => {
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
  };

  const deleteTrigger = async (triggerId: string, agentId: string, name: string) => {
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
  };

  const runTrigger = async (triggerId: string, agentId: string, name: string) => {
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
  };

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow noHover>
            <TableHead>Name</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Last Run</TableHead>
            <TableHead>Next Run</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {triggers.length === 0 ? (
            <TableRow noHover>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                No scheduled triggers configured yet. Create a scheduled trigger to run your agents
                on a schedule.
              </TableCell>
            </TableRow>
          ) : (
            triggers.map((trigger) => {
              const isLoading = loadingTriggers.has(trigger.id);
              const scheduleType = getScheduleType(trigger);
              return (
                <TableRow key={trigger.id} noHover>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium text-foreground">{trigger.name}</div>
                      {trigger.description && (
                        <div className="text-sm text-muted-foreground max-w-md truncate">
                          {trigger.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/${tenantId}/projects/${projectId}/agents/${trigger.agentId}`}
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {trigger.agentName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="code" className="gap-1 uppercase">
                      {scheduleType === 'cron' ? (
                        <RotateCw className="w-3 h-3" />
                      ) : (
                        <Clock className="w-3 h-3" />
                      )}
                      {scheduleType === 'cron' ? 'Recurring' : 'One-time'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {trigger.cronExpression ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-xs w-fit">
                              {getCronDescription(trigger.cronExpression)}
                            </code>
                          </TooltipTrigger>
                          <TooltipContent>
                            <code className="font-mono">{trigger.cronExpression}</code>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-xs w-fit">
                        {trigger.runAt ? new Date(trigger.runAt).toLocaleString() : '—'}
                      </code>
                    )}
                  </TableCell>
                  <TableCell>
                    {trigger.lastRunConversationIds.length > 0 ? (
                      <Link
                        href={`/${tenantId}/projects/${projectId}/traces/conversations/${trigger.lastRunConversationIds[trigger.lastRunConversationIds.length - 1]}`}
                        className={`text-sm hover:underline ${
                          trigger.lastRunStatus === 'completed'
                            ? 'text-primary'
                            : trigger.lastRunStatus === 'failed'
                              ? 'text-red-500'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {formatLastRun(trigger)}
                      </Link>
                    ) : (
                      <span
                        className={`text-sm ${
                          trigger.lastRunStatus === 'completed'
                            ? 'text-primary'
                            : trigger.lastRunStatus === 'failed'
                              ? 'text-red-500'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {formatLastRun(trigger)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{formatNextRun(trigger)}</span>
                  </TableCell>
                  <TableCell>
                    {scheduleType === 'one-time' && trigger.lastRunAt ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={trigger.enabled}
                          onCheckedChange={() =>
                            toggleEnabled(trigger.id, trigger.agentId, trigger.enabled)
                          }
                          disabled={isLoading}
                        />
                        <Badge className="uppercase" variant={trigger.enabled ? 'primary' : 'code'}>
                          {trigger.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" disabled={isLoading}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => runTrigger(trigger.id, trigger.agentId, trigger.name)}
                        >
                          <Play className="w-4 h-4" />
                          Run Now
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/${tenantId}/projects/${projectId}/triggers/scheduled/${trigger.agentId}/${trigger.id}/invocations`}
                          >
                            <History className="w-4 h-4" />
                            View Invocations
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/${tenantId}/projects/${projectId}/triggers/scheduled/${trigger.agentId}/${trigger.id}/edit`}
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => deleteTrigger(trigger.id, trigger.agentId, trigger.name)}
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
