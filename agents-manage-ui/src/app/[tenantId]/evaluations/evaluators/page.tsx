import { FlaskConical } from 'lucide-react';
import FullPageError from '@/components/errors/full-page-error';
import { EvaluatorsList } from '@/components/evaluations/evaluators-list';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { fetchEvaluators } from '@/lib/api/evaluations-client';

export const dynamic = 'force-dynamic';

async function EvaluatorsPage({ params }: PageProps<'/[tenantId]/evaluations/evaluators'>) {
  const { tenantId } = await params;

  let evaluators: Awaited<ReturnType<typeof fetchEvaluators>>;
  try {
    evaluators = await fetchEvaluators(tenantId);
  } catch (error) {
    return <FullPageError error={error as Error} context="evaluators" />;
  }

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Evaluations', href: `/${tenantId}/evaluations` },
        { label: 'Evaluators', href: `/${tenantId}/evaluations/evaluators` },
      ]}
    >
      <MainContent className="min-h-full">
        {evaluators.data.length > 0 ? (
          <>
            <PageHeader
              title="Evaluators"
              description="Evaluators assess agent performance using custom prompts and schemas"
            />
            <EvaluatorsList tenantId={tenantId} evaluators={evaluators.data} />
          </>
        ) : (
          <EmptyState
            title="No evaluators yet"
            description="Create evaluators to assess agent performance using custom prompts and schemas"
            link={`/${tenantId}/evaluations/evaluators/new`}
            linkText="Create evaluator"
            icon={<FlaskConical className="h-12 w-12" />}
          />
        )}
      </MainContent>
    </BodyTemplate>
  );
}

export default EvaluatorsPage;

