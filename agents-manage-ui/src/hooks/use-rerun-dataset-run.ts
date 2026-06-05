'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { rerunDatasetRunAction } from '@/lib/actions/dataset-runs';
import type { RerunDatasetRunResponse } from '@/lib/api/dataset-runs';

interface UseRerunDatasetRunOptions {
  tenantId: string;
  projectId: string;
  datasetId: string;
  /**
   * Called after the rerun action reports success. Receives the response so
   * callers can navigate to the new run, refresh a list, etc.
   */
  onSuccess?: (response: RerunDatasetRunResponse) => void | Promise<void>;
}

export interface RerunTarget {
  runId: string;
  /**
   * Runs created outside of a run config cannot be rerun. When this is
   * falsy, `rerun` becomes a no-op and `canRerun` returns false.
   */
  datasetRunConfigId?: string | null;
}

/**
 * Shared rerun handler for a dataset run. Manages the per-run loading state,
 * toast notifications, and delegation to `rerunDatasetRunAction` so both the
 * runs list and the run detail page stay in sync.
 */
export function useRerunDatasetRun({
  tenantId,
  projectId,
  datasetId,
  onSuccess,
}: UseRerunDatasetRunOptions) {
  const [rerunningId, setRerunningId] = useState<string | null>(null);

  async function rerun(target: RerunTarget) {
    if (!target.datasetRunConfigId) return;

    setRerunningId(target.runId);
    let result: Awaited<ReturnType<typeof rerunDatasetRunAction>> | undefined;
    let thrown: unknown;
    try {
      result = await rerunDatasetRunAction(tenantId, projectId, target.runId, datasetId);
    } catch (err) {
      thrown = err;
    }
    setRerunningId(null);

    if (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : 'Failed to start rerun');
      return;
    }
    if (result?.success && result.data) {
      toast.success(`Rerun started (${result.data.totalItems} items)`);
      await onSuccess?.(result.data);
      return;
    }
    toast.error(result?.error || 'Failed to start rerun');
  }

  return {
    rerun,
    rerunningId,
    isRerunning: (runId: string) => rerunningId === runId,
    canRerun: (target: RerunTarget) => Boolean(target.datasetRunConfigId),
  };
}
