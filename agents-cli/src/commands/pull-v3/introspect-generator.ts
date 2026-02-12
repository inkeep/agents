/**
 * Introspect Generator - Complete project regeneration
 *
 * This module handles the --introspect mode which regenerates all files
 * from scratch without any comparison or diffing logic.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
import { generateAgentFile } from './components/agent-generator';
import { generateArtifactComponentFile } from './components/artifact-component-generator';
import { generateContextConfigFile } from './components/context-config-generator';
import { generateCredentialFile } from './components/credential-generator';
import { generateDataComponentFile } from './components/data-component-generator';
import {
  generateEnvironmentFile,
  generateEnvironmentIndexFile,
} from './components/environment-generator';
import { generateExternalAgentFile } from './components/external-agent-generator';
import { generateFunctionToolFile } from './components/function-tool-generator';
import { generateMcpToolFile } from './components/mcp-tool-generator';
// Import all component generators
import { generateProjectFile } from './components/project-generator';
import { generateStatusComponentFile } from './components/status-component-generator';
import { generateSubAgentFile } from './components/sub-agent-generator';
import { generateTriggerFile } from './components/trigger-generator';
import { ComponentRegistry, registerAllComponents } from './utils/component-registry';
import { DEFAULT_STYLE } from './utils/generator-utils';

interface ProjectPaths {
  projectRoot: string;
  agentsDir: string;
  toolsDir: string;
  dataComponentsDir: string;
  artifactComponentsDir: string;
  statusComponentsDir: string;
  environmentsDir: string;
  credentialsDir: string;
  contextConfigsDir: string;
  externalAgentsDir: string;
  skillsDir: string;
}

interface IntrospectOptions {
  codeStyle?: {
    quotes?: 'single' | 'double';
    semicolons?: boolean;
    indentation?: string;
  };
}

/**
 * Helper function to ensure directory exists
 */
function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
}

/**
 * Check if an agent is complete enough for code generation
 * An agent needs a name, defaultSubAgentId, and at least one sub-agent
 */
function isAgentComplete(agentData: any): { complete: boolean; reason?: string } {
  if (!agentData.name) {
    return { complete: false, reason: 'missing name' };
  }
  if (!agentData.defaultSubAgentId) {
    return { complete: false, reason: 'missing defaultSubAgentId (no sub-agents configured)' };
  }
  if (!agentData.subAgents || Object.keys(agentData.subAgents).length === 0) {
    return { complete: false, reason: 'no sub-agents defined' };
  }
  return { complete: true };
}

/**
 * Generate all files from scratch using deterministic generation
 */
export async function introspectGenerate(
  project: FullProjectDefinition,
  paths: ProjectPaths,
  environment: string,
  debug: boolean,
  options: IntrospectOptions = {}
): Promise<void> {
  if (debug) {
    console.log(chalk.gray('🔍 Regenerating all project files...'));
  }

  const generatedFiles: string[] = [];
  const style = { ...DEFAULT_STYLE, ...options.codeStyle };
  const skippedAgents: Array<{ id: string; reason: string }> = [];

  // Note: Context configs will be extracted by registerAllComponents() and available in registry

  const registry = new ComponentRegistry();

  try {
    // Step 0: Register all components in registry first
    registerAllComponents(project, registry);

    // 1. Generate credentials first (needed by other components)
    if (project.credentialReferences) {
      for (const [credId, credData] of Object.entries(project.credentialReferences)) {
        const credentialFile = join(paths.credentialsDir, `${credId}.ts`);
        const credentialContent = generateCredentialFile(credId, credData, style);

        ensureDir(credentialFile);
        writeFileSync(credentialFile, credentialContent, 'utf-8');
        generatedFiles.push(credentialFile);
      }
    }

    // 2. Generate environment settings
    const envFile = join(paths.environmentsDir, `${environment}.env.ts`);
    const envData = {
      name: `${environment} Environment`,
      description: `Environment configuration for ${environment}`,
      // Include credentials from project
      credentials: project.credentialReferences ? Object.keys(project.credentialReferences) : [],
    };
    const envContent = generateEnvironmentFile(environment, envData, style, registry);

    ensureDir(envFile);
    writeFileSync(envFile, envContent, 'utf-8');
    generatedFiles.push(envFile);

    // 2b. Generate environment index file
    const envIndexFile = join(paths.environmentsDir, 'index.ts');
    const environments = [environment]; // For now, just the current environment
    const envIndexContent = generateEnvironmentIndexFile(environments, style);

    ensureDir(envIndexFile);
    writeFileSync(envIndexFile, envIndexContent, 'utf-8');
    generatedFiles.push(envIndexFile);

    // 3. Generate function tools (if any)
    // Function tools are stored in two tables that need to be joined:
    // - functionTools: has name, description, functionId (agent-scoped naming)
    // - functions: has inputSchema, executeCode, dependencies (project-scoped code)
    // We need to combine these to create the full FunctionToolConfig
    const functionToolsGenerated = new Set<string>();

    // First, check project-level functionTools and functions
    if (project.functionTools) {
      for (const [toolId, toolData] of Object.entries(project.functionTools)) {
        // Get the code from the functions table using functionId
        const functionId = (toolData as any).functionId;
        const funcData = functionId ? project.functions?.[functionId] : undefined;

        // Merge functionTools (name/description) with functions (code)
        const mergedData = {
          name: (toolData as any).name,
          description: (toolData as any).description,
          inputSchema: funcData?.inputSchema,
          executeCode: funcData?.executeCode,
          execute: funcData?.executeCode,
          dependencies: funcData?.dependencies,
        };

        const functionFile = join(paths.toolsDir, 'functions', `${toolId}.ts`);
        const functionContent = generateFunctionToolFile(toolId, mergedData, style);

        ensureDir(functionFile);
        writeFileSync(functionFile, functionContent, 'utf-8');
        generatedFiles.push(functionFile);
        functionToolsGenerated.add(toolId);
      }
    }

    // Also check agent-level functionTools (each agent can have its own)
    if (project.agents) {
      for (const agentData of Object.values(project.agents)) {
        const agentFunctionTools = agentData.functionTools;
        const agentFunctions = agentData.functions;

        if (agentFunctionTools) {
          for (const [toolId, toolData] of Object.entries(agentFunctionTools)) {
            // Skip if already generated at project level
            if (functionToolsGenerated.has(toolId)) continue;

            // Get the code from the agent's functions or project functions
            const functionId = (toolData as any).functionId;
            const funcData = functionId
              ? agentFunctions?.[functionId] || project.functions?.[functionId]
              : undefined;

            // Merge functionTools (name/description) with functions (code)
            const mergedData = {
              name: (toolData as any).name,
              description: (toolData as any).description,
              inputSchema: funcData?.inputSchema,
              executeCode: funcData?.executeCode,
              execute: funcData?.executeCode,
              dependencies: funcData?.dependencies,
            };

            const functionFile = join(paths.toolsDir, 'functions', `${toolId}.ts`);
            const functionContent = generateFunctionToolFile(toolId, mergedData, style);

            ensureDir(functionFile);
            writeFileSync(functionFile, functionContent, 'utf-8');
            generatedFiles.push(functionFile);
            functionToolsGenerated.add(toolId);
          }
        }
      }
    }

    // Fallback: If there are functions without corresponding functionTools entries,
    // they may be orphaned or the data structure is different - skip them with a warning
    if (project.functions) {
      for (const funcId of Object.keys(project.functions)) {
        if (!functionToolsGenerated.has(funcId)) {
          // Check if this function is referenced by any functionTool
          const isReferenced =
            Object.values(project.functionTools || {}).some(
              (ft: any) => ft.functionId === funcId
            ) ||
            Object.values(project.agents || {}).some((agent: any) =>
              Object.values(agent.functionTools || {}).some((ft: any) => ft.functionId === funcId)
            );

          if (!isReferenced && debug) {
            console.log(
              chalk.yellow(
                `⚠️  Skipping orphaned function '${funcId}' - no functionTool references it`
              )
            );
          }
        }
      }
    }

    // 4. Generate MCP tools
    if (project.tools) {
      for (const [toolId, toolData] of Object.entries(project.tools)) {
        const toolFile = join(paths.toolsDir, `${toolId}.ts`);
        const toolContent = generateMcpToolFile(toolId, toolData, style, registry);

        ensureDir(toolFile);
        writeFileSync(toolFile, toolContent, 'utf-8');
        generatedFiles.push(toolFile);
      }
    }

    // 5. Generate data components
    if (project.dataComponents) {
      for (const [dataId, dataData] of Object.entries(project.dataComponents)) {
        const dataFile = join(paths.dataComponentsDir, `${dataId}.ts`);
        const dataContent = generateDataComponentFile(dataId, dataData, style);

        ensureDir(dataFile);
        writeFileSync(dataFile, dataContent, 'utf-8');
        generatedFiles.push(dataFile);
      }
    }

    // 6. Generate artifact components
    if (project.artifactComponents) {
      for (const [artifactId, artifactData] of Object.entries(project.artifactComponents)) {
        const artifactFile = join(paths.artifactComponentsDir, `${artifactId}.ts`);
        const artifactContent = generateArtifactComponentFile(artifactId, artifactData, style);

        ensureDir(artifactFile);
        writeFileSync(artifactFile, artifactContent, 'utf-8');
        generatedFiles.push(artifactFile);
      }
    }

    // 7. Generate status components from registry
    const registeredStatusComponents = registry
      .getAllComponents()
      .filter((c) => c.type === 'statusComponents');
    if (registeredStatusComponents.length > 0) {
      for (const statusComp of registeredStatusComponents) {
        // Get the actual status component data from the project
        const statusData = findStatusComponentData(project, statusComp.id);
        if (statusData) {
          const statusFile = join(paths.statusComponentsDir, `${statusComp.id}.ts`);
          const statusContent = generateStatusComponentFile(statusComp.id, statusData, style);

          ensureDir(statusFile);
          writeFileSync(statusFile, statusContent, 'utf-8');
          generatedFiles.push(statusFile);
        }
      }
    }

    // 8. Generate external agents
    if (project.externalAgents) {
      for (const [extAgentId, extAgentData] of Object.entries(project.externalAgents)) {
        const extAgentFile = join(paths.externalAgentsDir, `${extAgentId}.ts`);
        const extAgentContent = generateExternalAgentFile(
          extAgentId,
          extAgentData,
          style,
          registry
        );

        ensureDir(extAgentFile);
        writeFileSync(extAgentFile, extAgentContent, 'utf-8');
        generatedFiles.push(extAgentFile);
      }
    }

    // 9. Generate context configs from registry
    const registeredContextConfigs = registry
      .getAllComponents()
      .filter((c) => c.type === 'contextConfigs');
    if (registeredContextConfigs.length > 0) {
      for (const contextComp of registeredContextConfigs) {
        // Get the actual context config data from the project
        const contextData = findContextConfigData(project, contextComp.id);
        if (contextData) {
          const contextFile = join(paths.contextConfigsDir, `${contextComp.id}.ts`);
          const contextContent = generateContextConfigFile(
            contextComp.id,
            contextData,
            style,
            registry
          );

          ensureDir(contextFile);
          writeFileSync(contextFile, contextContent, 'utf-8');
          generatedFiles.push(contextFile);
        }
      }
    }

    // 10. Generate sub-agents (from agents, preserving parent relationship)
    // First, identify which agents are complete and can be generated
    const completeAgentIds = new Set<string>();
    if (project.agents) {
      for (const [agentId, agentData] of Object.entries(project.agents)) {
        const completeness = isAgentComplete(agentData);
        if (completeness.complete) {
          completeAgentIds.add(agentId);
        } else {
          skippedAgents.push({ id: agentId, reason: completeness.reason || 'incomplete' });
          if (debug) {
            console.log(
              chalk.yellow(`⚠️  Skipping incomplete agent '${agentId}': ${completeness.reason}`)
            );
          }
        }
      }
    }

    if (project.agents && Object.keys(project.agents).length > 0) {
      let totalSubAgents = 0;

      for (const [agentId, agentData] of Object.entries(project.agents)) {
        // Skip incomplete agents
        if (!completeAgentIds.has(agentId)) continue;

        if (agentData.subAgents) {
          for (const _subAgentId of Object.keys(agentData.subAgents)) {
            totalSubAgents++;
          }
        }
      }

      if (totalSubAgents > 0) {
        for (const [agentId, agentData] of Object.entries(project.agents)) {
          // Skip incomplete agents
          if (!completeAgentIds.has(agentId)) continue;

          if (agentData.subAgents) {
            // Find the context config data for this agent using agent-based ID
            const contextConfigData = agentData.contextConfig?.id
              ? findContextConfigData(project, agentData.contextConfig.id)
              : undefined;

            for (const [subAgentId, subAgentData] of Object.entries(agentData.subAgents)) {
              const subAgentFile = join(paths.agentsDir, 'sub-agents', `${subAgentId}.ts`);
              // Pass agent models (or project models if agent has none) as parentModels for comparison
              const parentModels = agentData.models || project.models;
              const subAgentContent = generateSubAgentFile(
                subAgentId,
                subAgentData,
                style,
                registry,
                agentId,
                contextConfigData,
                parentModels
              );

              ensureDir(subAgentFile);
              writeFileSync(subAgentFile, subAgentContent, 'utf-8');
              generatedFiles.push(subAgentFile);
            }
          }
        }
      }
    }

    // 11. Generate main agents
    if (project.agents) {
      for (const [agentId, agentData] of Object.entries(project.agents)) {
        // Skip incomplete agents
        if (!completeAgentIds.has(agentId)) continue;

        const agentFile = join(paths.agentsDir, `${agentId}.ts`);

        // Find the context config data for this agent using agent-based ID
        const contextConfigData = agentData.contextConfig?.id
          ? findContextConfigData(project, agentData.contextConfig.id)
          : undefined;

        // Pass project models for comparison with agent models
        const agentContent = generateAgentFile(
          agentId,
          agentData,
          style,
          registry,
          contextConfigData,
          project.models
        );

        ensureDir(agentFile);
        writeFileSync(agentFile, agentContent, 'utf-8');
        generatedFiles.push(agentFile);

        // Generate triggers for this agent (if any)
        if (agentData.triggers && Object.keys(agentData.triggers).length > 0) {
          for (const [triggerId, triggerData] of Object.entries(agentData.triggers)) {
            const triggerFile = join(paths.agentsDir, 'triggers', `${triggerId}.ts`);
            const triggerContent = generateTriggerFile(triggerId, triggerData, style, registry);

            ensureDir(triggerFile);
            writeFileSync(triggerFile, triggerContent, 'utf-8');
            generatedFiles.push(triggerFile);
          }
        }
      }
    }

    // 12. Generate main project file

    // Transform project data to include component references for the project generator
    // Only include complete agents
    const projectDataForGenerator = {
      ...project,
      // Transform object keys to arrays of IDs for the project generator
      // Only include agents that are complete
      agents: project.agents
        ? Object.keys(project.agents).filter((id) => completeAgentIds.has(id))
        : [],
      tools: project.tools ? Object.keys(project.tools) : [],
      externalAgents: project.externalAgents ? Object.keys(project.externalAgents) : [],
      dataComponents: project.dataComponents ? Object.keys(project.dataComponents) : [],
      artifactComponents: project.artifactComponents ? Object.keys(project.artifactComponents) : [],
      credentialReferences: project.credentialReferences
        ? Object.keys(project.credentialReferences)
        : [],
    };

    const projectFile = join(paths.projectRoot, 'index.ts');
    const projectContent = generateProjectFile(
      project.id,
      projectDataForGenerator,
      style,
      registry
    );

    ensureDir(projectFile);
    writeFileSync(projectFile, projectContent, 'utf-8');
    generatedFiles.push(projectFile);

    // Success summary
    if (debug) {
      console.log(chalk.green(`✅ Generated ${generatedFiles.length} files`));
    }

    // Warn about skipped agents
    if (skippedAgents.length > 0) {
      console.log(chalk.yellow(`\n⚠️  Skipped ${skippedAgents.length} incomplete agent(s):`));
      for (const { id, reason } of skippedAgents) {
        console.log(chalk.yellow(`   • ${id}: ${reason}`));
      }
      console.log(
        chalk.gray(
          '   To fix: Add at least one sub-agent to each agent in the UI and set it as default.'
        )
      );
    }
  } catch (error) {
    console.error(chalk.red('\n❌ Introspect regeneration failed:'));
    console.error(
      chalk.red(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    );
    throw error;
  }
}

/**
 * Find context config data by agent-based ID from project agents
 */
function findContextConfigData(project: FullProjectDefinition, contextId: string): any | undefined {
  if (project.agents) {
    for (const agentData of Object.values(project.agents)) {
      if (agentData.contextConfig) {
        // Check if this contextConfig matches by its actual ID
        if (agentData.contextConfig.id === contextId) {
          return agentData.contextConfig;
        }
      }
    }
  }
  return undefined;
}

/**
 * Find status component data by ID from project agents
 */
function findStatusComponentData(
  project: FullProjectDefinition,
  statusId: string
): any | undefined {
  if (project.agents) {
    for (const agentData of Object.values(project.agents)) {
      if (agentData.statusUpdates?.statusComponents) {
        for (const statusComp of agentData.statusUpdates.statusComponents) {
          let compId: string | undefined;

          if (typeof statusComp === 'string') {
            compId = statusComp;
          } else if (typeof statusComp === 'object' && statusComp) {
            compId = statusComp.type;
          }

          if (compId === statusId) {
            return typeof statusComp === 'string'
              ? { id: statusId, type: statusId, description: `Status component for ${statusId}` }
              : statusComp;
          }
        }
      }
    }
  }
  return undefined;
}

// Removed groupFilesByType function to prevent hanging
