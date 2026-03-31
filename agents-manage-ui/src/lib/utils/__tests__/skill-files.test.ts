import { buildSkillFolderViewHref } from '../skill-files';

describe('buildSkillFolderViewHref', () => {
  it('builds the root folder href for a skill', () => {
    expect(buildSkillFolderViewHref('tenant-1', 'project-1', 'weather-skill')).toBe(
      '/tenant-1/projects/project-1/skills/folders/weather-skill'
    );
  });

  it('builds nested folder hrefs with encoded path segments', () => {
    expect(
      buildSkillFolderViewHref('tenant-1', 'project-1', 'weather-skill', 'templates/day plans')
    ).toBe('/tenant-1/projects/project-1/skills/folders/weather-skill/templates/day%20plans');
  });
});
