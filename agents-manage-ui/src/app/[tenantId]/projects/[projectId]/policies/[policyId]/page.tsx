import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { PolicyForm } from '@/components/policies/form/policy-form';
import { fetchPolicyAction } from '@/lib/actions/policies';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

async function PolicyDetailPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/policies/[policyId]'>) {
  const { tenantId, projectId, policyId } = await params;

  const policyResult = await fetchPolicyAction(tenantId, projectId, policyId);

  if (!policyResult.success || !policyResult.data) {
    return (
      <FullPageError
        errorCode={getErrorCode(policyResult.error)}
        context="policy"
        link={`/${tenantId}/projects/${projectId}/policies`}
        linkText="Back to policies"
      />
    );
  }

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Policies', href: `/${tenantId}/projects/${projectId}/policies` },
        policyResult.data.name,
      ]}
      className="max-w-2xl mx-auto"
    >
      <PolicyForm initialData={policyResult.data} />
    </BodyTemplate>
  );
}

export default PolicyDetailPage;
