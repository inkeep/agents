import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface RecentProject {
  path: string;
  name: string;
  lastOpenedAt: string;
}

export interface ProjectSession {
  [key: string]: unknown;
}

export interface ProjectWindowBounds {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface RecentProjectsState {
  recentProjects: RecentProject[];
  projectSessions: Record<string, ProjectSession>;
  projectWindowBounds: Record<string, ProjectWindowBounds>;
  lastOpenedProject?: string;
}

export interface RecentProjectsOptions {
  stateDir?: string;
}

const STATE_FILE = 'state.json';

function getDefaultStateDir(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'OpenKnowledge');
  }
  if (process.platform === 'win32') {
    return join(homedir(), 'AppData', 'Roaming', 'OpenKnowledge');
  }
  return join(homedir(), '.config', 'OpenKnowledge');
}

function getStatePath(stateDir: string): string {
  return join(stateDir, STATE_FILE);
}

function readStateFile(stateDir: string): RecentProjectsState {
  const statePath = getStatePath(stateDir);
  const empty: RecentProjectsState = {
    recentProjects: [],
    projectSessions: {},
    projectWindowBounds: {},
  };

  if (!existsSync(statePath)) {
    return empty;
  }

  try {
    const content = readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(content);
    return {
      recentProjects: Array.isArray(parsed.recentProjects) ? parsed.recentProjects : [],
      projectSessions:
        parsed.projectSessions && typeof parsed.projectSessions === 'object'
          ? parsed.projectSessions
          : {},
      projectWindowBounds:
        parsed.projectWindowBounds && typeof parsed.projectWindowBounds === 'object'
          ? parsed.projectWindowBounds
          : {},
      lastOpenedProject: parsed.lastOpenedProject,
    };
  } catch {
    return empty;
  }
}

function writeStateFile(stateDir: string, state: RecentProjectsState): void {
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
  const statePath = getStatePath(stateDir);
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
}

export function getRecentProjects(options?: RecentProjectsOptions): RecentProject[] {
  const stateDir = options?.stateDir ?? getDefaultStateDir();
  return readStateFile(stateDir).recentProjects;
}

export function addRecentProject(
  project: { path: string; name: string },
  options?: RecentProjectsOptions
): void {
  const stateDir = options?.stateDir ?? getDefaultStateDir();
  const state = readStateFile(stateDir);

  const existingIndex = state.recentProjects.findIndex((p) => p.path === project.path);
  if (existingIndex !== -1) {
    state.recentProjects.splice(existingIndex, 1);
  }

  state.recentProjects.unshift({
    path: project.path,
    name: project.name,
    lastOpenedAt: new Date().toISOString(),
  });

  state.lastOpenedProject = project.path;
  writeStateFile(stateDir, state);
}

export function removeRecentProject(projectPath: string, options?: RecentProjectsOptions): boolean {
  const stateDir = options?.stateDir ?? getDefaultStateDir();
  const state = readStateFile(stateDir);

  const initialLength = state.recentProjects.length;
  state.recentProjects = state.recentProjects.filter((p) => p.path !== projectPath);

  if (state.recentProjects.length === initialLength) {
    return false;
  }

  delete state.projectSessions[projectPath];
  delete state.projectWindowBounds[projectPath];

  if (state.lastOpenedProject === projectPath) {
    state.lastOpenedProject = state.recentProjects[0]?.path;
  }

  writeStateFile(stateDir, state);
  return true;
}

export interface StaleProjectEntry {
  project: RecentProject;
  reason: 'path_missing';
}

export function validateRecentProjects(options?: RecentProjectsOptions): StaleProjectEntry[] {
  const stateDir = options?.stateDir ?? getDefaultStateDir();
  const state = readStateFile(stateDir);
  const stale: StaleProjectEntry[] = [];

  for (const project of state.recentProjects) {
    if (!existsSync(project.path)) {
      stale.push({ project, reason: 'path_missing' });
    }
  }

  return stale;
}

export function pruneStaleProjects(options?: RecentProjectsOptions): RecentProject[] {
  const stateDir = options?.stateDir ?? getDefaultStateDir();
  const stale = validateRecentProjects(options);

  if (stale.length === 0) {
    return [];
  }

  const stalePaths = new Set(stale.map((s) => s.project.path));
  const state = readStateFile(stateDir);

  state.recentProjects = state.recentProjects.filter((p) => !stalePaths.has(p.path));

  for (const path of stalePaths) {
    delete state.projectSessions[path];
    delete state.projectWindowBounds[path];
  }

  if (state.lastOpenedProject && stalePaths.has(state.lastOpenedProject)) {
    state.lastOpenedProject = state.recentProjects[0]?.path;
  }

  writeStateFile(stateDir, state);
  return stale.map((s) => s.project);
}

export function getRecentProjectsState(options?: RecentProjectsOptions): RecentProjectsState {
  const stateDir = options?.stateDir ?? getDefaultStateDir();
  return readStateFile(stateDir);
}
