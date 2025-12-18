import { defineConfig } from 'tsdown';
import rootConfig from '../tsdown.config.ts';

export default defineConfig({
  ...rootConfig,
  entry: ['src/index.ts', 'src/factory.ts'],
  format: ['esm'],
  external: ['keytar'],
  noExternal: ['@inkeep/agents-manage-mcp'],
});
