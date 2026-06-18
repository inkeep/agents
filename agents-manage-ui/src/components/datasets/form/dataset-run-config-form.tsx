'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useController, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { ComponentSelector } from '@/components/agent/sidepane/nodes/component-selector/component-selector';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { FriendlyScheduleBuilder } from '@/components/scheduled-triggers/friendly-schedule-builder';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useIsOrgAdmin } from '@/hooks/use-is-org-admin';
import { useOrgMembers } from '@/hooks/use-org-members';
import {
  createDatasetRunConfigAction,
  updateDatasetRunConfigAction,
} from '@/lib/actions/dataset-run-configs';
import { fetchDatasetAgents, fetchEvaluatorAgentScopesBatch } from '@/lib/api/agent-relations';
import type { DatasetRunConfigInsert } from '@/lib/api/dataset-run-configs';
import {
  getDatasetRunConfig,
  getDatasetRunConfigSchedule,
  setDatasetRunConfigSchedule,
} from '@/lib/api/dataset-run-configs';
import { useAgentsQuery } from '@/lib/query/agents';
import { useEvaluatorsQuery } from '@/lib/query/evaluators';
import { createLookup } from '@/lib/utils';
import { datasetRunConfigSchema } from './dataset-run-config-validation';

interface DatasetRunConfigFormProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  runConfigId?: string;
  initialData?: {
    name?: string;
    description?: string;
    agentIds?: string[];
    evaluatorIds?: string[];
  };
  showSchedule?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function DatasetRunConfigForm({
  tenantId,
  projectId,
  datasetId,
  runConfigId,
  initialData,
  showSchedule = false,
  onSuccess,
  onCancel,
}: DatasetRunConfigFormProps) {
  const { data: agents, isFetching: loadingAgents } = useAgentsQuery();
  const { data: evaluators, isFetching: loadingEvaluators } = useEvaluatorsQuery();

  const form = useForm({
    resolver: zodResolver(datasetRunConfigSchema),
    defaultValues: {
      name: initialData?.name || '',
      description: initialData?.description || '',
      agentIds: initialData?.agentIds || [],
      evaluatorIds: initialData?.evaluatorIds || [],
    },
  });

  const { isSubmitting } = form.formState;
  const {
    field: { value: agentIds, onChange: setAgentIds },
  } = useController({
    name: 'agentIds',
    control: form.control,
    defaultValue: [],
  });

  useEffect(() => {
    if (runConfigId) return;
    if (initialData) {
      form.reset({
        name: initialData.name || '',
        description: initialData.description || '',
        agentIds: initialData.agentIds || [],
        evaluatorIds: initialData?.evaluatorIds || [],
      });
    }
  }, [initialData, form, runConfigId]);

  const [scheduleEnabled, setScheduleEnabled] = useState(showSchedule);
  const [cronExpression, setCronExpression] = useState('0 9 * * *');
  const [cronTimezone, setCronTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  );
  const [dispatchDelayMs, setDispatchDelayMs] = useState(120_000);
  const [maxRetries, setMaxRetries] = useState(1);
  const [retryDelaySeconds, setRetryDelaySeconds] = useState(60);
  const [timeoutSeconds, setTimeoutSeconds] = useState(780);
  const [scheduleRunAsUserIds, setScheduleRunAsUserIds] = useState<string[]>([]);
  const [scheduleLoaded, setScheduleLoaded] = useState(!runConfigId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { members } = useOrgMembers(tenantId, projectId);
  const isAdmin = useIsOrgAdmin();

  useEffect(() => {
    if (!runConfigId) return;
    let cancelled = false;
    (async () => {
      let config: Awaited<ReturnType<typeof getDatasetRunConfig>> | null = null;
      let schedule: Awaited<ReturnType<typeof getDatasetRunConfigSchedule>> | null = null;

      try {
        config = await getDatasetRunConfig(tenantId, projectId, runConfigId);
      } catch {
        if (!cancelled) {
          setLoadError('Failed to load run configuration. Please close and reopen.');
        }
        return;
      }

      try {
        schedule = await getDatasetRunConfigSchedule(tenantId, projectId, runConfigId);
      } catch {
        schedule = null;
      }

      if (cancelled) return;

      if (config) {
        form.reset({
          name: config.name || '',
          description: config.description || '',
          agentIds: config.agentIds || [],
          evaluatorIds: schedule?.evaluatorIds || [],
        });
        if (config.agentIds) setAgentIds(config.agentIds);
      }

      if (schedule) {
        setScheduleEnabled(schedule.enabled);
        setCronExpression(schedule.cronExpression);
        setCronTimezone(schedule.cronTimezone);
        if (schedule.runAsUserIds?.length) setScheduleRunAsUserIds(schedule.runAsUserIds);
        if (typeof schedule.dispatchDelayMs === 'number')
          setDispatchDelayMs(schedule.dispatchDelayMs);
        if (typeof schedule.maxRetries === 'number') setMaxRetries(schedule.maxRetries);
        if (typeof schedule.retryDelaySeconds === 'number')
          setRetryDelaySeconds(schedule.retryDelaySeconds);
        if (typeof schedule.timeoutSeconds === 'number') setTimeoutSeconds(schedule.timeoutSeconds);
      }
      setScheduleLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId, runConfigId, form, setAgentIds]);

  const [datasetScopedAgentIds, setDatasetScopedAgentIds] = useState<string[] | null>(null);

  useEffect(() => {
    fetchDatasetAgents(tenantId, projectId, datasetId)
      .then((relations) => {
        if (relations.length > 0) {
          setDatasetScopedAgentIds(relations.map((r) => r.agentId));
        } else {
          setDatasetScopedAgentIds(null);
        }
      })
      .catch(() => toast.error('Failed to load dataset agent scope'));
  }, [tenantId, projectId, datasetId]);

  const filteredAgents = (() => {
    if (!datasetScopedAgentIds) return agents;
    const allowed = new Set(datasetScopedAgentIds);
    return agents.filter((a) => allowed.has(a.id));
  })();

  const agentLookup = createLookup(filteredAgents);

  const [evaluatorAgentMap, setEvaluatorAgentMap] = useState(new Map<string, string[]>());

  useEffect(() => {
    if (evaluators.length === 0) return;
    const abortController = new AbortController();
    fetchEvaluatorAgentScopesBatch(
      tenantId,
      projectId,
      evaluators.map((ev) => ev.id)
    )
      .then((map) => {
        if (!abortController.signal.aborted) {
          setEvaluatorAgentMap(map);
        }
      })
      .catch(() => toast.error('Failed to load evaluator agent scopes'));
    return () => abortController.abort();
  }, [evaluators, tenantId, projectId]);

  const filteredEvaluators = agentIds?.length
    ? evaluators.filter((ev) => {
        const scopedAgents = evaluatorAgentMap.get(ev.id);
        if (!scopedAgents || scopedAgents.length === 0) return true;
        return scopedAgents.some((agentId) => agentIds.includes(agentId));
      })
    : evaluators;

  const evaluatorLookup = createLookup(filteredEvaluators);

  const runAsOptions = (() => {
    const missingIds = scheduleRunAsUserIds.filter((id) => !members.some((m) => m.id === id));
    if (missingIds.length === 0) return members;
    return [...missingIds.map((id) => ({ id, name: '', email: id })), ...members];
  })();

  const selectedEvaluatorIds = useWatch({ control: form.control, name: 'evaluatorIds' });

  useEffect(() => {
    if (!filteredEvaluators.length) return;
    const validIds = new Set(filteredEvaluators.map((e) => e.id));
    const filtered = (selectedEvaluatorIds || []).filter((id) => validIds.has(id));
    if (filtered.length !== (selectedEvaluatorIds || []).length) {
      form.setValue('evaluatorIds', filtered);
    }
  }, [filteredEvaluators, selectedEvaluatorIds, form]);

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      const selectedAgents = data.agentIds || [];
      const selectedEvalIds = data.evaluatorIds || [];

      if (selectedAgents.length > 0 && selectedEvalIds.length > 0) {
        const unscopedEvaluators = selectedEvalIds.filter((evId) => {
          const scopedAgents = evaluatorAgentMap.get(evId);
          if (!scopedAgents || scopedAgents.length === 0) return false;
          return !scopedAgents.some((aId) => selectedAgents.includes(aId));
        });

        if (unscopedEvaluators.length > 0) {
          const names = unscopedEvaluators
            .map((id) => evaluators.find((e) => e.id === id)?.name ?? id)
            .join(', ');
          toast.error(`The following evaluators are not scoped to the selected agents: ${names}`);
          return;
        }
      }

      const payload = {
        name: data.name,
        description: data.description,
        agentIds: data.agentIds || [],
        evaluatorIds: data.evaluatorIds || [],
        ...(runConfigId ? {} : { datasetId }),
      };

      const result = runConfigId
        ? await updateDatasetRunConfigAction(tenantId, projectId, runConfigId, payload)
        : await createDatasetRunConfigAction(tenantId, projectId, {
            ...(payload as DatasetRunConfigInsert),
            skipAutoRun: scheduleEnabled,
            dispatchDelayMs,
          });

      if (result.success) {
        const configId = runConfigId ?? (result as any).data?.id;
        const schedulePayload = {
          cronExpression,
          cronTimezone,
          maxRetries,
          retryDelaySeconds,
          timeoutSeconds,
        };
        if (configId && runConfigId) {
          try {
            await setDatasetRunConfigSchedule(tenantId, projectId, configId, {
              ...schedulePayload,
              enabled: scheduleEnabled,
            });
          } catch {
            toast.error(
              scheduleEnabled
                ? 'Config saved, but failed to set schedule'
                : 'Config saved, but failed to disable schedule'
            );
          }
        } else if (configId && scheduleEnabled) {
          try {
            await setDatasetRunConfigSchedule(tenantId, projectId, configId, {
              ...schedulePayload,
              enabled: true,
            });
          } catch {
            toast.error('Config saved, but failed to set schedule');
          }
        }
        toast.success(
          runConfigId ? 'Run config updated successfully' : 'Run config created successfully'
        );
        onSuccess?.();
      } else {
        toast.error(result.error || 'An error occurred');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error('An unexpected error occurred');
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6">
        {loadError && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {loadError}
          </div>
        )}
        <GenericInput
          control={form.control}
          name="name"
          label="Name"
          placeholder="Test Run for Production Agents"
          description="A descriptive name for this run configuration"
          isRequired
        />

        <GenericTextarea
          control={form.control}
          name="description"
          label="Description"
          placeholder="Run this test suite against production agents"
          className="min-h-[80px]"
        />

        <FormField
          control={form.control}
          name="agentIds"
          render={() => (
            <FormItem>
              <div className="flex items-center gap-2">
                <FormLabel isRequired>Agents</FormLabel>
                <Badge variant="count">{(agentIds as string[]).length}</Badge>
              </div>
              {loadingAgents ? (
                <p className="text-sm text-muted-foreground">Loading agents...</p>
              ) : (
                <ComponentSelector
                  componentLookup={agentLookup}
                  selectedComponents={agentIds as string[]}
                  onSelectionChange={setAgentIds}
                  emptyStateMessage="No agents available."
                  emptyStateActionText="Create agent"
                  emptyStateActionHref={`/${tenantId}/projects/${projectId}/agents`}
                  placeholder="Select agents..."
                />
              )}
              <FormDescription>
                {datasetScopedAgentIds
                  ? 'Only agents scoped to this test suite are shown.'
                  : 'Select which agents to run this test suite against.'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="evaluatorIds"
          render={({ field }) => (
            <FormItem>
              {loadingEvaluators ? (
                <p className="text-sm text-muted-foreground">Loading evaluators...</p>
              ) : (
                <ComponentSelector
                  label="Evaluators (Optional)"
                  componentLookup={evaluatorLookup}
                  selectedComponents={field.value || []}
                  onSelectionChange={field.onChange}
                  emptyStateMessage="No evaluators available."
                  emptyStateActionText="Create evaluator"
                  emptyStateActionHref={`/${tenantId}/projects/${projectId}/evaluations?tab=evaluators`}
                  placeholder="Select evaluators..."
                />
              )}
              <FormDescription>
                When evaluators are selected, an evaluation job will automatically run after the
                test suite completes
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-4 rounded-lg border p-4">
          <div>
            <Label className="text-sm font-medium">Execution Identity</Label>
            <p className="text-sm text-muted-foreground">
              Choose which user identities this run should execute as. One run per user per agent.
              Leave empty for system-level execution.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Run as Users</Label>
            {isAdmin ? (
              <>
                <Select
                  value="__trigger__"
                  onValueChange={(val) => {
                    if (val !== '__trigger__' && !scheduleRunAsUserIds.includes(val)) {
                      setScheduleRunAsUserIds([...scheduleRunAsUserIds, val]);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Add user..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__trigger__" disabled>
                      Add user...
                    </SelectItem>
                    {runAsOptions
                      .filter((m) => !scheduleRunAsUserIds.includes(m.id))
                      .map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name || member.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {scheduleRunAsUserIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {scheduleRunAsUserIds.map((id) => {
                      const member = runAsOptions.find((m) => m.id === id);
                      return (
                        <Badge
                          key={id}
                          variant="secondary"
                          className="cursor-pointer"
                          onClick={() =>
                            setScheduleRunAsUserIds(
                              scheduleRunAsUserIds.filter((uid) => uid !== id)
                            )
                          }
                        >
                          {member?.name || member?.email || id} &times;
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only org admins can configure execution identity.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dispatch-delay">Dispatch Delay (ms)</Label>
          <Input
            id="dispatch-delay"
            type="number"
            min={0}
            max={600000}
            value={dispatchDelayMs}
            onChange={(e) => setDispatchDelayMs(Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            Delay in milliseconds between dispatching each item's execution (0-600000). Useful for
            managing rate limits.
          </p>
        </div>

        {showSchedule && (
          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <Label className="text-sm font-medium">Schedule</Label>
              <p className="text-sm text-muted-foreground">
                Configure when this test suite should automatically run
              </p>
            </div>
            {scheduleLoaded ? (
              <FriendlyScheduleBuilder
                value={cronExpression}
                onChange={setCronExpression}
                timezone={cronTimezone}
                onTimezoneChange={setCronTimezone}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Loading schedule...</p>
            )}

            <div className="grid grid-cols-3 gap-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="max-retries">Max Retries</Label>
                <Input
                  id="max-retries"
                  type="number"
                  min={0}
                  max={10}
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">0-10 retry attempts on failure</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="retry-delay">Retry Delay (s)</Label>
                <Input
                  id="retry-delay"
                  type="number"
                  min={10}
                  max={3600}
                  value={retryDelaySeconds}
                  onChange={(e) => setRetryDelaySeconds(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">10-3600 seconds between retries</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeout">Timeout (s)</Label>
                <Input
                  id="timeout"
                  type="number"
                  min={30}
                  max={780}
                  value={timeoutSeconds}
                  onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">30-780 second execution timeout</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex w-full justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting || !!loadError}>
            {isSubmitting
              ? runConfigId
                ? 'Updating...'
                : 'Creating...'
              : runConfigId
                ? 'Update Run Configuration'
                : 'Create Run'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
