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

fs.readdir(NODE_MODULES_PATH).then(async (dirs) => {
  const newAppPkgJson = structuredClone(appPackageJson);
  for (const dir of dirs) {
    const pkgJsonPath = path.join('..', NODE_MODULES_PATH, dir, 'package.json');
    // @ts-expect-error -- ignore type error
    const { default: pkgJson } = await import(pkgJsonPath, { with: { type: 'json' } });
    // Add dependency with hash
    newAppPkgJson.dependencies[dir] = `npm:${pkgJson.name}@${pkgJson.version}`;
  }
  const content = JSON.stringify(newAppPkgJson, null, 2);
  await fs.writeFile('package.json', `${content}\n`, 'utf8');
});
