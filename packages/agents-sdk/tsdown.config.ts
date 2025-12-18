import { defineConfig } from 'tsdown';
import rootConfig from '../../tsdown.config.ts';

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
});
