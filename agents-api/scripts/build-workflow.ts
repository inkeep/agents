/**
 * Custom workflow build script that supports externalizing native modules.
 *
 * The default `workflow build` CLI doesn't expose the externalPackages option,
 * so we use the builder directly to exclude native modules like @napi-rs/keyring.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { StandaloneBuilder } from '@workflow/builders';

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

/**
 * Patches CJS bundles to fix import.meta.url references from rolldown-built packages.
 *
 * When esbuild bundles ESM code (built by rolldown/tsdown) into CJS format,
 * `import.meta` becomes `{}`, making `import.meta.url` undefined. This breaks
 * `createRequire(import.meta.url)` at runtime. This post-process step replaces
 * the empty `import_meta` with one that has a valid `url` derived from `__filename`.
 */
function patchImportMetaInCjs(filePath: string) {
  const content = readFileSync(filePath, 'utf8');
  const patched = content.replace(
    /import_meta(\d*)\s*=\s*\{\s*\}/g,
    (_, suffix) => `import_meta${suffix} = { url: require("url").pathToFileURL(__filename).href }`
  );
  if (patched !== content) {
    writeFileSync(filePath, patched);
    console.log(`Patched import.meta references in ${filePath}`);
  }
}

async function build() {
  console.log('Building workflow bundles...');
  console.log('External packages:', config.externalPackages);

  const builder = new StandaloneBuilder(config);
  await builder.build();

  patchImportMetaInCjs(config.stepsBundlePath);
  patchImportMetaInCjs(config.workflowsBundlePath);

  console.log('Workflow build completed!');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
