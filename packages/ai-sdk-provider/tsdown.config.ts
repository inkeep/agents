import { defineConfig } from 'tsdown';
import rootConfig from '../../tsdown.config.ts';

export default defineConfig({
  ...rootConfig,
  entry: ['src/index.ts'],
});
