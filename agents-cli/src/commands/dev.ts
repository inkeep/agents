import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import chalk from 'chalk';
import fs from 'fs-extra';
import ora from 'ora';

const require = createRequire(import.meta.url);

export interface DevOptions {
  port?: number;
  host?: string;
  build?: boolean;
  outputDir?: string;
  vercel?: boolean;
  config?: string;
}

function resolveWebRuntime() {
  try {
    // First try to resolve as a package (if installed)
    const pkg = require.resolve('@inkeep/agents-manage-ui/package.json');
    const root = dirname(pkg);

    return join(root, '.next/standalone/agents-manage-ui');
  } catch (err) {
    throw new Error(`Could not find @inkeep/agents-manage-ui package. ${err}`);
  }
}

function startWebApp({ port = 3000, host = 'localhost' }: DevOptions) {
  console.log('');
  const spinner = ora('Starting dashboard server...').start();

  try {
    const rt = resolveWebRuntime();
    const entry = join(rt, 'server.js');
    // Check if the standalone build exists
    if (!existsSync(entry)) {
      spinner.fail('Dashboard server not found');
      console.error(chalk.red('The dashboard server has not been built yet.'));
      process.exit(1);
    }

    spinner.succeed('Starting dashboard server...');
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
    spinner.fail('Failed to start dashboard server');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

async function copyVercelOutput() {
  const spinner = ora('Copying Vercel output...').start();

  try {
    // 1. Find the package's .vercel/output folder
    const pkg = require.resolve('@inkeep/agents-manage-ui/package.json');
    const root = dirname(pkg);
    const sourceOutputPath = join(root, '.vercel', 'output');

    // Check if the vercel output exists
    if (!existsSync(sourceOutputPath)) {
      spinner.fail('Vercel output not found');
      console.error(chalk.red('The Vercel output has not been built yet in the package.'));
      process.exit(1);
    }

    // 2. Determine destination path (current working directory)
    const destVercelDir = join(process.cwd(), '.vercel');
    const destOutputPath = join(destVercelDir, 'output');

    // 3. Ensure .vercel directory exists
    await fs.ensureDir(destVercelDir);

    // 4. Remove existing output directory if it exists
    if (existsSync(destOutputPath)) {
      await fs.remove(destOutputPath);
    }

    // 5. Copy the vercel output
    await fs.copy(sourceOutputPath, destOutputPath);

    spinner.succeed(`Vercel output copied to .vercel/output/`);

    console.log('');
    console.log(chalk.blue('🚀 Ready for Vercel deployment'));
    console.log(chalk.gray('Run: vercel deploy --prebuilt --prod'));
    console.log('');
  } catch (error) {
    spinner.fail('Failed to copy Vercel output');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

async function buildForVercel({ outputDir = './vercel-build' }: { outputDir: string }) {
  const spinner = ora('Creating Vercel-ready build...').start();

  try {
    // 1. Find the standalone package (same logic as dev command)
    const pkg = require.resolve('@inkeep/agents-manage-ui/package.json');
    const root = dirname(pkg);
    const standalonePath = join(root, '.next/standalone/agents-manage-ui');

    // Check if the standalone build exists
    if (!existsSync(standalonePath)) {
      spinner.fail('Standalone build not found');
      console.error(chalk.red('The standalone build has not been created yet.'));
      process.exit(1);
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
      dependencies: {
        '@inkeep/agents-manage-ui': 'latest',
      },
    };

    await fs.writeJson(join(outputDir, 'package.json'), packageJson, { spaces: 2 });

    // 6. Create vercel.json
    const vercelConfig = {
      version: 2,
      builds: [
        {
          src: 'server.js',
          use: '@vercel/node',
        },
      ],
      routes: [
        {
          src: '/(.*)',
          dest: 'server.js',
        },
      ],
    };

    await fs.writeJson(join(outputDir, 'vercel.json'), vercelConfig, { spaces: 2 });

    // 7. Create setup instructions
    const instructions = `# Inkeep Dashboard - Vercel Deployment

## Quick Deploy

1. Go to https://vercel.com/dashboard
2. Click "New Project" 
3. Upload this folder or connect to GitHub
4. Set environment variables:
   - INKEEP_API_URL=your-api-url
   - INKEEP_TENANT_ID=your-tenant-id
   - NODE_ENV=production
5. Deploy!

## Using Vercel CLI

\`\`\`bash
cd ${outputDir}
vercel --prod
\`\`\`

## Environment Variables

Make sure to set these in your Vercel project settings:
- INKEEP_API_URL
- INKEEP_TENANT_ID
- Any other variables from your .env file
`;

    await fs.writeFile(join(outputDir, 'README-VERCEL.md'), instructions);

    spinner.succeed(`Vercel-ready build created at ${outputDir}/`);

    console.log('');
    console.log(chalk.blue('🚀 Start script:'), 'node server.js');

    console.log('');
    console.log(chalk.yellow('📖 See README-VERCEL.md for deployment instructions'));
  } catch (error) {
    spinner.fail('Failed to create Vercel build');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

export async function devCommand(options: DevOptions) {
  const {
    port = 3000,
    host = 'localhost',
    build = false,
    outputDir = './vercel-build',
    vercel = false,
  } = options;

  if (vercel) {
    await copyVercelOutput();
    return;
  }

  if (build) {
    await buildForVercel({ outputDir });

    console.log('');
    console.log(chalk.blue('Next steps: Deploy the build folder to Vercel'));
    return;
  }

  startWebApp({ port, host });
}
