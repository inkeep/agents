/**
 * Introspect Generator - Complete project regeneration
 * 
 * This module handles the --introspect mode which regenerates all files
 * from scratch without any comparison or diffing logic.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
import { ComponentRegistry, registerAllComponents } from './utils/component-registry';

// Import all component generators
import { generateProjectFile } from './components/project-generator';
import { generateAgentFile } from './components/agent-generator';
import { generateSubAgentFile } from './components/sub-agent-generator';
import { generateExternalAgentFile } from './components/external-agent-generator';
import { generateDataComponentFile } from './components/data-component-generator';
import { generateArtifactComponentFile } from './components/artifact-component-generator';
import { generateStatusComponentFile } from './components/status-component-generator';
import { generateFunctionToolFile } from './components/function-tool-generator';
import { generateMcpToolFile } from './components/mcp-tool-generator';
import { generateCredentialFile } from './components/credential-generator';
import { generateEnvironmentFile, generateEnvironmentIndexFile } from './components/environment-generator';
import { generateContextConfigFile } from './components/context-config-generator';

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
  const style = options.codeStyle || {
    quotes: 'single' as const,
    semicolons: true,
    indentation: '  '
  };

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
      credentials: project.credentialReferences ? Object.keys(project.credentialReferences) : []
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
    if (project.functions) {
      
      for (const [funcId, funcData] of Object.entries(project.functions)) {
        const functionFile = join(paths.toolsDir, 'functions', `${funcId}.ts`);
        const functionContent = generateFunctionToolFile(funcId, funcData, style);
        
        ensureDir(functionFile);
        writeFileSync(functionFile, functionContent, 'utf-8');
        generatedFiles.push(functionFile);
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
    const registeredStatusComponents = registry.getAllComponents().filter(c => c.type === 'statusComponent');
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
        const extAgentContent = generateExternalAgentFile(extAgentId, extAgentData, style, registry);
        
        ensureDir(extAgentFile);
        writeFileSync(extAgentFile, extAgentContent, 'utf-8');
        generatedFiles.push(extAgentFile);
      }
    }

    // 9. Generate context configs from registry
    const registeredContextConfigs = registry.getAllComponents().filter(c => c.type === 'contextConfig');
    if (registeredContextConfigs.length > 0) {
      
      for (const contextComp of registeredContextConfigs) {
        // Get the actual context config data from the project
        const contextData = findContextConfigData(project, contextComp.id);
        if (contextData) {
          const contextFile = join(paths.contextConfigsDir, `${contextComp.id}.ts`);
          const contextContent = generateContextConfigFile(contextComp.id, contextData, style, registry);
          
          ensureDir(contextFile);
          writeFileSync(contextFile, contextContent, 'utf-8');
          generatedFiles.push(contextFile);
        }
      }
    }

    // 10. Generate sub-agents (from agents, preserving parent relationship)
    if (project.agents && Object.keys(project.agents).length > 0) {
      let totalSubAgents = 0;
      
      for (const [agentId, agentData] of Object.entries(project.agents)) {
        if (agentData.subAgents) {
          for (const [subAgentId, subAgentData] of Object.entries(agentData.subAgents)) {
            totalSubAgents++;
          }
        }
      }
      
      if (totalSubAgents > 0) {
        
        for (const [agentId, agentData] of Object.entries(project.agents)) {
          if (agentData.subAgents) {
            // Find the context config data for this agent using agent-based ID
            const contextConfigData = agentData.contextConfig ? findContextConfigData(project, `${agentId}Context`) : undefined;
            
            for (const [subAgentId, subAgentData] of Object.entries(agentData.subAgents)) {
              const subAgentFile = join(paths.agentsDir, 'sub-agents', `${subAgentId}.ts`);
              // Pass agent models (or project models if agent has none) as parentModels for comparison
              const parentModels = agentData.models || project.models;
              const subAgentContent = generateSubAgentFile(subAgentId, subAgentData, style, registry, agentId, contextConfigData, parentModels);
              
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
        const agentFile = join(paths.agentsDir, `${agentId}.ts`);
        
        // Find the context config data for this agent using agent-based ID
        const contextConfigData = agentData.contextConfig ? findContextConfigData(project, `${agentId}Context`) : undefined;
        
        // Pass project models for comparison with agent models
        const agentContent = generateAgentFile(agentId, agentData, style, registry, contextConfigData, project.models);
        
        ensureDir(agentFile);
        writeFileSync(agentFile, agentContent, 'utf-8');
        generatedFiles.push(agentFile);
      }
    }

    // 12. Generate main project file
    
    // Transform project data to include component references for the project generator
    const projectDataForGenerator = {
      ...project,
      // Transform object keys to arrays of IDs for the project generator
      agents: project.agents ? Object.keys(project.agents) : [],
      tools: project.tools ? Object.keys(project.tools) : [],
      externalAgents: project.externalAgents ? Object.keys(project.externalAgents) : [],
      dataComponents: project.dataComponents ? Object.keys(project.dataComponents) : [],
      artifactComponents: project.artifactComponents ? Object.keys(project.artifactComponents) : [],
      credentialReferences: project.credentialReferences ? Object.keys(project.credentialReferences) : []
    };
    
    const projectFile = join(paths.projectRoot, 'index.ts');
    const projectContent = generateProjectFile(project.id, projectDataForGenerator, style, registry);
    
    ensureDir(projectFile);
    writeFileSync(projectFile, projectContent, 'utf-8');
    generatedFiles.push(projectFile);

    // Success summary
    if (debug) {
      console.log(chalk.green(`✅ Generated ${generatedFiles.length} files`));
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Introspect regeneration failed:'));
    console.error(chalk.red(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    throw error;
  }
}


/**
 * Find context config data by agent-based ID from project agents
 */
function findContextConfigData(project: FullProjectDefinition, contextId: string): any | undefined {
  if (project.agents) {
    for (const [agentId, agentData] of Object.entries(project.agents)) {
      if (agentData.contextConfig) {
        // Check if this contextConfig matches the agent-based ID pattern
        const agentBasedId = `${agentId}Context`;
        if (agentBasedId === contextId) {
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
function findStatusComponentData(project: FullProjectDefinition, statusId: string): any | undefined {
  if (project.agents) {
    for (const [agentId, agentData] of Object.entries(project.agents)) {
      if (agentData.statusUpdates && agentData.statusUpdates.statusComponents) {
        for (const statusComp of agentData.statusUpdates.statusComponents) {
          let compId: string | undefined;
          
          if (typeof statusComp === 'string') {
            compId = statusComp;
          } else if (typeof statusComp === 'object' && statusComp) {
            compId = statusComp.id || statusComp.type || statusComp.name;
          }
          
          if (compId === statusId) {
            return typeof statusComp === 'string' ? { id: statusId, type: statusId, description: `Status component for ${statusId}` } : statusComp;
          }
        }
      }
    }
  }
  return undefined;
}

// Removed groupFilesByType function to prevent hanging

