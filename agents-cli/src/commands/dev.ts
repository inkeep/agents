import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import chalk from 'chalk';
import fs from 'fs-extra';
import ora from 'ora';

const require = createRequire(import.meta.url);

export interface DevOptions {
  port: number;
  host: string;
  build: boolean;
  outputDir: string;
  path: boolean;
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
    throw new Error(`Could not find @inkeep/agents-manage-ui package. ${err}`);
  }
}

function startWebApp({ port, host }: Pick<DevOptions, 'port' | 'host'>) {
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

async function buildNextApp({ outputDir }: { outputDir: string }) {
  console.log('');
  const spinner = ora('Building Standalone build...').start();

  try {
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

    // 6. Create setup instructions
    const instructions = `
## Environment Variables

Make sure to set these in your Vercel project settings:
- INKEEP_API_URL
- INKEEP_TENANT_ID
- Any other variables from your .env file
`;

    await fs.writeFile(join(outputDir, 'README.md'), instructions);

    spinner.succeed(`Build created at ${outputDir}/`);

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
    spinner.fail('Failed to build dashboard');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

export async function devCommand(options: DevOptions) {
  const { port, host, build, outputDir, path } = options;

  if (path) {
    const rt = resolveWebRuntime(true);
    console.log(rt);
    return;
  }

  if (build) {
    await buildNextApp({ outputDir });
    return;
  }

  await startWebApp({ port, host });
}
