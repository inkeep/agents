import { Plus } from 'lucide-react';
import Link from 'next/link';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { PolicyList } from '@/components/policies/policy-list';
import { Button } from '@/components/ui/button';
import { policyDescription } from '@/constants/page-descriptions';
import { fetchPolicies } from '@/lib/api/policies';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

async function PoliciesPage({ params }: PageProps<'/[tenantId]/projects/[projectId]/policies'>) {
  const { tenantId, projectId } = await params;

  try {
    const policies = await fetchPolicies(tenantId, projectId);
    const content = policies.data.length ? (
      <>
        <PageHeader
          title="Policies"
          description={policyDescription}
          action={
            <Button asChild>
              <Link
                href={`/${tenantId}/projects/${projectId}/policies/new`}
                className="flex items-center gap-2"
              >
                <Plus className="size-4" />
                New policy
              </Link>
            </Button>
          }
        />
        <PolicyList tenantId={tenantId} projectId={projectId} policies={policies.data} />
      </>
    ) : (
      <EmptyState
        title="No policies yet."
        description={policyDescription}
        link={`/${tenantId}/projects/${projectId}/policies/new`}
        linkText="Create policy"
      />
    );

    return <BodyTemplate breadcrumbs={['Policies']}>{content}</BodyTemplate>;
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="policies" />;
  }
}

export default PoliciesPage;
