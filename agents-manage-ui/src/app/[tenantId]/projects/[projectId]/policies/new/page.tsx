import { BodyTemplate } from '@/components/layout/body-template';
import { PolicyForm } from '@/components/policies/form/policy-form';

async function NewPolicyPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/policies/new'>) {
  const { tenantId, projectId } = await params;

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Policies', href: `/${tenantId}/projects/${projectId}/policies` },
        'New Policy',
      ]}
      className="max-w-2xl mx-auto"
    >
      <PolicyForm tenantId={tenantId} projectId={projectId} />
    </BodyTemplate>
  );
}

export default NewPolicyPage;
