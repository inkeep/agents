/**
 * Turbopack appends hash for server-only packages listed in `serverExternalPackages`
 *
 * When using `@inkeep/agents-manage-ui` as dependency we are getting following error:
 * Failed to load external module pino-51ec28aa490c8dec: Error: Cannot find module 'pino-51ec28aa490c8dec'
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
// @ts-expect-error -- ignore type error
import appPackageJson from '../package.json' with { type: 'json' };

const NODE_MODULES_PATH = '.next/node_modules';

async function collectHashedPackages(): Promise<{ dir: string; pkgJsonPath: string }[]> {
  const entries: { dir: string; pkgJsonPath: string }[] = [];
  const dirs = await fs.readdir(NODE_MODULES_PATH);

  for (const dir of dirs) {
    if (dir.startsWith('@')) {
      const scopePath = path.join(NODE_MODULES_PATH, dir);
      const scopedDirs = await fs.readdir(scopePath);
      for (const scopedDir of scopedDirs) {
        entries.push({
          dir: `${dir}/${scopedDir}`,
          pkgJsonPath: path.join('..', NODE_MODULES_PATH, dir, scopedDir, 'package.json'),
        });
      }
    } else {
      entries.push({
        dir,
        pkgJsonPath: path.join('..', NODE_MODULES_PATH, dir, 'package.json'),
      });
    }
  }

  return entries;
}

collectHashedPackages().then(async (entries) => {
  const newAppPkgJson = structuredClone(appPackageJson);
  for (const { dir, pkgJsonPath } of entries) {
    // @ts-expect-error -- ignore type error
    const { default: pkgJson } = await import(pkgJsonPath, { with: { type: 'json' } });
    newAppPkgJson.dependencies[dir] = `npm:${pkgJson.name}@${pkgJson.version}`;
  }
  const content = JSON.stringify(newAppPkgJson, null, 2);
  await fs.writeFile('package.json', `${content}\n`, 'utf8');
});
