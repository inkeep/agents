import { ClipboardList } from 'lucide-react';
import FullPageError from '@/components/errors/full-page-error';
import { TestSuitesList } from '@/components/evaluations/test-suites-list';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { fetchEvalTestSuiteConfigs } from '@/lib/api/evaluations-client';

export const dynamic = 'force-dynamic';

async function TestSuitesPage({ params }: PageProps<'/[tenantId]/evaluations/test-suites'>) {
  const { tenantId } = await params;

  let testSuites: Awaited<ReturnType<typeof fetchEvalTestSuiteConfigs>>;
  try {
    testSuites = await fetchEvalTestSuiteConfigs(tenantId);
  } catch (error) {
    return <FullPageError error={error as Error} context="test suites" />;
  }

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Evaluations', href: `/${tenantId}/evaluations` },
        { label: 'Test Suites', href: `/${tenantId}/evaluations/test-suites` },
      ]}
    >
      <MainContent className="min-h-full">
        {testSuites.data.length > 0 ? (
          <>
            <PageHeader
              title="Test Suites"
              description="Configure automated test suite runs and schedules for continuous evaluation"
            />
            <TestSuitesList tenantId={tenantId} testSuites={testSuites.data} />
          </>
        ) : (
          <EmptyState
            title="No test suites yet"
            description="Create test suite configurations to automate evaluation runs"
            link={`/${tenantId}/evaluations/test-suites/new`}
            linkText="Create test suite"
            icon={<ClipboardList className="h-12 w-12" />}
          />
        )}
      </MainContent>
    </BodyTemplate>
  );
}

export default TestSuitesPage;

