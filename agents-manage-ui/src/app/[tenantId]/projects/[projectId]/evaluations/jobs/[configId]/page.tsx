import FullPageError from '@/components/errors/full-page-error';
import { EvaluationJobResults } from '@/components/evaluation-jobs/evaluation-job-results';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { fetchEvaluationJobConfig } from '@/lib/api/evaluation-job-configs';
import { fetchEvaluationResultsByJobConfig } from '@/lib/api/evaluation-results';
import { fetchEvaluators } from '@/lib/api/evaluators';

export const dynamic = 'force-dynamic';

async function EvaluationJobPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/evaluations/jobs/[configId]'>) {
  const { tenantId, projectId, configId } = await params;

  let jobConfig: Awaited<ReturnType<typeof fetchEvaluationJobConfig>>;
  let results: Awaited<ReturnType<typeof fetchEvaluationResultsByJobConfig>>;
  let evaluators: Awaited<ReturnType<typeof fetchEvaluators>>;
  try {
    [jobConfig, results, evaluators] = await Promise.all([
      fetchEvaluationJobConfig(tenantId, projectId, configId),
      fetchEvaluationResultsByJobConfig(tenantId, projectId, configId),
      fetchEvaluators(tenantId, projectId),
    ]);
  } catch (error) {
    return <FullPageError error={error as Error} context="batch evaluation" />;
  }

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Evaluations', href: `/${tenantId}/projects/${projectId}/evaluations` },
        { label: 'Batch Evaluations', href: `/${tenantId}/projects/${projectId}/evaluations` },
        {
          label: jobConfig.id,
          href: `/${tenantId}/projects/${projectId}/evaluations/jobs/${configId}`,
        },
      ]}
    >
      <MainContent className="min-h-full">
        <PageHeader
          title={`Batch Evaluation: ${jobConfig.id}`}
          description="View evaluation results"
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
}

export default EvaluationJobPage;
