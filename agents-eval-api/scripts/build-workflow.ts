/**
 * Custom workflow build script that supports externalizing native modules.
 * 
 * The default `workflow build` CLI doesn't expose the externalPackages option,
 * so we use the builder directly to exclude native modules like keytar.
 */
import { StandaloneBuilder } from '@workflow/builders';

const config = {
  dirs: ['./src/workflow'],
  workingDir: process.cwd(),
  buildTarget: 'standalone' as const,
  // Use .cjs extension for CJS bundles since package.json has "type": "module"
  // Webhook is ESM (builder doesn't convert it) so use .mjs
  stepsBundlePath: './.well-known/workflow/v1/step.cjs',
  workflowsBundlePath: './.well-known/workflow/v1/flow.cjs',
  webhookBundlePath: './.well-known/workflow/v1/webhook.mjs',
  // Externalize native modules that can't be bundled
  externalPackages: [
    'keytar',
  ],
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

