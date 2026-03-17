import { statSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { startCodeNodeServer } from '../utils/code-node-server';
import { PACKAGE_VERSION } from '../utils/version-check';

export interface CodeNodeOptions {
  host: string;
  port: string;
  workspace: string;
  runnerCommand: string;
  runnerArg: string[];
  timeoutMs: string;
  verificationCommand?: string;
  name?: string;
  description?: string;
  write?: boolean;
}

function defaultRunnerArgsForCommand(command: string): string[] {
  const executable = path.basename(command);
  if (executable === 'claude') {
    return ['-p', '{prompt}'];
  }
  return [];
}

export async function codeNodeCommand(options: CodeNodeOptions): Promise<void> {
  const workspaceRoot = path.resolve(options.workspace);
  const stats = statSync(workspaceRoot, { throwIfNoEntry: false });
  if (!stats || !stats.isDirectory()) {
    throw new Error(`Workspace does not exist or is not a directory: ${workspaceRoot}`);
  }

  const runnerArgs = options.runnerArg.length
    ? options.runnerArg
    : defaultRunnerArgsForCommand(options.runnerCommand);

  const started = await startCodeNodeServer({
    host: options.host,
    port: Number.parseInt(options.port, 10),
    workspaceRoot,
    runnerCommand: options.runnerCommand,
    runnerArgs,
    verificationCommand: options.verificationCommand,
    allowWrite: Boolean(options.write),
    defaultTimeoutMs: Number.parseInt(options.timeoutMs, 10),
    name: options.name || 'Claude Code Node',
    description:
      options.description ||
      'Local coding-agent bridge for Claude Code or another local CLI runner.',
    version: PACKAGE_VERSION,
  });

  console.log(chalk.green(`Local code node listening at ${started.baseUrl}`));
  console.log(chalk.gray(`Workspace root: ${workspaceRoot}`));
  console.log(chalk.gray(`Runner: ${options.runnerCommand} ${runnerArgs.join(' ')}`.trim()));
  console.log(chalk.gray(`Agent card: ${started.baseUrl}/.well-known/agent.json`));
  console.log('');
  console.log(chalk.blue('Example externalAgent definition:'));
  console.log(`externalAgent({`);
  console.log(`  id: 'local-code-node',`);
  console.log(`  name: '${options.name || 'Claude Code Node'}',`);
  console.log(`  description: '${options.description || 'Local coding-agent bridge'}',`);
  console.log(`  baseUrl: '${started.baseUrl}',`);
  console.log(`});`);
  console.log('');
  console.log(chalk.gray('Press Ctrl+C to stop the server'));

  const shutdown = async () => {
    await started.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}
