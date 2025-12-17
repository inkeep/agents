import { defineConfig } from 'tsup';
import { createRequire } from 'node:module';
import rootConfig from '../tsup.config';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

export default defineConfig({
  ...rootConfig,
  entry: ['src/index.ts', 'src/instrumentation.ts'],
  external: [
    'keytar',
    // Externalize all dependencies EXCEPT workflow packages
    // Workflow packages must be bundled because they use dynamic imports
    ...Object.keys(pkg.dependencies || {}).filter(
      (dep) => !dep.startsWith('workflow') && !dep.startsWith('@workflow/')
    ),
    ...Object.keys(pkg.optionalDependencies || {}),
  ],
  // Force bundle workflow packages
  noExternal: ['workflow', '@workflow/world-postgres', '@workflow/world-vercel', /^@workflow\/.*/],
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.xml': 'text',
    };
    // Also externalize transitive deps that do dynamic requires
    if (!options.external) options.external = [];
    const externalPackages = ['debug', 'supports-color', 'ms'];
    if (Array.isArray(options.external)) {
      options.external.push(...externalPackages);
    }
  },
  async onSuccess() {},
});
