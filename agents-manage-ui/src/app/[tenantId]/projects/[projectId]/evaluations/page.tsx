import FullPageError from '@/components/errors/full-page-error';
import { EvaluationsTabs } from '@/components/evaluations/evaluations-tabs';
import { PageHeader } from '@/components/layout/page-header';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchEvaluationJobConfigs } from '@/lib/api/evaluation-job-configs';
import { fetchEvaluationRunConfigs } from '@/lib/api/evaluation-run-configs';
import { fetchEvaluators } from '@/lib/api/evaluators';

export const dynamic = 'force-dynamic';

const evaluationsDescription =
  'Evaluators are LLM-based assessment tools that analyze conversations and provide structured feedback.';

async function EvaluationsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/evaluations'>) {
  const { tenantId, projectId } = await params;

  try {
    const [evaluators, jobConfigs, runConfigs] = await Promise.all([
      fetchEvaluators(tenantId, projectId),
      fetchEvaluationJobConfigs(tenantId, projectId),
      fetchEvaluationRunConfigs(tenantId, projectId),
    ]);
    return (
      <>
        <PageHeader title={STATIC_LABELS.evaluations} description={evaluationsDescription} />
        <EvaluationsTabs
          tenantId={tenantId}
          projectId={projectId}
          evaluators={evaluators.data}
          jobConfigs={jobConfigs.data}
          runConfigs={runConfigs.data}
        />
      </>
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="evaluations" />;
  }
}

export default EvaluationsPage;
