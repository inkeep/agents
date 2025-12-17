import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'rolldown';
import { defineConfig } from 'tsdown';
import rootConfig from '../tsdown.config.ts';

// Plugin to handle ?raw imports (Vite-style)
function rawPlugin(): Plugin {
  return {
    name: 'raw-import',
    resolveId(source, importer) {
      if (source.endsWith('?raw')) {
        const actualPath = source.slice(0, -4); // Remove ?raw
        const importerDir = importer ? dirname(importer) : process.cwd();
        const resolved = resolve(importerDir, actualPath);
        return `\0raw:${resolved}`;
      }
      return null;
    },
    load(id) {
      if (id.startsWith('\0raw:')) {
        const filePath = id.slice(5); // Remove \0raw:
        const content = readFileSync(filePath, 'utf-8');
        return `export default ${JSON.stringify(content)};`;
      }
      return null;
    },
  };
}

export default defineConfig({
  ...rootConfig,
  entry: ['src/index.ts', 'src/instrumentation.ts'],
  external: ['keytar'],
  plugins: [rawPlugin()],
});
