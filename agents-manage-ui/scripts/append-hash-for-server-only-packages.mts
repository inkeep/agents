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

async function readPkgJson(pkgPath: string): Promise<{ name: string; version: string } | null> {
  try {
    const raw = await fs.readFile(path.join(pkgPath, 'package.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

fs.readdir(NODE_MODULES_PATH).then(async (dirs) => {
  const newAppPkgJson = structuredClone(appPackageJson);
  for (const dir of dirs) {
    const pkgJson = await readPkgJson(path.join(NODE_MODULES_PATH, dir));
    if (pkgJson) {
      newAppPkgJson.dependencies[dir] = `npm:${pkgJson.name}@${pkgJson.version}`;
      continue;
    }
    const subDirs = await fs.readdir(path.join(NODE_MODULES_PATH, dir));
    for (const subDir of subDirs) {
      const subPkgJson = await readPkgJson(path.join(NODE_MODULES_PATH, dir, subDir));
      if (subPkgJson) {
        newAppPkgJson.dependencies[`${dir}/${subDir}`] =
          `npm:${subPkgJson.name}@${subPkgJson.version}`;
      }
    }
  }
  const content = JSON.stringify(newAppPkgJson, null, 2);
  await fs.writeFile('package.json', `${content}\n`, 'utf8');
});
