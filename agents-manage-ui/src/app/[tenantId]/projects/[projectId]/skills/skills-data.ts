import { cache } from 'react';
import { buildTree } from '@/components/skills/tree-utils';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { fetchSkill, fetchSkills } from '@/lib/api/skills';
import {
  buildSkillFileRouteAliases,
  flattenSkillFiles,
  resolveSkillFileFromRoute,
} from '@/lib/utils/skill-files';

async function $fetchSkillsPageData(tenantId: string, projectId: string) {
  const [permissions, skillsResponse] = await Promise.all([
    fetchProjectPermissions(tenantId, projectId),
    fetchSkills(tenantId, projectId),
  ]);
  const skillDetails = await Promise.all(
    skillsResponse.data.map((skill) => fetchSkill(tenantId, projectId, skill.id))
  );
  const files = flattenSkillFiles(skillDetails);
  const treeNodes = buildTree(files);

  return {
    permissions,
    files,
    treeNodes,
    fileRouteAliases: buildSkillFileRouteAliases(files),
  };
}

export const fetchSkillsPageData = cache($fetchSkillsPageData);

export async function resolveSkillFilePageData(
  tenantId: string,
  projectId: string,
  fileSlug?: readonly string[]
) {
  const data = await fetchSkillsPageData(tenantId, projectId);
  const selectedFile = resolveSkillFileFromRoute(data.files, fileSlug?.join('/'));

  return {
    ...data,
    selectedFile,
  };
}
