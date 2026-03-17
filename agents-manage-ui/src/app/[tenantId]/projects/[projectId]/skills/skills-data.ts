import { cache } from 'react';
import { buildTree, getSkillFiles } from '@/components/skills/tree-utils';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { fetchSkill, fetchSkills } from '@/lib/api/skills';

async function $fetchSkillsPageData(tenantId: string, projectId: string) {
  const [permissions, skillsResponse] = await Promise.all([
    fetchProjectPermissions(tenantId, projectId),
    fetchSkills(tenantId, projectId),
  ]);
  const skillDetails = await Promise.all(
    skillsResponse.data.map((skill) => fetchSkill(tenantId, projectId, skill.id))
  );
  const skillFiles = getSkillFiles(skillDetails);
  const treeNodes = buildTree(skillFiles);

  return {
    permissions,
    treeNodes,
    defaultSelectedPath: skillFiles[0]?.filePath ?? '',
  };
}

export const fetchSkillsPageData = cache($fetchSkillsPageData);
