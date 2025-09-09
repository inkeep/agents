import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';

const require = createRequire(import.meta.url);

export interface DevOptions {
  port?: number;
  host?: string;
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

function startWebApp({ port = 3000, host = '127.0.0.1' }: DevOptions) {
  const spinner = ora('Starting dashboard server...').start();

  try {
    const rt = resolveWebRuntime();
    const entry = join(rt, 'server.js');
    console.log(entry);
    // Check if the standalone build exists
    if (!existsSync(entry)) {
      spinner.fail('Dashboard server not found');
      console.error(
        chalk.red('The dashboard server has not been built yet. Please run the following commands:')
      );
      console.error(chalk.yellow('  cd agents-manage-ui'));
      console.error(chalk.yellow('  pnpm build'));
      console.error(chalk.yellow('  pnpm start'));
      process.exit(1);
    }

    spinner.succeed('Starting dashboard server...');

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
    console.log(chalk.gray('Press Ctrl+C to stop the server'));

    // Handle process termination
    process.on('SIGINT', () => {
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

export async function devCommand(options: DevOptions) {
  const { port = 3000, host = '127.0.0.1' } = options;

  console.log(chalk.blue('Inkeep Dashboard Server'));
  console.log(chalk.gray(`Starting server on ${host}:${port}`));
  console.log('');

  startWebApp({ port, host });
}
