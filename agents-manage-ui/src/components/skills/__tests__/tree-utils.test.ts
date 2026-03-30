import type { SkillFileRecord } from '@/lib/utils/skill-files';
import { buildTree, findFirstFile, findNodeByPath, findNodeByRoutePath } from '../tree-utils';

const files: SkillFileRecord[] = [
  {
    skillId: 'weather-skill',
    fileId: 'file-1',
    filePath: 'SKILL.md',
    content: 'root',
    treePath: 'weather-skill/SKILL.md',
    routePath: 'weather-skill',
    isEntryFile: true,
  },
  {
    skillId: 'weather-skill',
    fileId: 'file-2',
    filePath: 'templates/day/plan.md',
    content: 'nested',
    treePath: 'weather-skill/templates/day/plan.md',
    routePath: 'weather-skill/templates/day/plan.md',
    isEntryFile: false,
  },
];

describe('tree-utils', () => {
  it('finds a folder node by its tree path', () => {
    const tree = buildTree(files);

    expect(findNodeByPath(tree, 'weather-skill/templates/day')).toMatchObject({
      kind: 'folder',
      name: 'day',
      path: 'weather-skill/templates/day',
    });
  });

  it('still finds files by route path', () => {
    const tree = buildTree(files);

    expect(findNodeByRoutePath(tree, 'weather-skill/templates/day/plan.md')).toMatchObject({
      kind: 'file',
      name: 'plan.md',
      path: 'weather-skill/templates/day/plan.md',
    });
  });

  it('falls back to the first file in tree order', () => {
    const tree = buildTree(files);

    expect(findFirstFile(tree)?.filePath).toBe('SKILL.md');
  });
});
