import FullPageError from '@/components/errors/full-page-error';
import { EvaluationJobResults } from '@/components/evaluation-jobs/evaluation-job-results';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import type { EvaluationJobFilterCriteria } from '@/lib/api/evaluation-job-configs';
import { fetchEvaluationJobConfig } from '@/lib/api/evaluation-job-configs';
import { fetchEvaluationResultsByJobConfig } from '@/lib/api/evaluation-results';
import { fetchEvaluators } from '@/lib/api/evaluators';
import { fetchDatasetRun } from '@/lib/api/dataset-runs';

export const dynamic = 'force-dynamic';

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

    // Get the dataset run name for breadcrumb
    let displayName = jobConfig.id;
    const criteria = jobConfig.jobFilters as EvaluationJobFilterCriteria;
    if (criteria?.datasetRunIds && criteria.datasetRunIds.length > 0) {
      try {
        const datasetRun = await fetchDatasetRun(tenantId, projectId, criteria.datasetRunIds[0]);
        displayName = datasetRun.data?.runConfigName || jobConfig.id;
      } catch {
        // Fallback to ID if fetch fails
      }
    }

    return (
      <BodyTemplate
        breadcrumbs={[
          { label: 'Evaluations', href: `/${tenantId}/projects/${projectId}/evaluations` },
          { label: 'Batch Evaluations', href: `/${tenantId}/projects/${projectId}/evaluations` },
          {
            label: displayName,
            href: `/${tenantId}/projects/${projectId}/evaluations/jobs/${configId}`,
          },
        ]}
      >
        <MainContent className="min-h-full">
          <PageHeader
            title={displayName}
          />
          <EvaluationJobResults
            tenantId={tenantId}
            projectId={projectId}
            jobConfig={jobConfig}
            results={results.data}
            evaluators={evaluators.data}
          />
        </MainContent>
      </BodyTemplate>
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="batch evaluation" />;
  }
}

export default EvaluationJobPage;
