import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LOCAL_REMOTE } from '../utils/profiles';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findMonorepoRoot(startDir: string): string {
  let dir = startDir;
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('Could not find monorepo root (pnpm-workspace.yaml)');
    }
    dir = parent;
  }
  return dir;
}

const MONOREPO_ROOT = findMonorepoRoot(__dirname);
const API_PORT = new URL(LOCAL_REMOTE.api).port;
const UI_PORT = new URL(LOCAL_REMOTE.manageUi).port;

describe('Port contract: all sources agree with LOCAL_REMOTE', () => {
  it('LOCAL_REMOTE ports are defined', () => {
    expect(API_PORT).toBe('3002');
    expect(UI_PORT).toBe('3000');
  });

  it('agents-api server.ts uses the correct port', () => {
    const serverPath = join(MONOREPO_ROOT, 'create-agents-template/apps/agents-api/src/server.ts');
    const content = readFileSync(serverPath, 'utf-8');
    const match = content.match(/port:\s*(\d+)/);
    expect(match, 'Expected port: NNNN in server.ts').toBeTruthy();
    expect(match![1]).toBe(API_PORT);
  });

  it('manage-ui package.json has no --port override (Next.js default 3000)', () => {
    const pkgPath = join(MONOREPO_ROOT, 'create-agents-template/apps/manage-ui/package.json');
    const content = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);
    const devScript: string = pkg.scripts?.dev ?? '';
    expect(devScript).not.toContain('--port');
    expect(UI_PORT).toBe('3000');
  });

  it('.env template in create-agents utils.ts uses the correct API port', () => {
    const utilsPath = join(MONOREPO_ROOT, 'packages/create-agents/src/utils.ts');
    const content = readFileSync(utilsPath, 'utf-8');
    const match = content.match(/INKEEP_AGENTS_API_URL="http:\/\/127\.0\.0\.1:(\d+)"/);
    expect(match, 'Expected INKEEP_AGENTS_API_URL in utils.ts').toBeTruthy();
    expect(match![1]).toBe(API_PORT);
  });

  it('setup.js health checks use the correct ports', () => {
    const setupPath = join(MONOREPO_ROOT, 'create-agents-template/scripts/setup.js');
    const content = readFileSync(setupPath, 'utf-8');

    const apiHealthMatches = content.match(/localhost:(\d+)\/health/g);
    expect(apiHealthMatches, 'Expected API health check URL in setup.js').toBeTruthy();
    for (const m of apiHealthMatches!) {
      const port = m.match(/localhost:(\d+)/)?.[1];
      expect(port).toBe(API_PORT);
    }

    const uiHealthMatches = content.match(/localhost:(\d{4})[^/]/g);
    expect(uiHealthMatches, 'Expected UI health check URL in setup.js').toBeTruthy();
    const uiPorts = uiHealthMatches!
      .map((m) => m.match(/localhost:(\d+)/)?.[1])
      .filter((p) => p !== API_PORT);
    expect(uiPorts.length).toBeGreaterThan(0);
    for (const port of uiPorts) {
      expect(port).toBe(UI_PORT);
    }
  });
});
