import { defineConfig } from 'tsup';
import rootConfig from '../tsup.config';

export default defineConfig({
  ...rootConfig,
  entry: ['src/index.ts', 'src/factory.ts'],
  format: ['esm'],
  external: ['keytar'],
  noExternal: ['@inkeep/agents-manage-mcp'],
  async onSuccess() {},
});
