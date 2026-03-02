import { fetchProjectPermissions } from '@/lib/api/projects';
import { SkillEditModal } from './skill-edit-modal';

export default async function Page(
  _props: PageProps<'/[tenantId]/projects/[projectId]/skills/[skillId]/edit'>
) {
  const { tenantId, projectId } = await _props.params;
  const permissions = await fetchProjectPermissions(tenantId, projectId);

  return <SkillEditModal readOnly={!permissions.canEdit} />;
}
