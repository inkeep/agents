/**
 * Custom workflow build script that supports externalizing native modules.
 *
 * The default `workflow build` CLI doesn't expose the externalPackages option,
 * so we use the builder directly to exclude native modules like @napi-rs/keyring.
 *
 * This script also pre-processes `?raw` imports (Vite-specific syntax) by inlining
 * the file content as string literals, since the WDK esbuild bundler doesn't support
 * Vite query suffixes. Files are restored to their original state after the build.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { StandaloneBuilder } from '@workflow/builders';

async function findFilesWithRawImports(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      results.push(...(await findFilesWithRawImports(fullPath)));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      const content = await readFile(fullPath, 'utf-8');
      if (content.includes('?raw')) results.push(fullPath);
    }
  }
  return results;
}

async function inlineRawImports(content: string, fileDir: string): Promise<string> {
  let patched = content;
  const rawImportRegex = /^import\s+(\w+)\s+from\s+'([^']+\?raw)';$/gm;
  for (const match of content.matchAll(rawImportRegex)) {
    const [fullMatch, varName, rawPath] = match;
    const xmlFilePath = resolve(fileDir, rawPath.replace(/\?raw$/, ''));
    const xmlContent = await readFile(xmlFilePath, 'utf-8');
    patched = patched.replace(fullMatch, `const ${varName} = ${JSON.stringify(xmlContent)};`);
  }
  return patched;
}

async function withInlinedRawImports(fn: () => Promise<void>): Promise<void> {
  const srcDir = resolve(process.cwd(), 'src');
  const filePaths = await findFilesWithRawImports(srcDir);

  const originals = new Map<string, string>();
  for (const filePath of filePaths) {
    const original = await readFile(filePath, 'utf-8');
    originals.set(filePath, original);
    const patched = await inlineRawImports(original, dirname(filePath));
    await writeFile(filePath, patched, 'utf-8');
  }

  try {
    await fn();
  } finally {
    for (const [filePath, original] of originals) {
      await writeFile(filePath, original, 'utf-8');
    }
  }
}

const config = {
  dirs: ['./src/domains/evals/workflow', './src/domains/run/workflow'],
  workingDir: process.cwd(),
  buildTarget: 'standalone' as const,
  stepsBundlePath: './.well-known/workflow/v1/step.cjs',
  workflowsBundlePath: './.well-known/workflow/v1/flow.cjs',
  webhookBundlePath: './.well-known/workflow/v1/webhook.mjs',
  // Externalize native modules that can't be bundled
  externalPackages: ['@napi-rs/keyring', 'cron-parser'],
};

async function build() {
  console.log('Building workflow bundles...');
  console.log('External packages:', config.externalPackages);

  await withInlinedRawImports(async () => {
    const builder = new StandaloneBuilder(config);
    await builder.build();
  });

  console.log('Workflow build completed!');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
