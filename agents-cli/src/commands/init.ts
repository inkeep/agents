import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { checkKeychainAvailability, loadCredentials } from '../utils/credentials';
import {
  DEFAULT_PROFILES_CONFIG,
  LOCAL_REMOTE,
  type Profile,
  ProfileManager,
  type ProfilesConfig,
} from '../utils/profiles';
import { loginCommand } from './login';

export interface InitOptions {
  path?: string;
  config?: string;
  interactive?: boolean;
  local?: boolean;
  profilesDir?: string;
}

/**
 * Find the most appropriate directory for the config file by looking for
 * common project root indicators
 */
function findProjectRoot(startPath: string): string {
  let currentPath = resolve(startPath);
  const root = dirname(currentPath);

  const rootIndicators = [
    'package.json',
    '.git',
    '.gitignore',
    'tsconfig.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
  ];

  while (currentPath !== root) {
    const files = readdirSync(currentPath);

    if (rootIndicators.some((indicator) => files.includes(indicator))) {
      return currentPath;
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }

  return startPath;
}

export async function initCommand(options?: InitOptions): Promise<void> {
  // Check if user wants local init (self-hosted) or cloud init
  if (options?.local) {
    await localInitCommand(options);
    return;
  }

  // Run cloud init wizard
  await cloudInitCommand(options);
}

/**
 * Full onboarding wizard for Inkeep Cloud customers
 */
async function cloudInitCommand(options?: InitOptions): Promise<void> {
  console.log();
  console.log(chalk.bold('Welcome to Inkeep!'));
  console.log();

  const s = p.spinner();
  const profileManager = new ProfileManager(
    options?.profilesDir ? { profilesDir: options.profilesDir } : undefined
  );

  // Step 1: Check authentication
  s.start('Checking authentication...');

  let isAuthenticated = false;
  let credentials: { accessToken: string; organizationId: string; userEmail: string } | null = null;

  // Check if keychain is available
  const { available: keychainAvailable } = await checkKeychainAvailability();

  if (keychainAvailable) {
    // Try to load existing credentials from default cloud profile
    try {
      const existingCreds = await loadCredentials('inkeep-cloud');
      if (existingCreds?.accessToken && existingCreds.organizationId) {
        credentials = {
          accessToken: existingCreds.accessToken,
          organizationId: existingCreds.organizationId,
          userEmail: existingCreds.userEmail,
        };
        isAuthenticated = true;
        s.stop(`Logged in as ${chalk.cyan(existingCreds.userEmail)}`);
      }
    } catch {
      // Credentials not found or invalid
    }
  }

  if (!isAuthenticated) {
    s.stop('Not logged in');
    console.log(chalk.yellow('→ Opening browser for login...'));
    console.log();

    // Run login flow
    await loginCommand({});

    // Re-check credentials after login
    const newCreds = await loadCredentials('inkeep-cloud');
    if (newCreds?.accessToken && newCreds.organizationId) {
      credentials = {
        accessToken: newCreds.accessToken,
        organizationId: newCreds.organizationId,
        userEmail: newCreds.userEmail,
      };
      isAuthenticated = true;
    } else {
      console.error(chalk.red('Login failed. Please try again.'));
      process.exit(1);
    }
  }

  // Step 2: Fetch tenants/organizations the user has access to
  s.start('Fetching your organizations...');

  let selectedTenantId: string;
  let selectedTenantName: string;

  try {
    const response = await fetch('https://api.pilot.inkeep.com/manage/api/cli/me', {
      headers: {
        Authorization: `Bearer ${credentials?.accessToken}`,
      },
    });

    if (!response.ok) {
      s.stop('Failed to fetch organizations');
      console.error(chalk.red('Could not fetch your organizations. Please try logging in again.'));
      process.exit(1);
    }

    const data = await response.json();

    // For now, we get the primary organization from the /me endpoint
    // In the future, this could be expanded to support multiple organizations
    selectedTenantId = data.organization.id;
    selectedTenantName = data.organization.name;

    s.stop(`Organization: ${chalk.cyan(selectedTenantName)}`);
  } catch {
    s.stop('Failed to fetch organizations');
    console.error(chalk.red('Network error. Please check your connection.'));
    process.exit(1);
  }

  // Step 3: Fetch projects for the organization
  s.start(`Fetching projects for ${selectedTenantName}...`);

  let projects: Array<{ id: string; name: string }> = [];

  try {
    const response = await fetch(
      `https://agents-api.inkeep.com/manage/tenants/${selectedTenantId}/projects?limit=100`,
      {
        headers: {
          Authorization: `Bearer ${credentials?.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      s.stop('Failed to fetch projects');
      console.error(chalk.red('Could not fetch projects.'));
      process.exit(1);
    }

    const data = await response.json();
    projects = data.data || [];

    s.stop(`Found ${projects.length} project(s)`);
  } catch {
    s.stop('Failed to fetch projects');
    console.error(chalk.red('Network error. Please check your connection.'));
    process.exit(1);
  }

  // Step 4: Ask where to create project files
  let targetDir: string;

  if (options?.path) {
    targetDir = resolve(process.cwd(), options.path);
  } else {
    const suggestedPath = './inkeep-agents';

    const confirmedPath = await p.text({
      message: 'Where should we create the project files?',
      placeholder: suggestedPath,
      initialValue: suggestedPath,
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Path is required';
        }
        return undefined;
      },
    });

    if (p.isCancel(confirmedPath)) {
      p.cancel('Setup cancelled');
      process.exit(0);
    }

    targetDir = resolve(process.cwd(), confirmedPath);
  }

  // Create target directory if it doesn't exist
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  // Step 5: Create project structure
  console.log();
  console.log(chalk.bold('Creating directory structure...'));

  const createdProjects: string[] = [];

  if (projects.length === 0) {
    // No projects, create a template project
    const templateDir = join(targetDir, 'my-agent');
    mkdirSync(templateDir, { recursive: true });

    const configContent = generateConfigFile(selectedTenantId, 'my-agent');
    writeFileSync(join(templateDir, 'inkeep.config.ts'), configContent);

    const indexContent = generateIndexFile('my-agent');
    writeFileSync(join(templateDir, 'index.ts'), indexContent);

    console.log(chalk.gray(`  ${targetDir}/`));
    console.log(chalk.gray(`    └── my-agent/`));
    console.log(chalk.gray(`        ├── inkeep.config.ts`));
    console.log(chalk.gray(`        └── index.ts`));

    createdProjects.push('my-agent');
  } else {
    console.log(chalk.gray(`  ${targetDir}/`));

    for (const project of projects) {
      const projectDir = join(targetDir, sanitizeProjectName(project.name || project.id));
      mkdirSync(projectDir, { recursive: true });

      const configContent = generateConfigFile(selectedTenantId, project.id);
      writeFileSync(join(projectDir, 'inkeep.config.ts'), configContent);

      // Create a placeholder index.ts (will be populated by pull)
      const indexContent = generateIndexFile(project.id);
      writeFileSync(join(projectDir, 'index.ts'), indexContent);

      const displayName = sanitizeProjectName(project.name || project.id);
      console.log(chalk.gray(`    ├── ${displayName}/`));
      console.log(chalk.gray(`    │   ├── inkeep.config.ts`));
      console.log(chalk.gray(`    │   └── index.ts`));

      createdProjects.push(displayName);
    }
  }

  console.log();
  console.log(chalk.green(`✓ Created ${createdProjects.length} project(s)`));

  // Step 6: Create environment templates
  console.log();
  console.log(chalk.bold('Creating environment templates...'));

  const envDevContent = generateEnvTemplate('development');
  const envProdContent = generateEnvTemplate('production');

  writeFileSync(join(targetDir, '.env.development'), envDevContent);
  writeFileSync(join(targetDir, '.env.production'), envProdContent);

  console.log(chalk.green('  ✓ .env.development'));
  console.log(chalk.green('  ✓ .env.production'));

  // Step 7: Set up profile
  if (!profileManager.profilesFileExists()) {
    console.log();
    console.log(chalk.bold('Setting up profile...'));

    profileManager.saveProfiles(DEFAULT_PROFILES_CONFIG);
    console.log(chalk.green('  ✓ Created cloud profile'));
  }

  // Step 8: Success message and next steps
  console.log();
  console.log(chalk.green.bold('Setup complete!'));
  console.log();
  console.log(chalk.bold('Next steps:'));
  console.log(chalk.gray(`  1. cd ${targetDir}`));
  console.log(chalk.gray('  2. Add your API keys to .env.development'));

  if (projects.length > 0) {
    console.log(chalk.gray('  3. Run: inkeep pull --all'));
  } else {
    console.log(chalk.gray('  3. Define your agent in index.ts'));
    console.log(chalk.gray('  4. Run: inkeep push'));
  }

  console.log();
}

/**
 * Simple local init for self-hosted deployments
 */
async function localInitCommand(options?: InitOptions): Promise<void> {
  let configPath: string;

  if (options?.path) {
    const resolvedPath = resolve(process.cwd(), options.path);
    if (options.path.endsWith('.ts') || options.path.endsWith('.js')) {
      configPath = resolvedPath;
    } else {
      configPath = join(resolvedPath, 'inkeep.config.ts');
    }
  } else {
    const projectRoot = findProjectRoot(process.cwd());
    const suggestedPath = join(projectRoot, 'inkeep.config.ts');

    if (options?.interactive === false) {
      configPath = suggestedPath;
    } else {
      const confirmedPath = await p.text({
        message: 'Where should the config file be created?',
        initialValue: suggestedPath,
        validate: (input) => {
          if (!input || input.trim() === '') {
            return 'Path is required';
          }
          const dir = input.endsWith('.ts') || input.endsWith('.js') ? dirname(input) : input;
          const resolvedDir = resolve(process.cwd(), dir);
          if (!existsSync(resolvedDir)) {
            return `Directory does not exist: ${resolvedDir}`;
          }
          return undefined;
        },
      });

      if (p.isCancel(confirmedPath)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }

      const resolvedPath = resolve(process.cwd(), confirmedPath);
      configPath =
        confirmedPath.endsWith('.ts') || confirmedPath.endsWith('.js')
          ? resolvedPath
          : join(resolvedPath, 'inkeep.config.ts');
    }
  }

  if (existsSync(configPath)) {
    if (options?.interactive === false) {
      console.log(chalk.yellow(`Config file already exists at ${configPath}, skipping creation.`));
      return;
    }

    const overwrite = await p.confirm({
      message: `${basename(configPath)} already exists. Overwrite?`,
      initialValue: false,
    });

    if (p.isCancel(overwrite)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }

    if (!overwrite) {
      console.log(chalk.yellow('Init cancelled.'));
      return;
    }
  }

  let tenantId: string;
  let apiUrl: string;

  if (options?.interactive === false) {
    tenantId = 'default';
    apiUrl = LOCAL_REMOTE.api;
  } else {
    const tenantIdInput = await p.text({
      message: 'Enter your tenant ID:',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Tenant ID is required';
        }
        return undefined;
      },
    });

    if (p.isCancel(tenantIdInput)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }

    tenantId = tenantIdInput;

    const validateUrl = (input: string) => {
      try {
        if (input && input.trim() !== '') {
          new URL(input);
          return undefined;
        }
        return undefined;
      } catch {
        return 'Please enter a valid URL';
      }
    };

    const apiUrlInput = await p.text({
      message: 'Enter the Agents API URL:',
      placeholder: LOCAL_REMOTE.api,
      initialValue: LOCAL_REMOTE.api,
      validate: validateUrl,
    });

    if (p.isCancel(apiUrlInput)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }

    apiUrl = apiUrlInput;
  }

  const configContent = `import { defineConfig } from '@inkeep/agents-cli/config';

export default defineConfig({
  tenantId: '${tenantId}',
  agentsApi: {
    url: '${apiUrl}',
  }
});
`;

  try {
    writeFileSync(configPath, configContent);
    console.log(chalk.green('✓'), `Created ${chalk.cyan(configPath)}`);

    // Set up local profile
    try {
      const profileManager = new ProfileManager(
        options?.profilesDir ? { profilesDir: options.profilesDir } : undefined
      );
      const localProfile: Profile = {
        remote: {
          api: apiUrl,
          manageUi: LOCAL_REMOTE.manageUi,
        },
        credential: 'none',
        environment: 'development',
      };

      if (profileManager.profilesFileExists()) {
        const config = profileManager.loadProfiles();

        if (config.profiles.local) {
          profileManager.setActiveProfile('local');
          console.log(chalk.green('✓'), 'Set local profile as active');
        } else {
          profileManager.addProfile('local', localProfile);
          profileManager.setActiveProfile('local');
          console.log(chalk.green('✓'), 'Created and activated local profile');
        }
      } else {
        const profilesConfig: ProfilesConfig = {
          activeProfile: 'local',
          profiles: {
            local: localProfile,
          },
        };

        profileManager.saveProfiles(profilesConfig);
        console.log(chalk.green('✓'), 'Created local profile');
      }
    } catch (profileError) {
      console.log(
        chalk.yellow('⚠'),
        'Could not set up local profile:',
        profileError instanceof Error ? profileError.message : String(profileError)
      );
    }

    console.log(chalk.gray('\nYou can now use the Inkeep CLI commands.'));

    const configDir = dirname(configPath);
    if (configDir !== process.cwd()) {
      console.log(chalk.gray(`\nNote: Config file created in ${configDir}`));
      console.log(
        chalk.gray(`Use --config ${configPath} with commands, or run commands from that directory.`)
      );
    }
  } catch (error) {
    console.error(chalk.red('Failed to create config file:'), error);
    process.exit(1);
  }
}

function sanitizeProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateConfigFile(tenantId: string, projectId: string): string {
  return `import { defineConfig } from '@inkeep/agents-cli/config';

export default defineConfig({
  tenantId: '${tenantId}',
  projectId: '${projectId}',
  agentsApi: {
    url: 'https://agents-api.inkeep.com',
  },
});
`;
}

function generateIndexFile(projectId: string): string {
  return `import { project } from '@inkeep/agents-sdk';

// This file was auto-generated by 'inkeep init'
// Run 'inkeep pull' to sync with your remote project

export default project({
  id: '${projectId}',
  name: '${projectId}',
  agents: {},
  tools: {},
});
`;
}

function generateEnvTemplate(environment: string): string {
  return `# ${environment.charAt(0).toUpperCase() + environment.slice(1)} Environment
# Add your API keys and secrets here

# OpenAI API Key
OPENAI_API_KEY=sk-your-key-here

# Anthropic API Key
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Add other provider keys as needed
`;
}
