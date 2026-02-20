import { exec } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import * as p from '@clack/prompts';
import { ANTHROPIC_MODELS, GOOGLE_MODELS, OPENAI_MODELS } from '@inkeep/agents-core';
import fs from 'fs-extra';
import color from 'picocolors';
import {
  type ContentReplacement,
  cloneTemplate,
  cloneTemplateLocal,
  getAvailableTemplates,
} from './templates.js';

// Shared validation utility
const DIRECTORY_VALIDATION = {
  pattern: /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
  reservedNames: /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i,
  minLength: 1,
  maxLength: 255,

  validate(value: string): string | undefined {
    if (!value || value.trim() === '') return 'Directory name is required';
    if (value.length < this.minLength || value.length > this.maxLength) {
      return `Directory name must be between ${this.minLength} and ${this.maxLength} characters`;
    }
    if (this.reservedNames.test(value)) {
      return 'Directory name cannot be a reserved system name';
    }
    if (!this.pattern.test(value)) {
      return 'Directory name can only contain letters, numbers, and hyphens (-), and underscores (_) and must start with a letter or number';
    }
    return undefined;
  },
};

const agentsTemplateRepo = 'https://github.com/inkeep/agents/create-agents-template';

const projectTemplateRepo = 'https://github.com/inkeep/agents/agents-cookbook/template-projects';
const execAsync = promisify(exec);

const agentsApiPort = '3002';

export const defaultGoogleModelConfigurations = {
  base: {
    model: GOOGLE_MODELS.GEMINI_2_5_FLASH,
  },
  structuredOutput: {
    model: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE,
  },
  summarizer: {
    model: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE,
  },
};

export const defaultOpenaiModelConfigurations = {
  base: {
    model: OPENAI_MODELS.GPT_5_2,
  },
  structuredOutput: {
    model: OPENAI_MODELS.GPT_4_1_MINI,
  },
  summarizer: {
    model: OPENAI_MODELS.GPT_4_1_NANO,
  },
};

export const defaultAnthropicModelConfigurations = {
  base: {
    model: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5,
  },
  structuredOutput: {
    model: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5,
  },
  summarizer: {
    model: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5,
  },
};

export const defaultMockModelConfigurations = {
  base: { model: 'mock/default' },
};

type FileConfig = {
  dirName: string;
  tenantId: string;
  projectId: string;
  openAiKey?: string;
  anthropicKey?: string;
  googleKey?: string;
  azureKey?: string;
  modelSettings: Record<string, any>;
  customProject?: boolean;
  disableGit?: boolean;
  localPrefix?: string;
  installInkeepCLI?: boolean;
};

export const createAgents = async (
  args: {
    dirName?: string;
    templateName?: string;
    openAiKey?: string;
    anthropicKey?: string;
    googleKey?: string;
    azureKey?: string;
    template?: string;
    customProjectId?: string;
    disableGit?: boolean;
    localAgentsPrefix?: string;
    localTemplatesPrefix?: string;
    skipInkeepCli?: boolean;
    skipInkeepMcp?: boolean;
    skipInstall?: boolean;
    skipProvider?: boolean;
  } = {}
) => {
  let {
    dirName,
    openAiKey,
    anthropicKey,
    googleKey,
    azureKey,
    template,
    customProjectId,
    disableGit,
    localAgentsPrefix,
    localTemplatesPrefix,
    skipInkeepCli,
    skipInkeepMcp,
    skipInstall,
    skipProvider,
  } = args;

  const tenantId = 'default';

  let projectId: string;
  let templateName: string;

  if (customProjectId) {
    projectId = customProjectId;
    templateName = '';
  } else if (template) {
    const availableTemplates = await getAvailableTemplates(localTemplatesPrefix);
    if (!availableTemplates.includes(template)) {
      p.cancel(
        `${color.red('✗')} Template "${template}" not found\n\n` +
          `${color.yellow('Available templates:')}\n` +
          `  • ${availableTemplates.join('\n  • ')}\n`
      );
      process.exit(0);
    }
    projectId = template;
    templateName = template;
  } else {
    projectId = 'activities-planner';
    templateName = 'activities-planner';
  }

  p.intro(color.inverse(' Create Agents Directory '));

  if (!dirName) {
    const dirResponse = await p.text({
      message: 'What do you want to name your agents directory?',
      placeholder: 'agents',
      defaultValue: 'agents',
      validate: (value) => DIRECTORY_VALIDATION.validate(value),
    });

    if (p.isCancel(dirResponse)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    dirName = dirResponse as string;
  } else {
    // Validate the provided dirName
    const validationError = DIRECTORY_VALIDATION.validate(dirName);
    if (validationError) {
      throw new Error(validationError);
    }
  }

  if (!skipProvider && !anthropicKey && !openAiKey && !googleKey && !azureKey) {
    const providerChoice = await p.select({
      message: 'Which AI provider would you like to use?',
      options: [
        { value: 'anthropic', label: 'Anthropic' },
        { value: 'openai', label: 'OpenAI' },
        { value: 'google', label: 'Google' },
        { value: 'azure', label: 'Azure' },
        { value: 'skip', label: 'Skip', hint: 'scaffolds with mock provider, no API key needed' },
      ],
    });

    if (p.isCancel(providerChoice)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }

    if (providerChoice === 'anthropic') {
      const anthropicKeyResponse = await p.password({
        message: 'Enter your Anthropic API key:',
        validate: (value) => {
          if (!value || value.trim() === '') {
            return 'Anthropic API key is required';
          }
          return undefined;
        },
      });

      if (p.isCancel(anthropicKeyResponse)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }
      anthropicKey = anthropicKeyResponse as string;
    } else if (providerChoice === 'openai') {
      const openAiKeyResponse = await p.password({
        message: 'Enter your OpenAI API key:',
        validate: (value) => {
          if (!value || value.trim() === '') {
            return 'OpenAI API key is required';
          }
          return undefined;
        },
      });

      if (p.isCancel(openAiKeyResponse)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }
      openAiKey = openAiKeyResponse as string;
    } else if (providerChoice === 'google') {
      const googleKeyResponse = await p.password({
        message: 'Enter your Google API key:',
        validate: (value) => {
          if (!value || value.trim() === '') {
            return 'Google API key is required';
          }
          return undefined;
        },
      });

      if (p.isCancel(googleKeyResponse)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }
      googleKey = googleKeyResponse as string;
    } else if (providerChoice === 'azure') {
      const azureKeyResponse = await p.password({
        message: 'Enter your Azure API key:',
        validate: (value) => {
          if (!value || value.trim() === '') {
            return 'Azure API key is required';
          }
          return undefined;
        },
      });

      if (p.isCancel(azureKeyResponse)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }
      azureKey = azureKeyResponse as string;
    } else if (providerChoice === 'skip') {
      skipProvider = true;
    }
  }

  let defaultModelSettings = {};
  if (skipProvider) {
    defaultModelSettings = defaultMockModelConfigurations;
    if (openAiKey || anthropicKey || googleKey || azureKey) {
      p.log.warn(
        '--skip-provider is active. Provider key flags are ignored; mock/default model will be used.'
      );
    }
  } else if (anthropicKey) {
    defaultModelSettings = defaultAnthropicModelConfigurations;
  } else if (openAiKey) {
    defaultModelSettings = defaultOpenaiModelConfigurations;
  } else if (googleKey) {
    defaultModelSettings = defaultGoogleModelConfigurations;
  } else if (azureKey) {
    // Azure requires custom configuration - prompt for deployment details
    p.note('Azure OpenAI requires custom deployment configuration.');

    const deploymentName = await p.text({
      message: 'Enter your Azure deployment name:',
      placeholder: 'my-gpt-4o-deployment',
      validate: (value) => {
        if (!value?.trim()) return 'Deployment name is required';
      },
    });

    if (p.isCancel(deploymentName)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }

    const connectionMethod = await p.select({
      message: 'How would you like to connect to Azure?',
      options: [
        { value: 'resource', label: 'Azure Resource Name (recommended)' },
        { value: 'url', label: 'Custom Base URL' },
      ],
    });

    if (p.isCancel(connectionMethod)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }

    const azureProviderOptions: any = {};

    if (connectionMethod === 'resource') {
      const resourceName = await p.text({
        message: 'Enter your Azure resource name:',
        placeholder: 'your-azure-resource',
        validate: (value) => {
          if (!value?.trim()) return 'Resource name is required';
        },
      });

      if (p.isCancel(resourceName)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }

      azureProviderOptions.resourceName = resourceName;
    } else {
      const baseURL = await p.text({
        message: 'Enter your Azure base URL:',
        placeholder: 'https://your-endpoint.openai.azure.com/openai',
        validate: (value) => {
          if (!value?.trim()) return 'Base URL is required';
          if (!value.startsWith('https://')) return 'Base URL must start with https://';
        },
      });

      if (p.isCancel(baseURL)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }

      azureProviderOptions.baseURL = baseURL;
    }

    // Create Azure model configuration with user's deployment
    defaultModelSettings = {
      base: {
        model: `azure/${deploymentName}`,
        providerOptions: azureProviderOptions,
      },
      structuredOutput: {
        model: `azure/${deploymentName}`,
        providerOptions: azureProviderOptions,
      },
      summarizer: {
        model: `azure/${deploymentName}`,
        providerOptions: azureProviderOptions,
      },
    };
  }

  if (Object.keys(defaultModelSettings).length === 0) {
    p.cancel(
      'Cannot continue without a model configuration for project. Please provide an API key for at least one AI provider.'
    );
    process.exit(1);
  }

  const s = p.spinner();
  s.start('Creating directory structure...');

  try {
    const directoryPath = path.resolve(process.cwd(), dirName);

    if (await fs.pathExists(directoryPath)) {
      s.stop();
      const overwrite = await p.confirm({
        message: `Directory ${dirName} already exists. Do you want to overwrite it?`,
      });

      if (p.isCancel(overwrite) || !overwrite) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }
      s.start('Cleaning existing directory...');
      await fs.emptyDir(directoryPath);
    }

    s.message('Building template (this may take a while)...');
    await cloneTemplateHelper({
      targetPath: directoryPath,
      localPrefix: localAgentsPrefix,
    });

    process.chdir(directoryPath);

    const config = {
      dirName,
      tenantId,
      projectId,
      openAiKey,
      anthropicKey,
      googleKey,
      azureKey,
      modelSettings: defaultModelSettings,
      customProject: !!customProjectId,
      disableGit: disableGit,
    };

    s.message('Setting up project structure...');
    await createWorkspaceStructure();

    s.message('Setting up environment files...');
    await createEnvironmentFiles(config);

    if (templateName && templateName.length > 0) {
      s.message('Creating project template folder...');
      const templateTargetPath = `src/projects/${projectId}`;

      const contentReplacements: ContentReplacement[] = [
        {
          filePath: 'index.ts',
          replacements: {
            models: defaultModelSettings,
          },
        },
      ];
      await cloneTemplateHelper({
        templateName,
        targetPath: templateTargetPath,
        localPrefix: localTemplatesPrefix,
        replacements: contentReplacements,
      });
    } else {
      s.message('Creating empty project folder...');
      await fs.ensureDir(`src/projects/${projectId}`);
    }

    s.message('Creating inkeep.config.ts...');
    await createInkeepConfig(config);

    if (!skipInstall) {
      s.message('Installing dependencies (this may take a while)...');
      await installDependencies();
    }

    if (!config.disableGit) {
      await initializeGit();
    }

    await checkPortsAvailability();

    s.stop();

    if (!skipInkeepCli) {
      let isGloballyInstalled = false;

      try {
        const { stdout } = await execAsync('pnpm list -g @inkeep/agents-cli --json');
        const result = JSON.parse(stdout);
        isGloballyInstalled = result?.[0]?.dependencies?.['@inkeep/agents-cli'] !== undefined;
      } catch (_error) {
        try {
          await execAsync('npm list -g @inkeep/agents-cli');
          isGloballyInstalled = true;
        } catch (_npmError) {
          isGloballyInstalled = false;
        }
      }

      if (!isGloballyInstalled) {
        const installInkeepCLIResponse = await p.confirm({
          message: 'Would you like to install the Inkeep CLI globally?',
        });
        if (!p.isCancel(installInkeepCLIResponse) && installInkeepCLIResponse) {
          await installInkeepCLIGlobally();
        }
      }
    }

    if (!skipInkeepMcp) {
      await addInkeepMcp();
    }

    p.log.success(`Workspace created at: ${color.cyan(directoryPath)}`);

    p.note(
      `${color.yellow('1. Start:')}\n` +
        `   cd ${dirName}\n` +
        `   pnpm setup-dev\n` +
        `   pnpm dev\n\n` +
        `${color.yellow('2. Explore:')}\n` +
        `   • Dashboard:  http://127.0.0.1:3000\n` +
        `   • Agents API: http://127.0.0.1:3002\n\n` +
        `${color.yellow('3. Customize:')}\n` +
        `   • Edit your agents in src/projects/\n` +
        `   • Use 'inkeep push' to apply`,
      'Next steps 🚀'
    );
  } catch (error) {
    s.stop();
    p.cancel(
      `Error creating directory: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    process.exit(1);
  }
};

async function createWorkspaceStructure() {
  await fs.ensureDir(`src`);
}

async function createEnvironmentFiles(config: FileConfig) {
  let envExampleContent: string;
  try {
    envExampleContent = await fs.readFile('.env.example', 'utf-8');
  } catch {
    throw new Error(
      'Could not read .env.example from the template. The template may be corrupted — try running the command again.',
    );
  }
  const lines = envExampleContent.split('\n');

  const injections: Record<string, string> = {
    ANTHROPIC_API_KEY: config.anthropicKey || '',
    OPENAI_API_KEY: config.openAiKey || '',
    GOOGLE_GENERATIVE_AI_API_KEY: config.googleKey || '',
    AZURE_API_KEY: config.azureKey || '',
    DEFAULT_PROJECT_ID: config.projectId,
  };

  for (let i = 0; i < lines.length; i++) {
    for (const [varName, value] of Object.entries(injections)) {
      if (lines[i].startsWith(`${varName}=`)) {
        lines[i] = `${varName}=${value}`;
      }
    }
  }

  await fs.writeFile('.env', lines.join('\n'));
}

async function createInkeepConfig(config: FileConfig) {
  const inkeepConfig = `import { defineConfig } from '@inkeep/agents-cli/config';
    
const config = defineConfig({
  tenantId: "${config.tenantId}",
  agentsApi: {
    // Using 127.0.0.1 instead of localhost to avoid IPv6/IPv4 resolution issues
    url: 'http://127.0.0.1:3002',
  },
});
    
export default config;`;
  await fs.writeFile(`src/inkeep.config.ts`, inkeepConfig);

  if (config.customProject) {
    const customIndexContent = `import { project } from '@inkeep/agents-sdk';

export const myProject = project({
  id: "${config.projectId}",
  name: "${config.projectId}",
  description: "",
  agent: () => [],
  models: ${JSON.stringify(config.modelSettings, null, 2)},
});`;
    await fs.writeFile(`src/projects/${config.projectId}/index.ts`, customIndexContent);
  }
}

async function installInkeepCLIGlobally() {
  const s = p.spinner();
  s.start('Installing Inkeep CLI globally with pnpm...');

  try {
    await execAsync('pnpm add -g @inkeep/agents-cli');
    s.stop('✓ Inkeep CLI installed successfully with pnpm');
    return;
  } catch (_pnpmError) {
    s.message('pnpm failed, trying npm...');

    try {
      await execAsync('npm install -g @inkeep/agents-cli');
      s.stop('✓ Inkeep CLI installed successfully with npm');
      return;
    } catch (_npmError) {
      s.stop('⚠️  Could not automatically install Inkeep CLI globally');
      console.warn('You can install it manually later by running:');
      console.warn('  npm install -g @inkeep/agents-cli');
      console.warn('  or');
      console.warn('  pnpm add -g @inkeep/agents-cli\n');
    }
  }
}

async function installDependencies() {
  try {
    const { stderr } = await execAsync('pnpm install');
    if (process.env.CI && stderr) {
      console.log('pnpm install stderr:', stderr);
    }
  } catch (error: any) {
    // Capture and log full error details for debugging
    console.error('pnpm install failed!');
    console.error('Exit code:', error.code);
    if (error.stdout) {
      console.error('stdout:', error.stdout);
    }
    if (error.stderr) {
      console.error('stderr:', error.stderr);
    }
    if (error.message) {
      console.error('Error message:', error.message);
    }
    throw error;
  }
}

async function initializeGit() {
  try {
    await execAsync('git init');
    await execAsync('git add .');
    await execAsync('git commit -m "Initial commit from inkeep/create-agents"');
  } catch (error) {
    console.error(
      'Error initializing git:',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}
/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      // Only treat EADDRINUSE as "port in use", other errors might be transient
      resolve(err.code !== 'EADDRINUSE');
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, 'localhost');
  });
}
/**
 * Display port conflict error and exit
 */
function displayPortConflictError(unavailablePorts: { agentsApi: boolean }): never {
  let errorMessage = '';
  if (unavailablePorts.agentsApi) {
    errorMessage += `${color.red(`Agents API port ${agentsApiPort} is already in use`)}\n`;
  }

  p.cancel(
    `\n${color.red('✗ Port conflicts detected')}\n\n` +
      `${errorMessage}\n` +
      `${color.yellow('Please free up the ports and try again.')}\n`
  );
  process.exit(1);
}

/**
 * Check port availability and display errors if needed
 */
async function checkPortsAvailability(): Promise<void> {
  const [agentsApiAvailable] = await Promise.all([isPortAvailable(Number(agentsApiPort))]);

  if (!agentsApiAvailable) {
    displayPortConflictError({
      agentsApi: !agentsApiAvailable,
    });
  }
}

async function cloneTemplateHelper(options: {
  targetPath: string;
  templateName?: string;
  localPrefix?: string;
  replacements?: ContentReplacement[];
}) {
  const { targetPath, templateName, localPrefix, replacements } = options;
  // If local prefix is provided, use it to clone the template. This is useful for local development and testing.
  if (localPrefix && localPrefix.length > 0) {
    if (templateName) {
      const fullTemplatePath = path.join(localPrefix, templateName);
      await cloneTemplateLocal(fullTemplatePath, targetPath, replacements);
    } else {
      await cloneTemplateLocal(localPrefix, targetPath, replacements);
    }
  } else {
    if (templateName) {
      await cloneTemplate(`${projectTemplateRepo}/${templateName}`, targetPath, replacements);
    } else {
      await cloneTemplate(agentsTemplateRepo, targetPath, replacements);
    }
  }
}

export async function createCommand(dirName?: string, options?: any) {
  await createAgents({
    dirName,
    ...options,
  });
}

export async function addInkeepMcp() {
  const editorChoice = await p.select({
    message: 'Give your IDE access to Inkeep docs and types? (Adds Inkeep MCP)',
    options: [
      { value: 'cursor-project', label: 'Cursor (project only)' },
      { value: 'cursor-global', label: 'Cursor (global, all projects)' },
      { value: 'windsurf', label: 'Windsurf' },
      { value: 'vscode', label: 'VSCode' },
      { value: 'skip', label: 'Skip' },
    ],
    initialValue: 'cursor-project',
  });

  if (p.isCancel(editorChoice)) {
    return;
  }

  if (!editorChoice) {
    return;
  }

  const s = p.spinner();

  try {
    const mcpConfig = {
      mcpServers: {
        inkeep: {
          type: 'mcp',
          url: 'https://agents.inkeep.com/mcp',
        },
      },
    };

    const homeDir = os.homedir();

    switch (editorChoice) {
      case 'cursor-project': {
        s.start('Adding Inkeep MCP to Cursor (project)...');
        const cursorDir = path.join(process.cwd(), '.cursor');
        const configPath = path.join(cursorDir, 'mcp.json');

        await fs.ensureDir(cursorDir);

        let existingConfig = {};
        if (await fs.pathExists(configPath)) {
          existingConfig = await fs.readJson(configPath);
        }

        const mergedConfig = {
          ...existingConfig,
          mcpServers: {
            ...(existingConfig as any).mcpServers,
            ...mcpConfig.mcpServers,
          },
        };

        await fs.writeJson(configPath, mergedConfig, { spaces: 2 });
        s.stop(`${color.green('✓')} Inkeep MCP added to .cursor/mcp.json`);
        break;
      }

      case 'cursor-global': {
        s.start('Adding Inkeep MCP to Cursor (global)...');
        const configPath = path.join(homeDir, '.cursor', 'mcp.json');

        await fs.ensureDir(path.dirname(configPath));

        let existingConfig = {};
        if (await fs.pathExists(configPath)) {
          existingConfig = await fs.readJson(configPath);
        }

        const mergedConfig = {
          ...existingConfig,
          mcpServers: {
            ...(existingConfig as any).mcpServers,
            ...mcpConfig.mcpServers,
          },
        };

        await fs.writeJson(configPath, mergedConfig, { spaces: 2 });
        s.stop(`${color.green('✓')} Inkeep MCP added to global Cursor settings`);
        break;
      }

      case 'windsurf': {
        s.start('Adding Inkeep MCP to Windsurf...');
        const configPath = path.join(homeDir, '.codeium', 'windsurf', 'mcp_config.json');

        await fs.ensureDir(path.dirname(configPath));

        let existingConfig = {};
        if (await fs.pathExists(configPath)) {
          existingConfig = await fs.readJson(configPath);
        }

        const mergedConfig = {
          ...existingConfig,
          mcpServers: {
            ...(existingConfig as any).mcpServers,
            ...mcpConfig.mcpServers,
          },
        };

        await fs.writeJson(configPath, mergedConfig, { spaces: 2 });
        s.stop(`${color.green('✓')} Inkeep MCP added to Windsurf settings`);
        break;
      }

      case 'vscode': {
        s.start('Adding Inkeep MCP to VSCode...');

        let configPath: string;

        if (process.platform === 'darwin') {
          configPath = path.join(
            homeDir,
            'Library',
            'Application Support',
            'Code',
            'User',
            'mcp.json'
          );
        } else if (process.platform === 'win32') {
          configPath = path.join(homeDir, 'AppData', 'Roaming', 'Code', 'User', 'mcp.json');
        } else {
          configPath = path.join(homeDir, '.config', 'Code', 'User', 'mcp.json');
        }

        await fs.ensureDir(path.dirname(configPath));

        let existingConfig = {};
        if (await fs.pathExists(configPath)) {
          existingConfig = await fs.readJson(configPath);
        }

        const mergedConfig = {
          ...existingConfig,
          servers: {
            ...(existingConfig as any).servers,
            ...mcpConfig.mcpServers,
          },
        };

        await fs.writeJson(configPath, mergedConfig, { spaces: 2 });
        s.stop(
          `${color.green('✓')} Inkeep MCP added to VSCode settings\n\n${color.yellow('Next steps:')}\n` +
            `  start the MCP by going to ${configPath} and clicking start`
        );
        break;
      }

      case 'skip': {
        break;
      }
    }
  } catch (error) {
    s.stop();
    console.error(`${color.yellow('⚠')}  Could not automatically configure MCP server: ${error}`);
  }
}
