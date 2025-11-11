import type { EvalTestSuiteConfig } from '@/lib/api/evaluations-client';
import { NewTestSuiteItem } from './new-test-suite-item';
import { TestSuiteItem } from './test-suite-item';

interface TestSuitesListProps {
  tenantId: string;
  testSuites: EvalTestSuiteConfig[];
}

export function TestSuitesList({ tenantId, testSuites }: TestSuitesListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      <NewTestSuiteItem tenantId={tenantId} />
      {testSuites?.map((suite: EvalTestSuiteConfig) => (
        <TestSuiteItem key={suite.id} {...suite} tenantId={tenantId} />
      ))}
    </div>
  );
}
