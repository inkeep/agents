import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { defineConfig, type InlineConfig } from 'tsdown';
import rootConfig from '../tsdown.config.ts';

const rawQuery = '?raw';

const rawQueryPlugin: InlineConfig['plugins'] = {
  name: 'raw-query',
  resolveId(source, importer) {
    if (!source.endsWith(rawQuery)) return;
    const basePath = source.slice(0, -rawQuery.length);
    const resolved = importer
      ? path.resolve(path.dirname(importer), basePath)
      : path.resolve(basePath);
    return resolved + rawQuery;
  },
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
  external: ['@sentry/node', '@napi-rs/keyring'],
  plugins: [rawQueryPlugin],
});
