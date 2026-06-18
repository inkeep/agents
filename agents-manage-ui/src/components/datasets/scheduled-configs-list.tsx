'use client';

import { History, MoreHorizontal, Pencil, Play, RotateCw, Trash2 } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
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
import { useOrgMembers } from '@/hooks/use-org-members';
import type { DatasetRunConfigSchedule } from '@/lib/api/dataset-run-configs';
import {
  deleteDatasetRunConfigSchedule,
  getDatasetRunConfig,
  getDatasetRunConfigSchedule,
  listDatasetRunConfigsByDataset,
  setDatasetRunConfigSchedule,
  triggerDatasetRun,
} from '@/lib/api/dataset-run-configs';
import { getCronDescription } from '@/lib/utils/cron';
import {
  formatDateTimeLocal,
  getLocalTimezoneAbbreviation,
  getTimezoneAbbreviation,
} from '@/lib/utils/format-date';
import { DatasetRunConfigFormDialog } from './dataset-run-config-form-dialog';

interface RunConfigWithSchedule {
  id: string;
  name: string;
  description?: string;
  agentIds: string[];
  schedule: DatasetRunConfigSchedule;
}

interface ScheduledConfigsListProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  refreshKey?: number;
  onRunTriggered?: () => void;
}

export function ScheduledConfigsList({
  tenantId,
  projectId,
  datasetId,
  refreshKey = 0,
  onRunTriggered,
}: ScheduledConfigsListProps) {
  const router = useRouter();
  const [configs, setConfigs] = useState<RunConfigWithSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const { members } = useOrgMembers(tenantId, projectId);

  const getUserDisplayName = (userId: string) => {
    const member = members.find((m) => m.id === userId);
    return member?.name || member?.email || userId;
  };

  useEffect(() => {
    let cancelled = false;
    void refreshKey;

    async function fetchConfigs() {
      const configsList = await listDatasetRunConfigsByDataset(tenantId, projectId, datasetId);

      const results = await Promise.all(
        configsList.map(async (config) => {
          const [schedule, configDetail] = await Promise.all([
            getDatasetRunConfigSchedule(tenantId, projectId, config.id).catch(() => null),
            getDatasetRunConfig(tenantId, projectId, config.id).catch(() => null),
          ]);
          if (!schedule) return null;
          return {
            id: config.id,
            name: config.name,
            description: config.description ?? undefined,
            agentIds: configDetail?.agentIds ?? [],
            schedule,
          } as RunConfigWithSchedule;
        })
      );

      return results
        .filter((c): c is RunConfigWithSchedule => c !== null)
        .sort((a, b) => {
          const aNext = a.schedule.nextRunAt;
          const bNext = b.schedule.nextRunAt;
          if (!aNext && !bNext) return 0;
          if (!aNext) return 1;
          if (!bNext) return -1;
          return new Date(aNext).getTime() - new Date(bNext).getTime();
        });
    }

    setLoading(true);
    fetchConfigs()
      .then((data) => {
        if (!cancelled) {
          setConfigs(data);
          setFetchError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFetchError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const intervalId = setInterval(() => {
      fetchConfigs()
        .then((data) => {
          if (!cancelled) {
            setConfigs(data);
            setFetchError(false);
          }
        })
        .catch(() => {
          if (!cancelled) setFetchError(true);
        });
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [tenantId, projectId, datasetId, refreshKey]);

  const handleRunNow = async (configId: string, name: string) => {
    setLoadingIds((prev) => new Set(prev).add(configId));
    try {
      const result = await triggerDatasetRun(tenantId, projectId, configId);
      toast.success(`Run triggered: ${name}`, {
        description: `${result.totalItems} items queued`,
      });
      setConfigs((prev) =>
        prev.map((c) =>
          c.id === configId
            ? { ...c, schedule: { ...c.schedule, lastRunAt: new Date().toISOString() } }
            : c
        )
      );
      onRunTriggered?.();
    } catch {
      toast.error('Failed to trigger run');
    }
    setLoadingIds((prev) => {
      const next = new Set(prev);
      next.delete(configId);
      return next;
    });
  };

  const handleToggleEnabled = async (config: RunConfigWithSchedule) => {
    setLoadingIds((prev) => new Set(prev).add(config.id));
    try {
      const updated = await setDatasetRunConfigSchedule(tenantId, projectId, config.id, {
        cronExpression: config.schedule.cronExpression,
        cronTimezone: config.schedule.cronTimezone,
        enabled: !config.schedule.enabled,
      });
      toast.success(config.schedule.enabled ? 'Schedule paused' : 'Schedule enabled');
      setConfigs((prev) =>
        prev.map((c) =>
          c.id === config.id ? { ...c, schedule: { ...c.schedule, ...updated } } : c
        )
      );
    } catch {
      toast.error('Failed to update schedule');
    }
    setLoadingIds((prev) => {
      const next = new Set(prev);
      next.delete(config.id);
      return next;
    });
  };

  const handleDelete = async (configId: string) => {
    try {
      await deleteDatasetRunConfigSchedule(tenantId, projectId, configId);
      toast.success('Schedule removed');
      router.refresh();
    } catch {
      toast.error('Failed to remove schedule');
    }
  };

  if (loading) return <Skeleton className="h-24 w-full" />;

  const localTz = getLocalTimezoneAbbreviation();

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow noHover>
            <TableHead>Name</TableHead>
            <TableHead>Agents</TableHead>
            <TableHead>Run As</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Last Run{localTz ? ` (${localTz})` : ''}</TableHead>
            <TableHead>Next Run{localTz ? ` (${localTz})` : ''}</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {fetchError ? (
            <TableRow noHover>
              <TableCell colSpan={9} className="text-center py-8">
                <span className="text-destructive">
                  Failed to load scheduled runs. Will retry automatically.
                </span>
              </TableCell>
            </TableRow>
          ) : configs.length === 0 ? (
            <TableRow noHover>
              <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                No scheduled runs configured yet. Create one to automatically run this test suite on
                a recurring basis.
              </TableCell>
            </TableRow>
          ) : (
            configs.map((config) => {
              const isLoading = loadingIds.has(config.id);
              const timezone = config.schedule.cronTimezone || 'UTC';

              return (
                <TableRow key={config.id} noHover>
                  <TableCell>
                    <div className="space-y-1">
                      <Link
                        href={`/${tenantId}/projects/${projectId}/datasets/${datasetId}/scheduled/${config.id}/invocations`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {config.name}
                      </Link>
                      {config.description && (
                        <div className="text-sm text-muted-foreground max-w-md truncate">
                          {config.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {config.agentIds.length > 0 ? (
                        config.agentIds.map((agentId) => (
                          <Badge key={agentId} variant="secondary" className="text-xs">
                            {agentId}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {config.schedule.runAsUserId ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm text-muted-foreground truncate max-w-[150px] inline-block cursor-default">
                              {getUserDisplayName(config.schedule.runAsUserId)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <code className="font-mono text-xs">{config.schedule.runAsUserId}</code>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="code" className="gap-1 uppercase">
                      <RotateCw className="w-3 h-3" />
                      Recurring
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {config.schedule.cronExpression ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <code className="bg-muted text-muted-foreground rounded-md border px-2 py-1 text-xs w-fit">
                              {getCronDescription(config.schedule.cronExpression)}{' '}
                              {getTimezoneAbbreviation(timezone)}
                            </code>
                          </TooltipTrigger>
                          <TooltipContent>
                            <code className="font-mono">
                              {config.schedule.cronExpression} ({timezone})
                            </code>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {config.schedule.lastRunAt
                        ? formatDateTimeLocal(config.schedule.lastRunAt)
                        : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {config.schedule.nextRunAt
                        ? formatDateTimeLocal(config.schedule.nextRunAt)
                        : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={config.schedule.enabled}
                        onCheckedChange={() => handleToggleEnabled(config)}
                        disabled={isLoading}
                      />
                      <Badge
                        className="uppercase"
                        variant={config.schedule.enabled ? 'primary' : 'code'}
                      >
                        {config.schedule.enabled ? 'Enabled' : 'Disabled'}
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
                        <DropdownMenuItem onClick={() => handleRunNow(config.id, config.name)}>
                          <Play className="w-4 h-4" />
                          Run Now
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/${tenantId}/projects/${projectId}/datasets/${datasetId}/scheduled/${config.id}/invocations`}
                          >
                            <History className="w-4 h-4" />
                            View Invocations
                          </Link>
                        </DropdownMenuItem>
                        <DatasetRunConfigFormDialog
                          tenantId={tenantId}
                          projectId={projectId}
                          datasetId={datasetId}
                          runConfigId={config.id}
                          initialData={{
                            name: config.name,
                            description: config.description,
                          }}
                          showSchedule
                          onSuccess={() => router.refresh()}
                          trigger={
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                              <Pencil className="w-4 h-4" />
                              Edit
                            </DropdownMenuItem>
                          }
                        />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleDelete(config.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete Schedule
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
