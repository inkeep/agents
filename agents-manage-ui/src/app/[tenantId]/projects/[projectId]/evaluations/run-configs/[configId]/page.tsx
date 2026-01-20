import FullPageError from '@/components/errors/full-page-error';
import { EvaluationRunConfigResults } from '@/components/evaluation-run-configs/evaluation-run-config-results';
import { PageHeader } from '@/components/layout/page-header';
import { fetchEvaluationResultsByRunConfig } from '@/lib/api/evaluation-results';
import { fetchEvaluationRunConfig } from '@/lib/api/evaluation-run-configs';
import {
  fetchEvaluationSuiteConfigEvaluators,
  fetchEvaluationSuiteConfigs,
} from '@/lib/api/evaluation-suite-configs';
import { fetchEvaluators } from '@/lib/api/evaluators';

export const dynamic = 'force-dynamic';

async function EvaluationRunConfigPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/evaluations/run-configs/[configId]'>) {
  const { tenantId, projectId, configId } = await params;

  try {
    const [runConfig, results, evaluators, suiteConfigs] = await Promise.all([
      fetchEvaluationRunConfig(tenantId, projectId, configId),
      fetchEvaluationResultsByRunConfig(tenantId, projectId, configId),
      fetchEvaluators(tenantId, projectId),
      fetchEvaluationSuiteConfigs(tenantId, projectId),
    ]);

    // Fetch evaluators for each suite config used by this run config
    const suiteConfigEvaluators = new Map<string, string[]>();
    if (runConfig.suiteConfigIds && runConfig.suiteConfigIds.length > 0) {
      await Promise.all(
        runConfig.suiteConfigIds.map(async (suiteConfigId) => {
          try {
            const evaluatorsRes = await fetchEvaluationSuiteConfigEvaluators(
              tenantId,
              projectId,
              suiteConfigId
            );
            suiteConfigEvaluators.set(
              suiteConfigId,
              evaluatorsRes.data.map((e) => e.evaluatorId)
            );
          } catch {
            // If fetch fails, set empty array
            suiteConfigEvaluators.set(suiteConfigId, []);
          }
        })
      );
    }

    return (
      <>
        <PageHeader
          title={`Continuous Test: ${runConfig.name}`}
          description="View automatic evaluation results triggered by conversations"
        />
        <EvaluationRunConfigResults
          tenantId={tenantId}
          projectId={projectId}
          runConfig={runConfig}
          results={results.data}
          evaluators={evaluators.data}
          suiteConfigs={suiteConfigs.data}
          suiteConfigEvaluators={suiteConfigEvaluators}
        />
      </>
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="evaluation run config" />;
  }
}

export default EvaluationRunConfigPage;
