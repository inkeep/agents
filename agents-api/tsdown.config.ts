import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'tsdown';
import rootConfig from '../tsdown.config.ts';

// Plugin to handle ?raw imports (Vite-style)
function rawPlugin() {
  return {
    name: 'raw-import',
    resolveId(source: string, importer?: string) {
      if (source.endsWith('?raw')) {
        const actualPath = source.slice(0, -4);
        const importerDir = importer ? dirname(importer) : process.cwd();
        const resolved = resolve(importerDir, actualPath);
        return `\0raw:${resolved}`;
      }
      return null;
    },
    load(id: string) {
      if (id.startsWith('\0raw:')) {
        const filePath = id.slice(5);
        const content = readFileSync(filePath, 'utf-8');
        return `export default ${JSON.stringify(content)};`;
      }
      return null;
    },
  };
}

export default defineConfig({
  ...rootConfig,
  entry: ['src/**/*.ts', '!**/__tests__', '!**/*.test.ts'],
  unbundle: true,
  format: ['esm'],
  plugins: [rawPlugin()],
});


