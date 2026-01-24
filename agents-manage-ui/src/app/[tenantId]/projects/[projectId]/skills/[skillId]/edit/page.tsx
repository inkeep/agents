import FullPageError from '@/components/errors/full-page-error';
import { SkillForm } from '@/components/skills/form/skill-form';
import { fetchSkill } from '@/lib/api/skills';
import { getErrorCode } from '@/lib/utils/error-serialization';

async function SkillDetailPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/skills/[skillId]/edit'>) {
  const { tenantId, projectId, skillId } = await params;
  try {
    const data = await fetchSkill(tenantId, projectId, skillId);
    return <SkillForm initialData={data} />;
  } catch (error) {
    <FullPageError
      errorCode={getErrorCode(error)}
      context="skill"
      link={`/${tenantId}/projects/${projectId}/skills`}
      linkText="Back to skills"
    />;
  }
}

export default SkillDetailPage;
