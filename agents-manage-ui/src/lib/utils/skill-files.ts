import type { SkillDetail } from '@/lib/types/skills';

export const SKILL_ENTRY_FILE_PATH = 'SKILL.md';

export function isSkillEntryFile(filePath: string): boolean {
  return filePath === SKILL_ENTRY_FILE_PATH;
}

export function getSkillFileRemovalLabel(filePath: string): 'Delete skill' | 'Remove file' {
  return isSkillEntryFile(filePath) ? 'Delete skill' : 'Remove file';
}

export interface SkillFileRecord {
  skillId: string;
  skillName: string;
  fileId: string;
  filePath: string;
  content: string;
  treePath: string;
  routePath: string;
  isEntryFile: boolean;
}

export function getSkillFileTreePath(skillId: string, filePath: string): string {
  return `${skillId}/${filePath}`;
}

export function getSkillFileRoutePath(skillId: string, filePath: string): string {
  return isSkillEntryFile(filePath) ? skillId : getSkillFileTreePath(skillId, filePath);
}

export function encodeSkillFileRoutePath(routePath: string): string {
  return routePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function buildSkillFileViewHref(
  tenantId: string,
  projectId: string,
  skillId: string,
  filePath: string
): string {
  return `/${tenantId}/projects/${projectId}/skills/files/${encodeSkillFileRoutePath(
    getSkillFileRoutePath(skillId, filePath)
  )}`;
}

export function getSkillFileEditorUri(filePath: string): `${string}.${'template' | 'md'}` {
  const stem = filePath.replace(/[^a-zA-Z0-9.-]+/g, '-').replace(/\.[^.]+$/, '') || 'skill-file';
  return filePath.endsWith('.md') ? `${stem}.md` : `${stem}.template`;
}

export function flattenSkillFiles(skills: SkillDetail[]): SkillFileRecord[] {
  return skills.flatMap((skill) =>
    (skill.files ?? []).map((file) => ({
      skillId: skill.id,
      skillName: skill.name,
      fileId: file.id,
      filePath: file.filePath,
      content: file.content,
      treePath: getSkillFileTreePath(skill.id, file.filePath),
      routePath: getSkillFileRoutePath(skill.id, file.filePath),
      isEntryFile: isSkillEntryFile(file.filePath),
    }))
  );
}

export function buildSkillFileRouteAliases(
  files: readonly SkillFileRecord[]
): Record<string, string> {
  return files.reduce<Record<string, string>>((acc, file) => {
    acc[file.fileId] = file.routePath;
    return acc;
  }, {});
}

export function resolveSkillFileFromRoute(
  files: readonly SkillFileRecord[],
  routeToken?: string
): SkillFileRecord | null {
  if (!routeToken) {
    return null;
  }

  const skillEntry = files.find(
    (file) => file.skillId === routeToken && isSkillEntryFile(file.filePath)
  );
  if (skillEntry) {
    return skillEntry;
  }

  const fileById = files.find((file) => file.fileId === routeToken);
  if (fileById) {
    return fileById;
  }

  return (
    files.find((file) => file.routePath === routeToken) ??
    files.find((file) => file.treePath === routeToken) ??
    null
  );
}
