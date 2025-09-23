import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';

const require = createRequire(import.meta.url);

export interface DevOptions {
  port?: number;
  host?: string;
  build?: boolean;
}

function resolveWebRuntime() {
  try {
    // Resolve the package directory
    const pkg = require.resolve('@inkeep/agents-manage-ui/package.json');
    return dirname(pkg);
  } catch (err) {
    throw new Error(`Could not find @inkeep/agents-manage-ui package. ${err}`);
  }
}

async function startWebApp({ port = 3000, host = 'localhost' }: DevOptions) {
  const spinner = ora('Starting dashboard server...').start();

  try {
    const { devNext } = await import('@inkeep/agents-manage-ui');
    const appDir = resolveWebRuntime();

    spinner.succeed('Starting dashboard server...');
    console.log('');

    await devNext({
      dir: appDir,
      port,
      host,
    });
  } catch (error) {
    spinner.fail('Failed to start dashboard server');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

async function buildNextApp() {
  const spinner = ora('Building Next.js app...').start();

  try {
    const { buildNext } = await import('@inkeep/agents-manage-ui');
    const appDir = resolveWebRuntime();

    // Build the Next.js app in the package directory
    await buildNext({
      dir: appDir,
      env: { NODE_ENV: 'production', NEXTJS_IGNORE_TYPECHECK: 'true' },
    });

    spinner.succeed('Next.js app built successfully');

    console.log('');
    console.log(chalk.blue('🚀 Ready for Vercel deployment'));
    console.log(chalk.gray('The app has been built in the current directory'));
    console.log('');
    console.log(chalk.yellow('📖 Next steps: Deploy to Vercel using the Vercel dashboard or CLI'));
  } catch (error) {
    spinner.fail('Failed to build Next.js app');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

export async function devCommand(options: DevOptions) {
  const { port = 3000, host = 'localhost', build = false } = options;

  if (build) {
    await buildNextApp();
    return;
  }

  await startWebApp({ port, host });
}
