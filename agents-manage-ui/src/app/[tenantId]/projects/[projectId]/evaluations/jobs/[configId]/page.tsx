import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import FullPageError from '@/components/errors/full-page-error';
import { EvaluationJobResults } from '@/components/evaluation-jobs/evaluation-job-results';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { LocalDateTimeText } from '@/components/ui/local-date-time-text';
import { fetchDatasetRun } from '@/lib/api/dataset-runs';
import type {
  EvaluationJobConfig,
  EvaluationJobFilterCriteria,
} from '@/lib/api/evaluation-job-configs';
import { fetchEvaluationJobConfig } from '@/lib/api/evaluation-job-configs';
import { fetchEvaluationResultsByJobConfig } from '@/lib/api/evaluation-results';
import { fetchEvaluators } from '@/lib/api/evaluators';
import { getEvaluationJobLabel } from '@/lib/evaluation/job-config-label';

export const dynamic = 'force-dynamic';

export async function getJobName({
  tenantId,
  projectId,
  jobConfig,
}: {
  tenantId: string;
  projectId: string;
  jobConfig: EvaluationJobConfig;
}) {
  const criteria = jobConfig.jobFilters as EvaluationJobFilterCriteria;

  // Resolve dataset run names so the shared label can render them; failures
  // fall back to a short `Run <id>` inside the helper.
  let datasetRunNames: Record<string, string> | undefined;
  if (criteria?.datasetRunIds && criteria.datasetRunIds.length > 0) {
    const entries = await Promise.all(
      criteria.datasetRunIds.map(async (runId) => {
        try {
          const datasetRun = await fetchDatasetRun(tenantId, projectId, runId);
          return [runId, datasetRun.data?.runConfigName] as const;
        } catch {
          return [runId, undefined] as const;
        }
      })
    );
    datasetRunNames = Object.fromEntries(
      entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
    );
  }

  return getEvaluationJobLabel(jobConfig, datasetRunNames);
}

async function EvaluationJobPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/evaluations/jobs/[configId]'>) {
  const { tenantId, projectId, configId } = await params;

  try {
    const [jobConfig, results, evaluators] = await Promise.all([
      fetchEvaluationJobConfig(tenantId, projectId, configId),
      fetchEvaluationResultsByJobConfig(tenantId, projectId, configId),
      fetchEvaluators(tenantId, projectId),
    ]);

    return (
      <>
        <div className="flex items-center gap-4 mb-6">
          <Link href={`/${tenantId}/projects/${projectId}/evaluations?tab=jobs`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to batch evaluations
            </Button>
          </Link>
        </div>
        <PageHeader
          title={await getJobName({ tenantId, projectId, jobConfig })}
          description={
            <>
              Created <LocalDateTimeText dateString={jobConfig.createdAt} />
            </>
          }
        />
        <EvaluationJobResults
          tenantId={tenantId}
          projectId={projectId}
          jobConfig={jobConfig}
          results={results}
          evaluators={evaluators.data}
        />
      </>
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="batch evaluation" />;
  }
}

export default EvaluationJobPage;
