import type {
  EvaluationJobConfig,
  EvaluationJobFilterCriteria,
} from '@/lib/api/evaluation-job-configs';

/**
 * Human-readable fallback label for a batch evaluation (job config) that has no
 * filters. Batch evaluations have no `name` field, so we derive a display label
 * from their filters; when there are none, every conversation is in scope.
 */
export const UNFILTERED_JOB_LABEL = 'All conversations';

/**
 * Derive a consistent display label for a batch evaluation (evaluation job
 * config). Used by both the list and detail/breadcrumb views so the same job
 * never renders one label in one place and a raw ID in another.
 *
 * Resolution order:
 * 1. Date range, when set.
 * 2. Dataset run names (resolved via `datasetRunNames`, falling back to a short
 *    `Run <id>` when a name is unavailable).
 * 3. `UNFILTERED_JOB_LABEL` — never the opaque job-config ID.
 */
export function getEvaluationJobLabel(
  jobConfig: Pick<EvaluationJobConfig, 'jobFilters'>,
  datasetRunNames?: Record<string, string>
): string {
  const criteria = jobConfig.jobFilters as EvaluationJobFilterCriteria | null | undefined;

  if (criteria?.dateRange?.startDate && criteria?.dateRange?.endDate) {
    const startDate = new Date(criteria.dateRange.startDate).toLocaleDateString();
    const endDate = new Date(criteria.dateRange.endDate).toLocaleDateString();
    return `${startDate} - ${endDate}`;
  }

  if (criteria?.datasetRunIds && criteria.datasetRunIds.length > 0) {
    return criteria.datasetRunIds
      .map((id) => datasetRunNames?.[id] || `Run ${id.slice(0, 8)}`)
      .join(', ');
  }

  return UNFILTERED_JOB_LABEL;
}
