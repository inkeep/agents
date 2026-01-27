import * as fs from 'node:fs/promises';
import { defineConfig, type InlineConfig } from 'tsdown';
import rootConfig from '../tsdown.config.ts';

const rawQuery = '?raw';

const rawQueryPlugin: InlineConfig['plugins'] = {
  name: 'raw-query',
  async load(id) {
    if (id.endsWith(rawQuery)) {
      const filePath = id.slice(0, -rawQuery.length);
      const contents = await fs.readFile(filePath, 'utf8');
      return `export default ${JSON.stringify(contents)};`;
    }
  },
};

export default defineConfig({
  ...rootConfig,
  entry: [
    'src/**/*.ts',
    // tsdown’s entry glob uses tinyglobby with dot: false, so *.ts won’t match dot‑dirs
    'src/**/.*/**/*.ts',
    '!**/__tests__',
    '!**/*.test.ts',
  ],
  unbundle: true,
  format: 'esm',
  plugins: [rawQueryPlugin],
});
