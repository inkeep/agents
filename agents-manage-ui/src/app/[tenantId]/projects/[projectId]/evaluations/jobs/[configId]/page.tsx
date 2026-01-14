import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { formatDateTimeTable } from '@/app/utils/format-date';
import FullPageError from '@/components/errors/full-page-error';
import { EvaluationJobResults } from '@/components/evaluation-jobs/evaluation-job-results';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { fetchDatasetRun } from '@/lib/api/dataset-runs';
import type { EvaluationJobFilterCriteria } from '@/lib/api/evaluation-job-configs';
import { fetchEvaluationJobConfig } from '@/lib/api/evaluation-job-configs';
import { fetchEvaluationResultsByJobConfig } from '@/lib/api/evaluation-results';
import { fetchEvaluators } from '@/lib/api/evaluators';

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

    let displayName = jobConfig.id;
    const criteria = jobConfig.jobFilters as EvaluationJobFilterCriteria;

    // Prefer date range if available
    if (criteria?.dateRange?.startDate && criteria?.dateRange?.endDate) {
      const startDate = new Date(criteria.dateRange.startDate).toLocaleDateString();
      const endDate = new Date(criteria.dateRange.endDate).toLocaleDateString();
      displayName = `${startDate} - ${endDate}`;
    } else if (criteria?.datasetRunIds && criteria.datasetRunIds.length > 0) {
      // Fall back to dataset run name
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
          <div className="flex items-center gap-4 mb-6">
            <Link href={`/${tenantId}/projects/${projectId}/evaluations?tab=jobs`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to batch evaluations
              </Button>
            </Link>
          </div>
          <PageHeader
            title={displayName}
            description={`Created ${formatDateTimeTable(jobConfig.createdAt)}`}
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
