/**
 * Custom workflow build script that supports externalizing native modules.
 *
 * The default `workflow build` CLI doesn't expose the externalPackages option,
 * so we use the builder directly to exclude native modules like @napi-rs/keyring.
 */
import { StandaloneBuilder } from '@workflow/builders';

const config = {
  dirs: ['./src/domains/evals/workflow', './src/domains/run/workflow'],
  workingDir: process.cwd(),
  buildTarget: 'standalone' as const,
  stepsBundlePath: './.well-known/workflow/v1/step.cjs',
  workflowsBundlePath: './.well-known/workflow/v1/flow.cjs',
  webhookBundlePath: './.well-known/workflow/v1/webhook.mjs',
  // Externalize native modules that can't be bundled
  externalPackages: ['@napi-rs/keyring'],
};

async function build() {
  console.log('Building workflow bundles...');
  console.log('External packages:', config.externalPackages);

  const builder = new StandaloneBuilder(config);
  await builder.build();

  console.log('Workflow build completed!');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
