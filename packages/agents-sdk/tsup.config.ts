import { defineConfig } from 'tsup';
import rootConfig from '../../tsup.config';

export default defineConfig({
  ...rootConfig,
  // Mark TypeScript and Node.js built-ins as external to prevent bundling
  external: [
    'typescript',
    // Node.js built-ins
    /^node:/,
    'fs',
    'path',
    'module',
    'url',
    'os',
    'crypto',
  ],
  async onSuccess() {},
});
