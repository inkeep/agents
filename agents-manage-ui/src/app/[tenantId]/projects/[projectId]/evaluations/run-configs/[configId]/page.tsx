import FullPageError from '@/components/errors/full-page-error';
import { EvaluationRunConfigResults } from '@/components/evaluation-run-configs/evaluation-run-config-results';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { fetchEvaluationResultsByRunConfig } from '@/lib/api/evaluation-results';
import { fetchEvaluationRunConfig } from '@/lib/api/evaluation-run-configs';
import { fetchEvaluationSuiteConfigs } from '@/lib/api/evaluation-suite-configs';
import { fetchEvaluators } from '@/lib/api/evaluators';

export const dynamic = 'force-dynamic';

async function EvaluationRunConfigPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/evaluations/run-configs/[configId]'>) {
  const { tenantId, projectId, configId } = await params;

  let runConfig: Awaited<ReturnType<typeof fetchEvaluationRunConfig>>;
  let results: Awaited<ReturnType<typeof fetchEvaluationResultsByRunConfig>>;
  let evaluators: Awaited<ReturnType<typeof fetchEvaluators>>;
  let suiteConfigs: Awaited<ReturnType<typeof fetchEvaluationSuiteConfigs>>;
  try {
    [runConfig, results, evaluators, suiteConfigs] = await Promise.all([
      fetchEvaluationRunConfig(tenantId, projectId, configId),
      fetchEvaluationResultsByRunConfig(tenantId, projectId, configId),
      fetchEvaluators(tenantId, projectId),
      fetchEvaluationSuiteConfigs(tenantId, projectId),
    ]);
  } catch (error) {
    return <FullPageError error={error as Error} context="evaluation run config" />;
  }

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Evaluations', href: `/${tenantId}/projects/${projectId}/evaluations` },
        { label: 'Run Configs', href: `/${tenantId}/projects/${projectId}/evaluations` },
        {
          label: runConfig.name,
          href: `/${tenantId}/projects/${projectId}/evaluations/run-configs/${configId}`,
        },
      ]}
    >
      <MainContent className="min-h-full">
        <PageHeader
          title={`Evaluation Run Config: ${runConfig.name}`}
          description="View automatic evaluation results triggered by conversations"
        />
        <EvaluationRunConfigResults
          tenantId={tenantId}
          projectId={projectId}
          runConfig={runConfig}
          results={results.data}
          evaluators={evaluators.data}
          suiteConfigs={suiteConfigs.data}
        />
      </MainContent>
    </BodyTemplate>
  );
}

export default EvaluationRunConfigPage;
