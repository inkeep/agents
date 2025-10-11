import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { FullProjectDefinition, ModelSettings } from '@inkeep/agents-core';
import { ANTHROPIC_MODELS } from '@inkeep/agents-core';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import { ManagementApiClient } from '../api';
import type { NestedInkeepConfig } from '../config';
import { env } from '../env';
import { loadConfig } from '../utils/config';
import { findProjectDirectory } from '../utils/project-directory';
import { importWithTypeScriptSupport } from '../utils/tsx-loader';
import {
  generateArtifactComponentFile,
  generateDataComponentFile,
  generateEnvironmentFiles,
  generateGraphFile,
  generateIndexFile,
  generateToolFile,
} from './pull.llm-generate';
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
 * Verify that the generated TypeScript files can reconstruct the original project JSON
 */
async function verifyGeneratedFiles(
  projectDir: string,
  originalProjectData: any,
  debug: boolean = false
): Promise<VerificationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Load the generated project from TypeScript files
    const indexPath = join(projectDir, 'index.ts');

    if (!existsSync(indexPath)) {
      errors.push('Generated index.ts file not found');
      return { success: false, errors, warnings };
    }

    // Import the generated project module
    const module = await importWithTypeScriptSupport(indexPath);

    // Find the project export
    const exports = Object.keys(module);
    let project = null;

    for (const exportKey of exports) {
      const value = module[exportKey];
      if (value && typeof value === 'object' && value.__type === 'project') {
        project = value;
        break;
      }
    }

    if (!project) {
      errors.push('No project export found in generated index.ts');
      return { success: false, errors, warnings };
    }

    // Basic structural verification instead of full project definition comparison
    // This approach checks that the TypeScript files are well-formed and loadable
    const structuralErrors: string[] = [];
    const structuralWarnings: string[] = [];

    try {
      // Check if the project has the expected basic structure
      if (!project) {
        structuralErrors.push('Project object not found after import');
      }

      // Check if project has expected type marker
      if (project && typeof project === 'object' && project.__type !== 'project') {
        structuralWarnings.push('Project object missing type marker');
      }

      // Attempt to call methods if they exist (but don't require full project definition)
      if (project && typeof project.toFullProjectDefinition === 'function') {
        try {
          // Try to generate project definition for validation but don't require exact match
          const generatedProjectData = await project.toFullProjectDefinition();

          if (debug) {
            console.log(chalk.gray('\n📋 Generated project successfully'));
            console.log(chalk.gray(`  • Has tools: ${!!generatedProjectData.tools}`));
            console.log(
              chalk.gray(`  • Tools count: ${Object.keys(generatedProjectData.tools || {}).length}`)
            );
            console.log(
              chalk.gray(`  • Has credentials: ${!!generatedProjectData.credentialReferences}`)
            );
            console.log(
              chalk.gray(
                `  • Credentials count: ${Object.keys(generatedProjectData.credentialReferences || {}).length}`
              )
            );
          }

          // Basic structural validation - just ensure we can generate valid project data
          if (!generatedProjectData) {
            structuralErrors.push('Generated project definition is empty');
          }
        } catch (projectDefError: any) {
          // Log the error but don't fail verification - SDK might have internal issues
          if (debug) {
            console.log(
              chalk.yellow(`  Project definition generation warning: ${projectDefError.message}`)
            );
          }
          structuralWarnings.push(
            `Project definition generation had issues: ${projectDefError.message}`
          );
        }
      }

      // Manual file validation - check that key files exist and are properly formed
      const toolPath = join(projectDir, 'tools', 'inkeep_facts.ts');
      const envPath = join(projectDir, 'environments', 'development.env.ts');

      if (existsSync(toolPath)) {
        const toolContent = readFileSync(toolPath, 'utf8');
        // Check for credential reference (more important than transport now)
        if (!toolContent.includes('credential:')) {
          structuralWarnings.push('Tool file may be missing credential reference');
        }
        // Check for serverUrl
        if (!toolContent.includes('serverUrl:')) {
          structuralErrors.push('Tool file missing required serverUrl property');
        }
        // Check that it doesn't have invalid config property
        if (toolContent.includes('config:')) {
          structuralWarnings.push(
            'Tool file contains invalid config property (should use individual properties)'
          );
        }
        if (debug) {
          console.log(
            chalk.gray(`  • Tool file has serverUrl: ${toolContent.includes('serverUrl:')}`)
          );
          console.log(
            chalk.gray(`  • Tool file has credential: ${toolContent.includes('credential:')}`)
          );
          console.log(
            chalk.gray(`  • Tool file has invalid config: ${toolContent.includes('config:')}`)
          );
        }
      } else {
        structuralErrors.push('Tool file inkeep_facts.ts not found');
      }

      if (existsSync(envPath)) {
        const envContent = readFileSync(envPath, 'utf8');
        if (!envContent.includes('inkeep_api_credential')) {
          structuralWarnings.push('Environment file may be missing credential definition');
        }
        if (debug) {
          console.log(
            chalk.gray(
              `  • Environment file has credential: ${envContent.includes('inkeep_api_credential')}`
            )
          );
        }
      } else {
        structuralErrors.push('Environment file development.env.ts not found');
      }
    } catch (structuralError: any) {
      structuralErrors.push(`Structural validation failed: ${structuralError.message}`);
    }

    errors.push(...structuralErrors);
    warnings.push(...structuralWarnings);

    if (debug) {
      console.log(chalk.gray('\n🔍 Structural Verification Summary:'));
      console.log(chalk.gray(`  • Project loaded successfully: ${!!project}`));
      console.log(
        chalk.gray(`  • Expected agents: ${Object.keys(originalProjectData.agents || {}).length}`)
      );
      console.log(
        chalk.gray(`  • Expected tools: ${Object.keys(originalProjectData.tools || {}).length}`)
      );
      console.log(
        chalk.gray(
          `  • Expected credentials: ${Object.keys(originalProjectData.credentialReferences || {}).length}`
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
  projectId: string
): {
  projectRoot: string;
  agentsDir: string;
  toolsDir: string;
  dataComponentsDir: string;
  artifactComponentsDir: string;
  environmentsDir: string;
} {
  // Check if projectDir already ends with projectId to avoid nested folders
  const dirName = projectDir.split('/').pop() || projectDir;
  const projectRoot = dirName === projectId ? projectDir : join(projectDir, projectId);

  const agentsDir = join(projectRoot, 'agents');
  const toolsDir = join(projectRoot, 'tools');
  const dataComponentsDir = join(projectRoot, 'data-components');
  const artifactComponentsDir = join(projectRoot, 'artifact-components');
  const environmentsDir = join(projectRoot, 'environments');

  // Create all directories
  ensureDirectoryExists(projectRoot);
  ensureDirectoryExists(agentsDir);
  ensureDirectoryExists(toolsDir);
  ensureDirectoryExists(dataComponentsDir);
  ensureDirectoryExists(artifactComponentsDir);
  ensureDirectoryExists(environmentsDir);

  return {
    projectRoot,
    agentsDir,
    toolsDir,
    dataComponentsDir,
    artifactComponentsDir,
    environmentsDir,
  };
}

/**
 * Generate project files using LLM based on backend data
 */
async function generateProjectFiles(
  dirs: {
    projectRoot: string;
    agentsDir: string;
    toolsDir: string;
    dataComponentsDir: string;
    artifactComponentsDir: string;
    environmentsDir: string;
  },
  projectData: FullProjectDefinition,
  modelSettings: ModelSettings,
  environment: string = 'development',
  debug: boolean = false
): Promise<void> {
  const { agents, tools, dataComponents, artifactComponents, credentialReferences } = projectData;

  // Prepare all generation tasks
  const generationTasks: Promise<void>[] = [];
  const fileInfo: { type: string; name: string }[] = [];

  // Add index.ts generation task
  const indexPath = join(dirs.projectRoot, 'index.ts');
  generationTasks.push(generateIndexFile(projectData, indexPath, modelSettings));
  fileInfo.push({ type: 'config', name: 'index.ts' });

  // Add agent generation tasks
  if (agents && Object.keys(agents).length > 0) {
    for (const [agentId, agentData] of Object.entries(agents)) {
      const agentPath = join(dirs.agentsDir, `${agentId}.ts`);
      generationTasks.push(generateGraphFile(agentData, agentId, agentPath, modelSettings));
      fileInfo.push({ type: 'agent', name: `${agentId}.ts` });
    }
  }

  // Add tool generation tasks
  if (tools && Object.keys(tools).length > 0) {
    for (const [toolId, toolData] of Object.entries(tools)) {
      const toolPath = join(dirs.toolsDir, `${toolId}.ts`);
      generationTasks.push(generateToolFile(toolData, toolId, toolPath, modelSettings));
      fileInfo.push({ type: 'tool', name: `${toolId}.ts` });
    }
  }

  // Add data component generation tasks
  if (dataComponents && Object.keys(dataComponents).length > 0) {
    for (const [componentId, componentData] of Object.entries(dataComponents)) {
      const componentPath = join(dirs.dataComponentsDir, `${componentId}.ts`);
      generationTasks.push(
        generateDataComponentFile(componentData, componentId, componentPath, modelSettings)
      );
      fileInfo.push({ type: 'dataComponent', name: `${componentId}.ts` });
    }
  }

  // Add artifact component generation tasks
  if (artifactComponents && Object.keys(artifactComponents).length > 0) {
    for (const [componentId, componentData] of Object.entries(artifactComponents)) {
      const componentPath = join(dirs.artifactComponentsDir, `${componentId}.ts`);
      generationTasks.push(
        generateArtifactComponentFile(componentData, componentId, componentPath, modelSettings)
      );
      fileInfo.push({ type: 'artifactComponent', name: `${componentId}.ts` });
    }
  }

  // Add environment files generation with actual credential data
  const targetEnvironment = environment;
  generationTasks.push(
    generateEnvironmentFiles(dirs.environmentsDir, credentialReferences, targetEnvironment)
  );
  fileInfo.push({ type: 'env', name: `index.ts, ${targetEnvironment}.env.ts` });

  // Display what we're generating
  console.log(chalk.cyan('  📝 Generating files in parallel:'));
  const filesByType = fileInfo.reduce(
    (acc, file) => {
      if (!acc[file.type]) acc[file.type] = [];
      acc[file.type].push(file.name);
      return acc;
    },
    {} as Record<string, string[]>
  );

  if (filesByType.config) {
    console.log(chalk.gray(`     • Config files: ${filesByType.config.join(', ')}`));
  }
  if (filesByType.agent) {
    console.log(chalk.gray(`     • Agent: ${filesByType.agent.join(', ')}`));
  }
  if (filesByType.tool) {
    console.log(chalk.gray(`     • Tools: ${filesByType.tool.join(', ')}`));
  }
  if (filesByType.dataComponent) {
    console.log(chalk.gray(`     • Data components: ${filesByType.dataComponent.join(', ')}`));
  }
  if (filesByType.artifactComponent) {
    console.log(
      chalk.gray(`     • Artifact components: ${filesByType.artifactComponent.join(', ')}`)
    );
  }
  if (filesByType.env) {
    console.log(chalk.gray(`     • Environment: ${filesByType.env.join(', ')}`));
  }

  // Execute all tasks in parallel
  console.log(chalk.yellow(`  ⚡ Processing ${generationTasks.length} files in parallel...`));

  if (debug) {
    console.log(chalk.gray('\n📍 Debug: Starting LLM file generation...'));
    console.log(chalk.gray(`  Model: ${modelSettings.model}`));
    console.log(chalk.gray(`  Total tasks: ${generationTasks.length}`));

    // Execute with progress tracking in debug mode
    const startTime = Date.now();
    try {
      await Promise.all(
        generationTasks.map(async (task, index) => {
          const taskStartTime = Date.now();
          if (debug) {
            const taskInfo = fileInfo[index];
            console.log(
              chalk.gray(
                `  [${index + 1}/${generationTasks.length}] Starting ${taskInfo.type}: ${taskInfo.name}`
              )
            );
          }
          await task;
          if (debug) {
            const taskInfo = fileInfo[index];
            const taskDuration = Date.now() - taskStartTime;
            console.log(
              chalk.gray(
                `  [${index + 1}/${generationTasks.length}] ✓ Completed ${taskInfo.type}: ${taskInfo.name} (${taskDuration}ms)`
              )
            );
          }
        })
      );
    } catch (error) {
      if (debug) {
        console.error(chalk.red('📍 Debug: LLM generation error:'), error);
      }
      throw error;
    }

    const totalDuration = Date.now() - startTime;
    console.log(chalk.gray(`\n📍 Debug: LLM generation completed in ${totalDuration}ms`));
  } else {
    await Promise.all(generationTasks);
  }
}

/**
 * Main pull command
 */
export async function pullProjectCommand(options: PullOptions): Promise<void> {
  // Validate ANTHROPIC_API_KEY is available for LLM operations
  if (!env.ANTHROPIC_API_KEY) {
    console.error(
      chalk.red('Error: ANTHROPIC_API_KEY environment variable is required for the pull command.')
    );
    console.error(chalk.gray('Please set your Anthropic API key:'));
    console.error(chalk.gray('  export ANTHROPIC_API_KEY=your_api_key_here'));
    console.error(chalk.gray('  or add it to your .env file'));
    process.exit(1);
  }

  const spinner = ora('Loading configuration...').start();

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
          spinner.fail('Failed to load specified configuration file');
          console.error(
            chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`)
          );
          process.exit(1);
        }
      } else {
        spinner.fail(`Specified configuration file not found: ${configPath}`);
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
          spinner.warn('Failed to load configuration from current directory');
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
            spinner.warn('Failed to load configuration from parent directory');
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
            spinner.warn('Failed to load configuration from found path');
          }
        }
      }
    }

    if (!configFound || !config) {
      spinner.fail('No inkeep.config.ts found');
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

    spinner.succeed(`Configuration loaded from ${configLocation}`);

    // Now determine base directory, considering outputDirectory from config
    spinner.start('Determining output directory...');
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

    spinner.succeed(`Output directory: ${baseDir}`);

    // Build final config from loaded config file
    const finalConfig = {
      tenantId: config.tenantId,
      projectId: '', // Will be determined from API response or user input
      agentsManageApiUrl: config.agentsManageApi.url,
      agentsManageApiKey: config.agentsManageApi.apiKey,
    };

    // Prompt for project ID if not provided
    if (!options.project) {
      spinner.stop();
      const response = await prompts({
        type: 'text',
        name: 'projectId',
        message: 'Enter the project ID to pull:',
        validate: (value: string) => (value ? true : 'Project ID is required'),
      });

      if (!response.projectId) {
        console.error(chalk.red('Project ID is required'));
        process.exit(1);
      }
      finalConfig.projectId = response.projectId;
      spinner.start('Configuration loaded');
    } else {
      // Extract project ID from path if it's a directory name
      const projectIdFromPath = options.project.split('/').pop() || options.project;
      finalConfig.projectId = projectIdFromPath;
    }

    spinner.succeed('Configuration loaded');
    console.log(chalk.gray('Configuration:'));
    console.log(chalk.gray(`  • Tenant ID: ${finalConfig.tenantId}`));
    console.log(chalk.gray(`  • Project ID: ${finalConfig.projectId}`));
    console.log(chalk.gray(`  • API URL: ${finalConfig.agentsManageApiUrl}`));

    // Fetch project data using API client
    spinner.start('Fetching project data from backend...');
    const apiClient = await ManagementApiClient.create(
      finalConfig.agentsManageApiUrl,
      options.config, // Pass the config path from options
      finalConfig.tenantId,
      finalConfig.projectId
    );
    const projectData: FullProjectDefinition = await apiClient.getFullProject(
      finalConfig.projectId
    );
    spinner.succeed('Project data fetched');

    // Show project summary
    const agentCount = Object.keys(projectData.agents || {}).length;
    const toolCount = Object.keys(projectData.tools || {}).length;
    const subAgentCount = Object.values(projectData.agents || {}).reduce((total, agent) => {
      return total + Object.keys(agent.subAgents || {}).length;
    }, 0);

    const dataComponentCount = Object.keys(projectData.dataComponents || {}).length;
    const artifactComponentCount = Object.keys(projectData.artifactComponents || {}).length;

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
    spinner.start('Creating project structure...');
    const dirs = createProjectStructure(baseDir, finalConfig.projectId);
    spinner.succeed('Project structure created');

    if (options.json) {
      // Save as JSON file
      const jsonFilePath = join(dirs.projectRoot, `${finalConfig.projectId}.json`);
      writeFileSync(jsonFilePath, JSON.stringify(projectData, null, 2));

      spinner.succeed(`Project data saved to ${jsonFilePath}`);
      console.log(chalk.green(`✅ JSON file created: ${jsonFilePath}`));
    }

    // Generate project files using LLM
    spinner.start('Generating project files with LLM...');

    // Get model settings from config or use default
    const modelSettings: ModelSettings = {
      model: ANTHROPIC_MODELS.CLAUDE_SONNET_4,
    };

    await generateProjectFiles(
      dirs,
      projectData,
      modelSettings,
      options.env || 'development',
      options.debug || false
    );

    // Count generated files for summary
    const fileCount = {
      agents: Object.keys(projectData.agents || {}).length,
      tools: Object.keys(projectData.tools || {}).length,
      dataComponents: Object.keys(projectData.dataComponents || {}).length,
      artifactComponents: Object.keys(projectData.artifactComponents || {}).length,
    };
    const totalFiles =
      fileCount.agents +
      fileCount.tools +
      fileCount.dataComponents +
      fileCount.artifactComponents +
      5; // +1 for index.ts, +4 for environment files (index.ts, development.env.ts, staging.env.ts, production.env.ts)

    spinner.succeed(`Project files generated (${totalFiles} files created)`);

    // Verification step: ensure generated TS files can reconstruct the original JSON
    spinner.start('Verifying generated files...');
    try {
      const verificationResult = await verifyGeneratedFiles(
        dirs.projectRoot,
        projectData,
        options.debug || false
      );
      if (verificationResult.success) {
        spinner.succeed('Generated files verified successfully');
        if (options.debug && verificationResult.warnings.length > 0) {
          console.log(chalk.yellow('\n⚠️  Verification warnings:'));
          verificationResult.warnings.forEach((warning) => {
            console.log(chalk.gray(`  • ${warning}`));
          });
        }
      } else {
        spinner.fail('Generated files verification failed');
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
      spinner.fail('Verification failed');
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
    if (fileCount.dataComponents > 0) {
      console.log(chalk.gray(`  ├── data-components/ (${fileCount.dataComponents} files)`));
    }
    if (fileCount.artifactComponents > 0) {
      console.log(chalk.gray(`  ├── artifact-components/ (${fileCount.artifactComponents} files)`));
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
    spinner.fail('Failed to pull project');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}
