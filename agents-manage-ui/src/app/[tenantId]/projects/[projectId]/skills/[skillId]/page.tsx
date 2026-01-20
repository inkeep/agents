import FullPageError from '@/components/errors/full-page-error';
import { SkillForm } from '@/components/skills/form/skill-form';
import { fetchSkillAction } from '@/lib/actions/skills';
import { getErrorCode } from '@/lib/utils/error-serialization';

async function SkillDetailPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/skills/[skillId]'>) {
  const { tenantId, projectId, skillId } = await params;

  const skillResult = await fetchSkillAction(tenantId, projectId, skillId);

  if (!skillResult.success || !skillResult.data) {
    return (
      <FullPageError
        errorCode={getErrorCode(skillResult.error)}
        context="skill"
        link={`/${tenantId}/projects/${projectId}/skills`}
        linkText="Back to skills"
      />
    );
  }

  return <SkillForm initialData={skillResult.data} className="max-w-2xl mx-auto" />;
}

export default SkillDetailPage;
