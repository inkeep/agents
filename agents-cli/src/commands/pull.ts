import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as p from '@clack/prompts';
import type { FullProjectDefinition, ModelSettings } from '@inkeep/agents-core';

import chalk from 'chalk';
import { ManagementApiClient } from '../api';
import {
  DEFAULT_NAMING_CONVENTIONS,
  VariableNameGenerator,
} from '../codegen/variable-name-registry';
import type { NestedInkeepConfig } from '../config';
import { performBackgroundVersionCheck } from '../utils/background-version-check';
import { loadConfig } from '../utils/config';
import { findProjectDirectory } from '../utils/project-directory';
import { importWithTypeScriptSupport } from '../utils/tsx-loader';

export interface PullOptions {
  project?: string;
  config?: string;
  env?: string;
  json?: boolean;
  debug?: boolean;
}

interface VerificationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Detect if current directory contains a project by looking for index.ts with project export
 * Returns the project ID if found, null otherwise
 */
async function detectCurrentProject(debug: boolean = false): Promise<string | null> {
  const indexPath = join(process.cwd(), 'index.ts');

  if (debug) {
    console.log(chalk.gray(`\n[DEBUG] Detecting project in current directory...`));
    console.log(chalk.gray(`  • Current directory: ${process.cwd()}`));
    console.log(chalk.gray(`  • Looking for: ${indexPath}`));
  }

  if (!existsSync(indexPath)) {
    if (debug) {
      console.log(chalk.gray(`  • index.ts not found`));
    }
    return null;
  }

  if (debug) {
    console.log(chalk.gray(`  • index.ts found, attempting to import...`));
  }

  try {
    // Import the module with TypeScript support
    const module = await importWithTypeScriptSupport(indexPath);

    if (debug) {
      console.log(chalk.gray(`  • Module imported successfully`));
      console.log(chalk.gray(`  • Exports found: ${Object.keys(module).join(', ')}`));
    }

    // Find the first export with __type = "project"
    const exports = Object.keys(module);
    for (const exportKey of exports) {
      const value = module[exportKey];
      if (value && typeof value === 'object' && value.__type === 'project') {
        // Get the project ID
        if (typeof value.getId === 'function') {
          const projectId = value.getId();
          if (debug) {
            console.log(
              chalk.gray(`  • Project detected: ${projectId} (from export: ${exportKey})`)
            );
          }
          return projectId;
        }
      }
    }

    if (debug) {
      console.log(chalk.gray(`  • No project export found in module`));
    }
    return null;
  } catch (error: any) {
    // If we can't load the file (e.g., due to import errors), fall back to static parsing
    if (debug) {
      console.log(chalk.gray(`  • Failed to import: ${error.message}`));
      console.log(chalk.gray(`  • Falling back to static file parsing...`));
    }

    try {
      // Read the file and extract project ID using regex
      const content = readFileSync(indexPath, 'utf-8');

      // Look for pattern: project({ id: 'project-id', ... })
      // This matches both single and double quotes
      const projectIdMatch = content.match(/project\s*\(\s*\{\s*id\s*:\s*['"]([^'"]+)['"]/);

      if (projectIdMatch?.[1]) {
        const projectId = projectIdMatch[1];
        if (debug) {
          console.log(chalk.gray(`  • Project ID extracted from static parse: ${projectId}`));
        }
        return projectId;
      }

      if (debug) {
        console.log(chalk.gray(`  • Could not find project ID in file content`));
      }
      return null;
    } catch (parseError: any) {
      if (debug) {
        console.log(chalk.gray(`  • Static parsing failed: ${parseError.message}`));
      }
      return null;
    }
  }
}

/**
 * Verify that the generated TypeScript files are present and have basic validity
 * Uses static file checking rather than attempting to import/execute
 */
async function verifyGeneratedFiles(
  projectDir: string,
  originalProjectData: any,
  debug: boolean = false
): Promise<VerificationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Check that index.ts exists
    const indexPath = join(projectDir, 'index.ts');
    if (!existsSync(indexPath)) {
      errors.push('Generated index.ts file not found');
      return { success: false, errors, warnings };
    }

    // Read and check index.ts has project export
    const indexContent = readFileSync(indexPath, 'utf-8');

    // Check for project export pattern
    if (!indexContent.includes('project(')) {
      errors.push('index.ts does not contain a project() call');
    }

    // Extract and verify project ID
    const projectIdMatch = indexContent.match(/project\s*\(\s*\{\s*id\s*:\s*['"]([^'"]+)['"]/);
    if (projectIdMatch?.[1]) {
      const extractedProjectId = projectIdMatch[1];
      if (extractedProjectId !== originalProjectData.id) {
        warnings.push(
          `Project ID mismatch: expected "${originalProjectData.id}", found "${extractedProjectId}"`
        );
      }
      if (debug) {
        console.log(chalk.gray(`\n✓ Project ID verified: ${extractedProjectId}`));
      }
    } else {
      warnings.push('Could not extract project ID from index.ts');
    }

    // Check that expected agent files exist
    const agentsDir = join(projectDir, 'agents');
    const expectedAgents = Object.keys(originalProjectData.agents || {});

    for (const agentId of expectedAgents) {
      // Convert agent ID to kebab-case to match file naming convention
      const kebabCaseId = agentId
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
      const agentPath = join(agentsDir, `${kebabCaseId}.ts`);
      if (!existsSync(agentPath)) {
        errors.push(`Agent file not found: agents/${kebabCaseId}.ts`);
      } else if (debug) {
        console.log(chalk.gray(`  ✓ Agent file exists: agents/${kebabCaseId}.ts`));
      }
    }

    // Check that expected tool files exist
    const toolsDir = join(projectDir, 'tools');
    const expectedTools = Object.entries(originalProjectData.tools || {});

    // Create a filename generator to ensure consistent naming
    const filenameGenerator = new VariableNameGenerator(DEFAULT_NAMING_CONVENTIONS);

    for (const [toolId, toolData] of expectedTools) {
      // Use the same filename generation logic as the plan builder
      const fileName = filenameGenerator.generateFileName(toolId, 'tool', toolData);
      const toolPath = join(toolsDir, `${fileName}.ts`);
      if (!existsSync(toolPath)) {
        errors.push(`Tool file not found: tools/${fileName}.ts`);
      } else if (debug) {
        console.log(chalk.gray(`  ✓ Tool file exists: tools/${fileName}.ts`));
      }
    }

    // Check that expected data component files exist
    const dataComponentsDir = join(projectDir, 'data-components');
    const expectedDataComponents = Object.keys(originalProjectData.dataComponents || {});

    for (const componentId of expectedDataComponents) {
      // Convert component ID to kebab-case to match file naming convention
      const kebabCaseId = componentId
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
      const componentPath = join(dataComponentsDir, `${kebabCaseId}.ts`);
      if (!existsSync(componentPath)) {
        errors.push(`Data component file not found: data-components/${kebabCaseId}.ts`);
      } else if (debug) {
        console.log(
          chalk.gray(`  ✓ Data component file exists: data-components/${kebabCaseId}.ts`)
        );
      }
    }

    // Check that environment directory exists
    const environmentsDir = join(projectDir, 'environments');
    const hasCredentials = Object.keys(originalProjectData.credentialReferences || {}).length > 0;

    if (!existsSync(environmentsDir)) {
      if (hasCredentials) {
        errors.push('Environments directory not found (expected with credentials)');
      } else {
        warnings.push('Environments directory not found (no credentials defined)');
      }
    } else {
      const envIndexPath = join(environmentsDir, 'index.ts');
      if (!existsSync(envIndexPath)) {
        if (hasCredentials) {
          errors.push('Environment index.ts not found (expected with credentials)');
        } else {
          // Don't warn if there are no credentials - empty env directory is acceptable
          if (debug) {
            console.log(chalk.gray(`  • Environments directory exists but empty (no credentials)`));
          }
        }
      }
    }

    if (debug) {
      console.log(chalk.gray('\n🔍 Verification Summary:'));
      console.log(chalk.gray(`  • index.ts: ${existsSync(indexPath) ? '✓' : '✗'}`));
      console.log(
        chalk.gray(`  • Agent files: ${expectedAgents.length}/${expectedAgents.length} found`)
      );
      console.log(
        chalk.gray(`  • Tool files: ${expectedTools.length}/${expectedTools.length} found`)
      );
      console.log(
        chalk.gray(
          `  • Data component files: ${expectedDataComponents.length}/${expectedDataComponents.length} found`
        )
      );
    }

    return { success: errors.length === 0, errors, warnings };
  } catch (error: any) {
    errors.push(`Verification failed: ${error.message}`);
    return { success: false, errors, warnings };
  }
}

/**
 * Load and validate inkeep.config.ts using the centralized config loader
 * Converts normalized config to nested format for backward compatibility
 */
async function loadProjectConfig(
  projectDir: string,
  configPathOverride?: string
): Promise<NestedInkeepConfig> {
  const configPath = configPathOverride
    ? resolve(process.cwd(), configPathOverride)
    : join(projectDir, 'inkeep.config.ts');

  if (!existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  try {
    // Use centralized config loader
    const config = await loadConfig(configPath);

    if (!config.tenantId) {
      throw new Error('tenantId is required in inkeep.config.ts');
    }

    // Convert normalized config to nested format
    return {
      tenantId: config.tenantId,
      agentsManageApi: {
        url: config.agentsManageApiUrl || 'http://localhost:3002',
        ...(config.agentsManageApiKey && { apiKey: config.agentsManageApiKey }),
      },
      agentsRunApi: {
        url: config.agentsRunApiUrl || 'http://localhost:3003',
        ...(config.agentsRunApiKey && { apiKey: config.agentsRunApiKey }),
      },
      outputDirectory: config.outputDirectory,
    };
  } catch (error: any) {
    throw new Error(`Failed to load configuration: ${error.message}`);
  }
}

/**
 * Ensure directory exists, creating it if necessary
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Create the project directory structure
 */
function createProjectStructure(
  projectDir: string,
  projectId: string,
  useCurrentDirectory: boolean = false
): {
  projectRoot: string;
  agentsDir: string;
  toolsDir: string;
  dataComponentsDir: string;
  artifactComponentsDir: string;
  statusComponentsDir: string;
  environmentsDir: string;
  externalAgentsDir: string;
} {
  // In directory-aware mode, use the current directory as-is
  let projectRoot: string;
  if (useCurrentDirectory) {
    projectRoot = projectDir;
  } else {
    // Check if projectDir already ends with projectId to avoid nested folders
    const dirName = projectDir.split('/').pop() || projectDir;
    projectRoot = dirName === projectId ? projectDir : join(projectDir, projectId);
  }

  const agentsDir = join(projectRoot, 'agents');
  const toolsDir = join(projectRoot, 'tools');
  const dataComponentsDir = join(projectRoot, 'data-components');
  const artifactComponentsDir = join(projectRoot, 'artifact-components');
  const statusComponentsDir = join(projectRoot, 'status-components');
  const environmentsDir = join(projectRoot, 'environments');
  const externalAgentsDir = join(projectRoot, 'external-agents');

  // Create all directories
  ensureDirectoryExists(projectRoot);
  ensureDirectoryExists(agentsDir);
  ensureDirectoryExists(toolsDir);
  ensureDirectoryExists(dataComponentsDir);
  ensureDirectoryExists(artifactComponentsDir);
  ensureDirectoryExists(statusComponentsDir);
  ensureDirectoryExists(environmentsDir);
  ensureDirectoryExists(externalAgentsDir);

  return {
    projectRoot,
    agentsDir,
    toolsDir,
    dataComponentsDir,
    artifactComponentsDir,
    statusComponentsDir,
    environmentsDir,
    externalAgentsDir,
  };
}

/**
 * Main pull command
 */
export async function pullProjectCommand(options: PullOptions): Promise<void> {
  // Perform background version check (non-blocking)
  performBackgroundVersionCheck();

  // Detect available LLM provider based on API keys
  let provider: 'anthropic' | 'openai' | 'google';
  try {
    const { detectAvailableProvider } = await import('./pull.llm-generate');
    provider = detectAvailableProvider();
    console.log(
      chalk.gray(
        `\n🤖 Using ${provider.charAt(0).toUpperCase() + provider.slice(1)} for code generation`
      )
    );
  } catch (error: any) {
    console.error(chalk.red('\n❌ Error: No LLM provider API key found'));
    console.error(
      chalk.yellow(
        '\nThe pull command requires AI to generate TypeScript files from your project configuration.'
      )
    );
    console.error(chalk.yellow('You must provide an API key for one of these providers:\n'));
    console.error(chalk.cyan('Options:'));
    console.error(chalk.gray('  • Anthropic: https://console.anthropic.com/'));
    console.error(chalk.gray('    Set: ANTHROPIC_API_KEY=your_api_key_here\n'));
    console.error(chalk.gray('  • OpenAI: https://platform.openai.com/'));
    console.error(chalk.gray('    Set: OPENAI_API_KEY=your_api_key_here\n'));
    console.error(chalk.gray('  • Google: https://ai.google.dev/'));
    console.error(chalk.gray('    Set: GOOGLE_API_KEY=your_api_key_here\n'));
    console.error(chalk.yellow('💡 Note: Set the key in your environment or .env file'));
    process.exit(1);
  }

  const s = p.spinner();
  s.start('Loading configuration...');

  try {
    let config: any = null;
    let configFound = false;
    let configLocation = '';

    // Determine initial search directory for config
    const searchDir = process.cwd();

    // If a specific config file was provided, use that
    if (options.config) {
      const configPath = resolve(process.cwd(), options.config);
      if (existsSync(configPath)) {
        try {
          config = await loadProjectConfig(dirname(configPath), options.config);
          configFound = true;
          configLocation = configPath;
        } catch (error) {
          s.stop('Failed to load specified configuration file');
          console.error(
            chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`)
          );
          process.exit(1);
        }
      } else {
        s.stop(`Specified configuration file not found: ${configPath}`);
        process.exit(1);
      }
    }

    // If no config specified, search for inkeep.config.ts
    if (!configFound) {
      // Check current directory first
      const currentConfigPath = join(searchDir, 'inkeep.config.ts');
      if (existsSync(currentConfigPath)) {
        try {
          config = await loadProjectConfig(searchDir);
          configFound = true;
          configLocation = currentConfigPath;
        } catch (_error) {
          console.log(chalk.yellow('⚠️  Failed to load configuration from current directory'));
        }
      }

      // Check parent directory if not found in current
      if (!configFound) {
        const parentConfigPath = join(searchDir, '..', 'inkeep.config.ts');
        if (existsSync(parentConfigPath)) {
          try {
            config = await loadProjectConfig(join(searchDir, '..'));
            configFound = true;
            configLocation = parentConfigPath;
          } catch (_error) {
            console.log(chalk.yellow('⚠️  Failed to load configuration from parent directory'));
          }
        }
      }

      // Use find-up as last resort
      if (!configFound) {
        const { findUp } = await import('find-up');
        const foundConfigPath = await findUp('inkeep.config.ts', { cwd: searchDir });
        if (foundConfigPath) {
          try {
            config = await loadProjectConfig(dirname(foundConfigPath));
            configFound = true;
            configLocation = foundConfigPath;
          } catch (_error) {
            console.log(chalk.yellow('⚠️  Failed to load configuration from found path'));
          }
        }
      }
    }

    if (!configFound || !config) {
      s.stop('No inkeep.config.ts found');
      console.error(chalk.red('Configuration file is required for pull command'));
      console.log(
        chalk.yellow('Please create an inkeep.config.ts file with your tenantId and API settings')
      );
      console.log(chalk.gray('Searched in:'));
      console.log(chalk.gray(`  • Current directory: ${searchDir}`));
      console.log(chalk.gray(`  • Parent directory: ${join(searchDir, '..')}`));
      console.log(chalk.gray(`  • Parent directories up to root`));
      process.exit(1);
    }

    s.stop(`Configuration loaded from ${configLocation}`);

    // Now determine base directory, considering outputDirectory from config
    s.start('Determining output directory...');
    let baseDir: string;

    if (options.project) {
      // If project path is specified, use it
      baseDir = options.project;
    } else if (config.outputDirectory && config.outputDirectory !== 'default') {
      // Use outputDirectory from config if specified and not 'default'
      baseDir = resolve(process.cwd(), config.outputDirectory);
    } else {
      // Find the src directory by looking for package.json
      const projectRoot = await findProjectDirectory();
      if (projectRoot) {
        // Check if there's a src directory
        const srcPath = join(projectRoot, 'src');
        baseDir = existsSync(srcPath) ? srcPath : projectRoot;
      } else {
        // Use current directory as fallback
        baseDir = process.cwd();
      }
    }

    s.stop(`Output directory: ${baseDir}`);

    // Build final config from loaded config file
    const finalConfig = {
      tenantId: config.tenantId,
      projectId: '', // Will be determined from API response or user input
      agentsManageApiUrl: config.agentsManageApi.url,
      agentsManageApiKey: config.agentsManageApi.apiKey,
    };

    // Detect if current directory is a project directory
    s.start('Detecting project in current directory...');
    const currentProjectId = await detectCurrentProject(options.debug);
    let useCurrentDirectory = false;

    // Determine project ID based on directory awareness
    if (options.project) {
      // If --project arg is provided AND we're in a project directory, show error
      if (currentProjectId) {
        s.stop('Conflicting project specification');
        console.error(
          chalk.red('Error: Cannot specify --project argument when in a project directory')
        );
        console.error(chalk.yellow(`  • Current directory project: ${currentProjectId}`));
        console.error(chalk.yellow(`  • Specified project argument: ${options.project}`));
        console.error(chalk.gray('\nTo pull to this directory, run without --project argument:'));
        console.error(chalk.gray('  inkeep pull'));
        console.error(
          chalk.gray('\nTo pull a different project, run from a non-project directory.')
        );
        process.exit(1);
      }
      // Extract project ID from path if it's a directory name
      const projectIdFromPath = options.project.split('/').pop() || options.project;
      finalConfig.projectId = projectIdFromPath;
    } else if (currentProjectId) {
      // If no --project arg but we're in a project directory, use that project
      finalConfig.projectId = currentProjectId;
      useCurrentDirectory = true;
      baseDir = process.cwd(); // Override baseDir to use current directory, not parent where config was found
      s.stop(`Detected project in current directory: ${currentProjectId}`);
      console.log(chalk.gray(`  • Will pull to current directory (directory-aware mode)`));
    } else {
      // No --project arg and not in a project directory, prompt for project ID
      s.stop();
      const projectId = await p.text({
        message: 'Enter the project ID to pull:',
        validate: (value) => (value ? undefined : 'Project ID is required'),
      });

      if (p.isCancel(projectId)) {
        p.cancel('Operation cancelled');
        process.exit(1);
      }

      finalConfig.projectId = projectId;
      s.start('Configuration loaded');
    }

    s.stop('Configuration loaded');
    console.log(chalk.gray('Configuration:'));
    console.log(chalk.gray(`  • Tenant ID: ${finalConfig.tenantId}`));
    console.log(chalk.gray(`  • Project ID: ${finalConfig.projectId}`));
    console.log(chalk.gray(`  • API URL: ${finalConfig.agentsManageApiUrl}`));

    // Fetch project data using API client
    s.start('Fetching project data from backend...');
    const apiClient = await ManagementApiClient.create(
      finalConfig.agentsManageApiUrl,
      options.config, // Pass the config path from options
      finalConfig.tenantId,
      finalConfig.projectId
    );
    const projectData: FullProjectDefinition = await apiClient.getFullProject(
      finalConfig.projectId
    );
    s.stop('Project data fetched');

    // Show project summary
    const agentCount = Object.keys(projectData.agents || {}).length;
    const toolCount = Object.keys(projectData.tools || {}).length;
    const subAgentCount = Object.values(projectData.agents || {}).reduce((total, agent) => {
      return total + Object.keys(agent.subAgents || {}).length;
    }, 0);

    const dataComponentCount = Object.keys(projectData.dataComponents || {}).length;
    const artifactComponentCount = Object.keys(projectData.artifactComponents || {}).length;

    // Count status components from agents
    const statusComponentCount = Object.values(projectData.agents || {}).reduce((total, agent) => {
      const agentObj = agent as any;
      const statusComponents = agentObj.statusUpdates?.statusComponents || [];
      return total + statusComponents.length;
    }, 0);

    const externalAgentCount = Object.keys(projectData.externalAgents || {}).reduce(
      (total, agent) => {
        const agentObj = agent as any;
        return total + Object.keys(agentObj.subAgents || {}).length;
      },
      0
    );

    console.log(chalk.cyan('\n📊 Project Summary:'));
    console.log(chalk.gray(`  • Name: ${projectData.name}`));
    console.log(chalk.gray(`  • Description: ${projectData.description || 'No description'}`));
    console.log(chalk.gray(`  • Agents: ${agentCount}`));
    console.log(chalk.gray(`  • Tools: ${toolCount}`));
    console.log(chalk.gray(`  • SubAgents: ${subAgentCount}`));
    if (dataComponentCount > 0) {
      console.log(chalk.gray(`  • Data Components: ${dataComponentCount}`));
    }
    if (artifactComponentCount > 0) {
      console.log(chalk.gray(`  • Artifact Components: ${artifactComponentCount}`));
    }
    if (statusComponentCount > 0) {
      console.log(chalk.gray(`  • Status Components: ${statusComponentCount}`));
    }
    if (externalAgentCount > 0) {
      console.log(chalk.gray(`  • External Agents: ${externalAgentCount}`));
    }

    // Display credential tracking information
    const credentialReferences = projectData.credentialReferences || {};
    const credentialCount = Object.keys(credentialReferences).length;

    if (credentialCount > 0) {
      console.log(chalk.cyan('\n🔐 Credentials Found:'));
      console.log(chalk.gray(`  • Total credentials: ${credentialCount}`));

      // Show credential details
      for (const [credId, credData] of Object.entries(credentialReferences)) {
        const credType = (credData as any).type || 'unknown';
        const storeId = (credData as any).credentialStoreId || 'unknown';

        console.log(chalk.gray(`  • ${credId} (${credType}, store: ${storeId})`));

        // Show usage information if available
        const usageInfo = (credData as any).usedBy;
        if (usageInfo && Array.isArray(usageInfo) && usageInfo.length > 0) {
          const usageByType: Record<string, number> = {};
          for (const usage of usageInfo) {
            usageByType[usage.type] = (usageByType[usage.type] || 0) + 1;
          }

          const usageSummary = Object.entries(usageByType)
            .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
            .join(', ');

          console.log(chalk.gray(`      Used by: ${usageSummary}`));
        }
      }

      console.log(
        chalk.yellow(
          `  ⚠️  Environment file (${options.env || 'development'}.env.ts) will be generated with credential references`
        )
      );
    }

    // Create project directory structure
    s.start('Creating project structure...');
    const dirs = createProjectStructure(baseDir, finalConfig.projectId, useCurrentDirectory);
    s.stop('Project structure created');

    if (options.json) {
      // Save as JSON file
      const jsonFilePath = join(dirs.projectRoot, `${finalConfig.projectId}.json`);
      writeFileSync(jsonFilePath, JSON.stringify(projectData, null, 2));

      s.stop(`Project data saved to ${jsonFilePath}`);
      console.log(chalk.green(`✅ JSON file created: ${jsonFilePath}`));
    }

    // NEW PLANNING-BASED APPROACH

    // Step 1: Analyze existing patterns (if project exists)
    s.start('Analyzing existing code patterns...');
    const { analyzeExistingPatterns } = await import('../codegen/pattern-analyzer');
    const { DEFAULT_NAMING_CONVENTIONS } = await import('../codegen/variable-name-registry');

    let patterns = await analyzeExistingPatterns(dirs.projectRoot);

    if (patterns) {
      s.stop('Patterns detected from existing code');
      const { displayPatternSummary } = await import('../codegen/display-utils');
      displayPatternSummary(patterns);
    } else {
      s.stop('Using recommended pattern for new project');
      const { displayRecommendedPattern } = await import('../codegen/display-utils');
      displayRecommendedPattern();

      // Create default patterns
      const RECOMMENDED_PATTERN = {
        fileStructure: {
          toolsLocation: 'separate' as const,
          agentsLocation: 'flat' as const,
          preferredFileNaming: 'kebab-case' as const,
          hasToolsDirectory: true,
          hasAgentsDirectory: true,
          hasDataComponentsDirectory: true,
          hasArtifactComponentsDirectory: true,
          hasExternalAgentsDirectory: true,
          hasEnvironmentsDirectory: true,
        },
        namingConventions: DEFAULT_NAMING_CONVENTIONS,
        codeStyle: {
          exportNaming: 'camelCase' as const,
          multiLineStrings: 'template-literals' as const,
          importStyle: 'named' as const,
          preferredQuotes: 'single' as const,
        },
        examples: {
          mappings: [],
        },
      };
      patterns = RECOMMENDED_PATTERN as any;
    }

    // Ensure patterns is not null before proceeding
    if (!patterns) {
      throw new Error('Failed to determine code patterns');
    }

    // Step 2: Generate plan using LLM
    s.start('Generating file structure plan...');
    const { generatePlan } = await import('../codegen/plan-builder');
    const { createModel, getDefaultModelForProvider, getModelConfigWithReasoning } = await import(
      './pull.llm-generate'
    );

    // Get model and reasoning config based on detected provider
    const selectedModel = getDefaultModelForProvider(provider);
    const reasoningConfig = getModelConfigWithReasoning(provider);

    const modelSettings: ModelSettings = {
      model: selectedModel,
    };

    if (options.debug) {
      console.log(chalk.gray(`\n📍 Debug: Model selected: ${selectedModel}`));
      console.log(
        chalk.gray(
          `📍 Debug: Reasoning enabled: ${Object.keys(reasoningConfig).length > 0 ? 'Yes' : 'No'}`
        )
      );
    }

    const targetEnvironment = options.env || 'development';
    const plan = await generatePlan(
      projectData,
      patterns,
      modelSettings,
      createModel,
      targetEnvironment
    );
    s.stop('Generation plan created');

    // Step 3: Display plan and conflicts
    const { displayPlanSummary, displayConflictWarning } = await import('../codegen/display-utils');
    displayPlanSummary(plan);
    displayConflictWarning(plan.metadata.conflicts);

    // Step 4: Generate files from plan using unified generator
    s.start('Generating project files with LLM...');
    const { generateFilesFromPlan } = await import('../codegen/unified-generator');

    const generationStart = Date.now();
    await generateFilesFromPlan(
      plan,
      projectData,
      dirs,
      modelSettings,
      options.debug || false,
      reasoningConfig // Pass reasoning config for enhanced code generation
    );
    const generationDuration = Date.now() - generationStart;

    s.stop('Project files generated');

    const { displayGenerationComplete } = await import('../codegen/display-utils');
    displayGenerationComplete(plan, generationDuration);

    // Step 5: Save plan to .inkeep/ directory
    const { savePlan, ensureGitignore } = await import('../codegen/plan-storage');
    savePlan(dirs.projectRoot, plan);
    ensureGitignore(dirs.projectRoot);

    if (options.debug) {
      console.log(chalk.gray('\n📍 Plan saved to .inkeep/generation-plan.json'));
    }

    // Count generated files for summary
    const statusComponentsCount = Object.values(projectData.agents || {}).reduce((total, agent) => {
      const agentObj = agent as any;
      const statusComponents = agentObj.statusUpdates?.statusComponents || [];
      return total + statusComponents.length;
    }, 0);

    const fileCount = {
      agents: Object.keys(projectData.agents || {}).length,
      tools: Object.keys(projectData.tools || {}).length,
      dataComponents: Object.keys(projectData.dataComponents || {}).length,
      artifactComponents: Object.keys(projectData.artifactComponents || {}).length,
      externalAgents: Object.keys(projectData.externalAgents || {}).length,
      statusComponents: statusComponentsCount,
    };
    const totalFiles =
      fileCount.agents +
      fileCount.tools +
      fileCount.dataComponents +
      fileCount.artifactComponents +
      fileCount.externalAgents +
      fileCount.statusComponents +
      5; // +1 for index.ts, +4 for environment files (index.ts, development.env.ts, staging.env.ts, production.env.ts)

    s.stop(`Project files generated (${totalFiles} files created)`);

    // Verification step: ensure generated TS files can reconstruct the original JSON
    s.start('Verifying generated files...');
    try {
      const verificationResult = await verifyGeneratedFiles(
        dirs.projectRoot,
        projectData,
        options.debug || false
      );
      if (verificationResult.success) {
        s.stop('Generated files verified successfully');
        if (options.debug && verificationResult.warnings.length > 0) {
          console.log(chalk.yellow('\n⚠️  Verification warnings:'));
          verificationResult.warnings.forEach((warning) => {
            console.log(chalk.gray(`  • ${warning}`));
          });
        }
      } else {
        s.stop('Generated files verification failed');
        console.error(chalk.red('\n❌ Verification errors:'));
        verificationResult.errors.forEach((error) => {
          console.error(chalk.red(`  • ${error}`));
        });
        if (verificationResult.warnings.length > 0) {
          console.log(chalk.yellow('\n⚠️  Verification warnings:'));
          verificationResult.warnings.forEach((warning) => {
            console.log(chalk.gray(`  • ${warning}`));
          });
        }
        console.log(
          chalk.gray('\nThe generated files may not accurately represent the pulled project.')
        );
        console.log(
          chalk.gray('This could indicate an issue with the LLM generation or schema mappings.')
        );

        // Don't exit - still show success but warn user
      }
    } catch (error: any) {
      s.stop('Verification failed');
      console.error(chalk.red('Verification error:'), error.message);
      console.log(chalk.gray('Proceeding without verification...'));
    }

    console.log(chalk.green('\n✨ Project pulled successfully!'));
    console.log(chalk.cyan('\n📁 Generated structure:'));
    console.log(chalk.gray(`  ${dirs.projectRoot}/`));
    console.log(chalk.gray(`  ├── index.ts`));
    if (fileCount.agents > 0) {
      console.log(chalk.gray(`  ├── agents/ (${fileCount.agents} files)`));
    }
    if (fileCount.tools > 0) {
      console.log(chalk.gray(`  ├── tools/ (${fileCount.tools} files)`));
    }
    if (fileCount.externalAgents > 0) {
      console.log(chalk.gray(`  ├── external-agents/ (${fileCount.externalAgents} files)`));
    }
    if (fileCount.dataComponents > 0) {
      console.log(chalk.gray(`  ├── data-components/ (${fileCount.dataComponents} files)`));
    }
    if (fileCount.artifactComponents > 0) {
      console.log(chalk.gray(`  ├── artifact-components/ (${fileCount.artifactComponents} files)`));
    }
    if (fileCount.statusComponents > 0) {
      console.log(chalk.gray(`  ├── status-components/ (${fileCount.statusComponents} files)`));
    }
    console.log(chalk.gray('  └── environments/ (4 files)'));

    console.log(chalk.cyan('\n📝 Next steps:'));
    console.log(chalk.gray(`  • cd ${dirs.projectRoot}`));
    console.log(chalk.gray('  • Review the generated files'));
    console.log(chalk.gray('  • Test locally: inkeep push'));
    console.log(
      chalk.gray('  • Commit changes: git add . && git commit -m "Add project from pull"')
    );
  } catch (error: any) {
    s.stop('Failed to pull project');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}
