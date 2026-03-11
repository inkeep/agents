import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface ProjectState {
  lastPulledHash: string;
  lastPulledAt: string;
}

interface StateFile {
  projects: Record<string, ProjectState>;
}

const STATE_DIR = '.inkeep';
const STATE_FILE = 'state.json';

function getStatePath(projectDir: string): string {
  return join(projectDir, STATE_DIR, STATE_FILE);
}

export function readProjectState(projectDir: string, projectId: string): ProjectState | undefined {
  const statePath = getStatePath(projectDir);
  if (!existsSync(statePath)) {
    return undefined;
  }

  try {
    const content = readFileSync(statePath, 'utf-8');
    const state: StateFile = JSON.parse(content);
    return state.projects?.[projectId];
  } catch {
    return undefined;
  }
}

export function writeProjectState(projectDir: string, projectId: string, hash: string): void {
  const statePath = getStatePath(projectDir);
  const stateDir = dirname(statePath);

  let state: StateFile = { projects: {} };

  if (existsSync(statePath)) {
    try {
      const content = readFileSync(statePath, 'utf-8');
      state = JSON.parse(content);
      if (!state.projects) {
        state.projects = {};
      }
    } catch {
      state = { projects: {} };
    }
  }

  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }

  state.projects[projectId] = {
    lastPulledHash: hash,
    lastPulledAt: new Date().toISOString(),
  };

  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}
