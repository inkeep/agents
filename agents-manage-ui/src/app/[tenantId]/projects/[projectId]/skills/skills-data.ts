import { cache } from 'react';
import { buildTree, findNodeByPath } from '@/components/skills/tree-utils';
import { fetchSkill, fetchSkills } from '@/lib/api/skills';
import {
  buildSkillFileRouteAliases,
  flattenSkillFiles,
  resolveSkillFileFromRoute,
} from '@/lib/utils/skill-files';

async function $fetchSkillsPageData(tenantId: string, projectId: string) {
  const { data } = await fetchSkills(tenantId, projectId);
  const skillDetails = await Promise.all(
    data.map((skill) => fetchSkill(tenantId, projectId, skill.id))
  );
  const files = flattenSkillFiles(skillDetails);

  return {
    files,
    treeNodes: buildTree(files),
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
