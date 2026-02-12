import path from 'node:path';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { findUp } from 'find-up';
import fs from 'fs-extra';
import type { FunctionDeclaration, VariableStatement } from 'ts-morph';
import { Project } from 'ts-morph';
import { ManagementApiClient } from '../api';
import { initializeCommand } from '../utils/cli-pipeline';
import { findConfigFile, findProjectConfig } from '../utils/config';

const UI_DIR_RELATIVE = 'apps/agents-ui/src/ui';

function toPascalCase(name: string): string {
  if (!name?.trim()) return 'Component';
  return name
    .trim()
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Ensures the component declaration is exported using AST. Finds the first
 * function or const component (PascalCase name) and adds export if missing.
 */
export function ensureExported(code: string): string {
  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { jsx: 1 },
    });
    const sourceFile = project.createSourceFile('temp.tsx', code);
    type Candidate =
      | { start: number; type: 'function'; node: FunctionDeclaration }
      | { start: number; type: 'variable'; node: VariableStatement };
    const candidates: Candidate[] = [];
    for (const fn of sourceFile.getFunctions()) {
      if (fn.getName()) candidates.push({ start: fn.getStart(), type: 'function', node: fn });
    }
    for (const stmt of sourceFile.getVariableStatements()) {
      const decl = stmt.getDeclarationList().getDeclarations()[0];
      const name = decl?.getName?.();
      if (typeof name === 'string' && name.length > 0 && name[0] === name[0].toUpperCase()) {
        candidates.push({ start: stmt.getStart(), type: 'variable', node: stmt });
      }
    }
    candidates.sort((a, b) => a.start - b.start);
    const first = candidates[0];
    if (!first) return code;
    if (first.type === 'function') {
      if (!first.node.isExported()) first.node.setIsExported(true);
    } else {
      if (!first.node.hasExportKeyword()) first.node.toggleModifier('export', true);
    }
    return sourceFile.getFullText();
  } catch {
    return code;
  }
}

async function findUiDirectory(): Promise<string> {
  const cwd = process.cwd();
  const uiDir = path.join(cwd, UI_DIR_RELATIVE);
  if (await fs.pathExists(uiDir)) return uiDir;
  const found = await findUp(UI_DIR_RELATIVE, { type: 'directory' });
  if (found) return found;
  const agentsUi = await findUp('apps/agents-ui', { type: 'directory' });
  if (agentsUi) return path.join(agentsUi, 'src', 'ui');
  return path.join(cwd, UI_DIR_RELATIVE);
}

type ComponentItem = {
  id: string;
  name: string;
  render: { component: string; mockData: Record<string, unknown> } | null;
};

async function fetchAllComponentsWithRender(
  client: ManagementApiClient
): Promise<{ data: ComponentItem[]; artifact: ComponentItem[] }> {
  const [dataComponents, artifactComponents] = await Promise.all([
    client.listDataComponents(),
    client.listArtifactComponents(),
  ]);
  return { data: dataComponents, artifact: artifactComponents };
}

function formatComponentList(data: ComponentItem[], artifact: ComponentItem[]): string {
  const withRender = (c: ComponentItem) => c.render?.component?.trim();
  const lines: string[] = [];
  for (const c of data.filter(withRender)) {
    lines.push(`  ${chalk.cyan(c.id)}  ${chalk.gray('(data)')}     ${c.name}`);
  }
  for (const c of artifact.filter(withRender)) {
    lines.push(`  ${chalk.cyan(c.id)}  ${chalk.gray('(artifact)')}  ${c.name}`);
  }
  return lines.length ? lines.join('\n') : '  (none with render code)';
}

export interface AddUiOptions {
  ui?: string | true;
  list?: boolean;
  config?: string;
  profile?: string;
  quiet?: boolean;
}

export async function addUiCommand(options: AddUiOptions): Promise<void> {
  const componentId = typeof options.ui === 'string' ? options.ui : undefined;

  const configPath = options.config
    ? path.resolve(process.cwd(), options.config)
    : findConfigFile(process.cwd());
  if (!configPath) {
    console.error(
      chalk.red(
        'No Inkeep config found. Run from a project directory with inkeep.config.ts or pass --config <path>.'
      )
    );
    process.exit(1);
  }

  const { config, isCI } = await initializeCommand({
    configPath,
    profileName: options.profile,
    showSpinner: true,
    spinnerText: 'Loading configuration...',
    logConfig: !options.quiet,
    quiet: options.quiet,
  });

  const projectConfig = await findProjectConfig(path.dirname(configPath));
  const projectId = projectConfig?.projectId ?? null;
  if (!projectId) {
    console.error(
      chalk.red('Project ID not found in config. Set projectId in your inkeep.config.ts.')
    );
    process.exit(1);
  }

  if (!config.agentsApiKey) {
    console.error(
      chalk.red('Not authenticated. Run "inkeep login" or set agentsApi.apiKey in your config.')
    );
    process.exit(1);
  }

  let client: ManagementApiClient;
  try {
    client = await ManagementApiClient.create(
      config.agentsApiUrl,
      configPath,
      config.tenantId,
      projectId,
      isCI ?? false,
      config.agentsApiKey
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Failed to create API client: ${message}`));
    process.exit(1);
  }

  const toWrite: { pascalName: string; code: string }[] = [];
  const s = p.spinner();

  if (options.list) {
    s.start('Fetching components...');
    const { data: dataComponents, artifact: artifactComponents } =
      await fetchAllComponentsWithRender(client);
    s.stop();
    console.log(chalk.cyan('\nAvailable UI components (use id with inkeep add --ui <id>):\n'));
    console.log(formatComponentList(dataComponents, artifactComponents));
    console.log('');
    process.exit(0);
  }

  s.start('Resolving UI directory...');
  const uiDir = await findUiDirectory();
  await fs.ensureDir(uiDir);
  s.stop();

  if (componentId) {
    let comp: ComponentItem | null = await client.getDataComponent(componentId);
    let kind = 'data';
    if (!comp) {
      comp = await client.getArtifactComponent(componentId);
      kind = 'artifact';
    }
    if (!comp) {
      s.start('Fetching available components...');
      const { data: dataComponents, artifact: artifactComponents } =
        await fetchAllComponentsWithRender(client);
      s.stop();
      console.error(
        chalk.red(`Component "${componentId}" not found (tried data and artifact components).`)
      );
      console.log(chalk.cyan('\nAvailable UI components (use id with inkeep add --ui <id>):\n'));
      console.log(formatComponentList(dataComponents, artifactComponents));
      console.log('');
      process.exit(1);
    }
    if (!comp.render?.component?.trim()) {
      console.error(
        chalk.red(
          `Component "${comp.name}" (${kind}) has no render code. Generate a render in the dashboard first.`
        )
      );
      process.exit(1);
    }
    const pascalName = toPascalCase(comp.name);
    toWrite.push({ pascalName, code: ensureExported(comp.render.component) });
  } else {
    s.start('Fetching data and artifact components...');
    const [dataComponents, artifactComponents] = await Promise.all([
      client.listDataComponents(),
      client.listArtifactComponents(),
    ]);
    s.stop();
    const withRender = (c: ComponentItem) =>
      c.render?.component?.trim()
        ? { pascalName: toPascalCase(c.name), code: ensureExported(c.render.component) }
        : null;
    for (const c of dataComponents) {
      const item = withRender(c);
      if (item) toWrite.push(item);
    }
    for (const c of artifactComponents) {
      const item = withRender(c);
      if (item) toWrite.push(item);
    }
    if (toWrite.length === 0) {
      console.log(
        chalk.yellow(
          'No components with render code found. Generate renders in the dashboard first.'
        )
      );
      process.exit(0);
    }
  }

  s.start(`Writing ${toWrite.length} component(s) to ${uiDir}...`);
  for (const { pascalName, code } of toWrite) {
    const filePath = path.join(uiDir, `${pascalName}.tsx`);
    await fs.writeFile(filePath, code, 'utf-8');
  }
  s.stop(
    chalk.green(
      `Added ${toWrite.length} component(s) to ${path.relative(process.cwd(), uiDir)}. ` +
        `Import with: import { <Name> } from './ui/<Name>';`
    )
  );
}
