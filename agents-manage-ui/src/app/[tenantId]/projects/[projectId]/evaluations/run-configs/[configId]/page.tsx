import type { Metadata } from 'next';
import FullPageError from '@/components/errors/full-page-error';
import { EvaluationRunConfigResults } from '@/components/evaluation-run-configs/evaluation-run-config-results';
import { PageHeader } from '@/components/layout/page-header';
import { fetchEvaluationResultsPaginated } from '@/lib/api/evaluation-results';
import { fetchEvaluationRunConfig } from '@/lib/api/evaluation-run-configs';
import {
  fetchEvaluationSuiteConfigEvaluators,
  fetchEvaluationSuiteConfigs,
} from '@/lib/api/evaluation-suite-configs';
import { fetchEvaluators } from '@/lib/api/evaluators';

export const dynamic = 'force-dynamic';

export const metadata = {
  description: 'View automatic evaluation results triggered by conversations.',
} satisfies Metadata;

async function EvaluationRunConfigPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string; projectId: string; configId: string }>;
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const { tenantId, projectId, configId } = await params;
  const { conversationId } = await searchParams;

  try {
    const [runConfig, initialResponse, evaluators, suiteConfigs] = await Promise.all([
      fetchEvaluationRunConfig(tenantId, projectId, configId),
      fetchEvaluationResultsPaginated(tenantId, projectId, 'run-config', configId, {
        page: 1,
        limit: 50,
        conversationId,
      }),
      fetchEvaluators(tenantId, projectId),
      fetchEvaluationSuiteConfigs(tenantId, projectId),
    ]);

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
            suiteConfigEvaluators.set(suiteConfigId, []);
          }
        })
      );
    }

    return (
      <>
        <PageHeader
          title={`Continuous Test: ${runConfig.name}`}
          description={metadata.description}
        />
        <EvaluationRunConfigResults
          tenantId={tenantId}
          projectId={projectId}
          runConfig={runConfig}
          initialResponse={initialResponse}
          evaluators={evaluators.data}
          suiteConfigs={suiteConfigs.data}
          suiteConfigEvaluators={suiteConfigEvaluators}
          conversationId={conversationId}
        />
      </>
    );
  } catch (error) {
    return <FullPageError error={error as Error} context="evaluation run config" />;
  }
}

export default EvaluationRunConfigPage;
