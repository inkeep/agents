import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

interface ProjectState {
  lastPulledHash: string;
  lastPulledAt: string;
}

interface StateFile {
  projects: Record<string, ProjectState>;
}

const STATE_FILE = 'state.json';

function getDefaultStateDir(): string {
  return join(homedir(), '.inkeep');
}

function getStatePath(stateDir: string): string {
  return join(stateDir, STATE_FILE);
}

export interface StateOptions {
  stateDir?: string;
}

export function readProjectState(
  projectId: string,
  options?: StateOptions
): ProjectState | undefined {
  const stateDir = options?.stateDir ?? getDefaultStateDir();
  const statePath = getStatePath(stateDir);
  if (!existsSync(statePath)) {
    return undefined;
  }

  try {
    const content = readFileSync(statePath, 'utf-8');
    const state: StateFile = JSON.parse(content);
    return state.projects?.[projectId];
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return undefined;
    }
    console.warn(`Warning: Could not read state file: ${error.message}`);
    return undefined;
  }
}

export function writeProjectState(projectId: string, hash: string, options?: StateOptions): void {
  const stateDir = options?.stateDir ?? getDefaultStateDir();
  const statePath = getStatePath(stateDir);

  let state: StateFile = { projects: {} };

  if (existsSync(statePath)) {
    try {
      const content = readFileSync(statePath, 'utf-8');
      state = JSON.parse(content);
      state.projects ||= {};
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
