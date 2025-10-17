import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import chalk from 'chalk';
import fs from 'fs-extra';
import * as p from '@clack/prompts';

const require = createRequire(import.meta.url);

export interface DevOptions {
  port: number;
  host: string;
  build: boolean;
  outputDir: string;
  path: boolean;
  export: boolean;
}

function resolveWebRuntime(isRoot = false) {
  try {
    // First try to resolve as a package (if installed)
    const pkg = require.resolve('@inkeep/agents-manage-ui/package.json');
    const root = dirname(pkg);

    if (isRoot) {
      return root;
    }

    return join(root, '.next/standalone/agents-manage-ui');
  } catch (err) {
    throw new Error(
      `Could not find @inkeep/agents-manage-ui package. Please install it first:\n\n` +
        `  npm install @inkeep/agents-manage-ui\n` +
        `  # or\n` +
        `  pnpm add @inkeep/agents-manage-ui\n\n` +
        `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

function startWebApp({ port, host }: Pick<DevOptions, 'port' | 'host'>) {
  console.log('');
  const s = p.spinner();
  s.start('Starting dashboard server...');

  try {
    const rt = resolveWebRuntime();
    const entry = join(rt, 'server.js');
    // Check if the standalone build exists
    if (!existsSync(entry)) {
      s.stop('Dashboard server not found');
      console.error(chalk.red('The dashboard server has not been built yet.'));
      process.exit(1);
    }

    s.stop('Starting dashboard server...');
    console.log('');

    const child = fork(entry, [], {
      cwd: rt,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        HOSTNAME: host,
      },
      stdio: 'inherit',
    });

    console.log(chalk.green(`🚀 Dashboard server started at http://${host}:${port}`));
    console.log('');
    console.log(chalk.gray('Press Ctrl+C to stop the server'));
    console.log('');

    // Handle process termination
    process.on('SIGINT', () => {
      console.log('');
      console.log(chalk.yellow('\n🛑 Stopping dashboard server...'));
      child.kill('SIGINT');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      child.kill('SIGTERM');
      process.exit(0);
    });

    return child;
  } catch (error) {
    s.stop('Failed to start dashboard server');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

async function buildNextApp({ outputDir }: { outputDir: string }) {
  console.log('');
  const s = p.spinner();
  s.start('Building Standalone build...');

  try {
    const pkg = require.resolve('@inkeep/agents-manage-ui/package.json');
    const root = dirname(pkg);
    const standalonePath = join(root, '.next/standalone/agents-manage-ui');

    // Check if the standalone build exists
    if (!existsSync(standalonePath)) {
      s.stop('Standalone build not found');
      console.error(chalk.red('The standalone build has not been created yet.'));
      console.error(chalk.yellow('Please build the dashboard first:'));
      console.error(chalk.gray('  cd node_modules/@inkeep/agents-manage-ui'));
      console.error(chalk.gray('  npm run build'));
      process.exit(1);
    }

    // 2. Remove existing output directory if it exists
    if (existsSync(outputDir)) {
      await fs.remove(outputDir);
    }

    // 2. Remove existing output directory if it exists
    if (existsSync(outputDir)) {
      await fs.remove(outputDir);
    }

    // 3. Create output directory
    await fs.ensureDir(outputDir);

    // 4. Copy the entire standalone package
    await fs.copy(standalonePath, outputDir);

    // 5. Create a simple package.json with the correct start script
    const packageJson = {
      name: 'inkeep-dashboard',
      version: '1.0.0',
      scripts: {
        start: 'node server.js',
      },
      dependencies: {},
    };

    await fs.writeJson(join(outputDir, 'package.json'), packageJson, { spaces: 2 });

    // 6. Create setup instructions
    const instructions = `
## Environment Variables

Make sure to set these in your Vercel project settings:
- INKEEP_API_URL
- INKEEP_TENANT_ID
- Any other variables from your .env file
`;

    await fs.writeFile(join(outputDir, 'README.md'), instructions);

    s.stop(`Build created at ${outputDir}/`);

    console.log('');
    console.log(chalk.green('✅ Build completed successfully!'));
    console.log('');
    console.log(chalk.blue('📁 To run your dashboard:'));
    console.log(chalk.gray('  cd'), chalk.white(outputDir));
    console.log(chalk.gray('  npm start'));
    console.log('');
    console.log(chalk.blue('🌐 Or with pnpm:'));
    console.log(chalk.gray('  cd'), chalk.white(outputDir));
    console.log(chalk.gray('  pnpm start'));
    console.log('');
    console.log(chalk.yellow('📖 See README.md for deployment instructions'));
    console.log('');
  } catch (error) {
    s.stop('Failed to build dashboard');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

async function exportNextApp({ outputDir }: { outputDir: string }) {
  console.log('');
  const s = p.spinner();
  s.start('Exporting Next.js project...');

  try {
    const pkg = require.resolve('@inkeep/agents-manage-ui/package.json');
    const root = dirname(pkg);

    // Check if the source project exists
    if (!existsSync(root)) {
      s.stop('Source project not found');
      console.error(chalk.red('The @inkeep/agents-manage-ui package was not found.'));
      console.error(chalk.yellow('Please install it first:'));
      console.error(chalk.gray('  npm install @inkeep/agents-manage-ui'));
      console.error(chalk.gray('  # or'));
      console.error(chalk.gray('  pnpm add @inkeep/agents-manage-ui'));
      process.exit(1);
    }

    // Remove existing output directory if it exists
    if (existsSync(outputDir)) {
      await fs.remove(outputDir);
    }

    // Create output directory
    await fs.ensureDir(outputDir);

    // Copy all files except .next folder
    const items = await fs.readdir(root);
    for (const item of items) {
      const srcPath = join(root, item);
      const destPath = join(outputDir, item);

      // Skip .next folder and other build artifacts
      if (item === '.next' || item === 'node_modules' || item === 'dist') {
        continue;
      }

      const stat = await fs.stat(srcPath);
      if (stat.isDirectory()) {
        await fs.copy(srcPath, destPath);
      } else {
        await fs.copy(srcPath, destPath);
      }
    }

    // Create a README for the exported project
    const readme = `# Inkeep Dashboard

This is an exported copy of the Inkeep Dashboard UI.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   # or
   pnpm install
   \`\`\`

2. Start the development server:
   \`\`\`bash
   npm run dev
   # or
   pnpm dev
   \`\`\`

3. Build for production:
   \`\`\`bash
   npm run build
   # or
   pnpm build
   \`\`\`

## Environment Variables

Make sure to set these environment variables:
- \`INKEEP_API_URL\` - Your Inkeep API URL
- \`INKEEP_TENANT_ID\` - Your tenant ID
- Any other variables from your .env file

## Deployment

This project can be deployed to any platform that supports Next.js:
- Vercel
- Netlify
- AWS Amplify
- Railway
- And more...
`;

    await fs.writeFile(join(outputDir, 'README.md'), readme);

    s.stop(`Project exported to ${outputDir}/`);

    console.log('');
    console.log(chalk.green('✅ Export completed successfully!'));
    console.log('');
    console.log(chalk.blue('📁 To get started:'));
    console.log(chalk.gray('  cd'), chalk.white(outputDir));
    console.log(chalk.gray('  npm install'));
    console.log(chalk.gray('  npm run dev'));
    console.log('');
    console.log(chalk.yellow('📖 See README.md for more instructions'));
    console.log('');
  } catch (error) {
    s.stop('Failed to export project');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

export async function devCommand(options: DevOptions) {
  const { port, host, build, outputDir, path, export: exportFlag } = options;

  if (path) {
    const rt = resolveWebRuntime(true);
    // THIS IS INTENTIONAL, WE NEED TO READ PATH FROM STDOUT
    console.log(rt);
    return;
  }

  if (exportFlag) {
    await exportNextApp({ outputDir });
    return;
  }

  if (build) {
    await buildNextApp({ outputDir });
    return;
  }

  await startWebApp({ port, host });
}
