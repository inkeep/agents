'use client';

import { Clock, History, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
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
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  deleteScheduledTriggerAction,
  updateScheduledTriggerEnabledAction,
} from '@/lib/actions/scheduled-triggers';
import type { ScheduledTrigger } from '@/lib/api/scheduled-triggers';

interface ScheduledTriggersTableProps {
  triggers: ScheduledTrigger[];
  tenantId: string;
  projectId: string;
  agentId: string;
}

function formatSchedule(trigger: ScheduledTrigger): string {
  if (trigger.cronExpression) {
    return trigger.cronExpression;
  }
  if (trigger.runAt) {
    return new Date(trigger.runAt).toLocaleString();
  }
  return '—';
}

function getScheduleType(trigger: ScheduledTrigger): 'cron' | 'one-time' {
  return trigger.cronExpression ? 'cron' : 'one-time';
}

export function ScheduledTriggersTable({
  triggers,
  tenantId,
  projectId,
  agentId,
}: ScheduledTriggersTableProps) {
  const router = useRouter();
  const [loadingTriggers, setLoadingTriggers] = useState<Set<string>>(new Set());

  const toggleEnabled = async (triggerId: string, currentEnabled: boolean) => {
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

  const deleteTrigger = async (triggerId: string, name: string) => {
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

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow noHover>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {triggers.length === 0 ? (
            <TableRow noHover>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No scheduled triggers configured yet. Create a scheduled trigger to run your agent
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
                    <Badge variant="outline" className="gap-1">
                      <Clock className="w-3 h-3" />
                      {scheduleType === 'cron' ? 'Recurring' : 'One-time'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-xs font-mono">
                      {formatSchedule(trigger)}
                    </code>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={trigger.enabled}
                        onCheckedChange={() => toggleEnabled(trigger.id, trigger.enabled)}
                        disabled={isLoading}
                      />
                      <Badge variant={trigger.enabled ? 'default' : 'secondary'}>
                        {trigger.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" disabled={isLoading}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers/${trigger.id}/invocations`}
                          >
                            <History className="w-4 h-4 mr-2" />
                            View Invocations
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers/${trigger.id}/edit`}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => deleteTrigger(trigger.id, trigger.name)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
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
