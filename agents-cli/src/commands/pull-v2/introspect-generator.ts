/**
 * Introspect mode generator - Completely deterministic generation without LLM calls
 * Similar to Drizzle's --introspect flag, this regenerates everything from scratch
 */

import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
import { generateAgentFile } from './agent-generator';
import { generateArtifactComponentFile } from './artifact-component-generator';
import { generateDataComponentFile } from './data-component-generator';
import { generateEnvironmentFiles } from './environment-generator';
import { generateFunctionFile } from './function-generator';
import { type CodeStyle, type ComponentType, ensureUniqueName } from './generator-utils';
import { generateIndexFile } from './index-generator';
import { generateStatusComponentFile } from './status-component-generator';
import { generateToolFile } from './tool-generator';

/**
 * Generate all files deterministically for introspect mode
 * This is purely deterministic - no LLM calls, no diffing, just clean generation
 */
export async function generateAllFilesDeterministically(
  projectData: FullProjectDefinition,
  _paths: {
    projectRoot: string;
    toolsDir: string;
    dataComponentsDir: string;
    artifactComponentsDir: string;
    statusComponentsDir: string;
    agentsDir: string;
    environmentsDir: string;
  },
  style: CodeStyle,
  debug: boolean = false
): Promise<Map<string, string>> {
  const filesToGenerate = new Map<string, string>();

  if (debug) {
    console.log(chalk.blue('\n🔍 Introspect Mode - Starting deterministic file generation'));
    console.log(chalk.gray(`   Project ID: ${projectData.id}`));
    console.log(chalk.gray(`   Code Style: ${style}`));
  }

  // Generate component name map for consistent naming
  if (debug) {
    console.log(chalk.gray('\n   Building component name map...'));
  }
  const componentNameMap = buildIntrospectComponentNameMap(projectData);
  if (debug) {
    console.log(chalk.gray(`   ✓ Built ${componentNameMap.size} component name mappings`));
  }

  // Generate tools
  if (projectData.tools) {
    const toolCount = Object.keys(projectData.tools).length;
    if (debug) {
      console.log(chalk.gray(`\n   Generating ${toolCount} tools...`));
    }
    let successCount = 0;
    let failCount = 0;
    
    for (const [toolId, toolData] of Object.entries(projectData.tools)) {
      try {
        const fileName = `tools/${toFileName(toolId)}.ts`;
        const content = generateToolFile(toolId, toolData, style);
        filesToGenerate.set(fileName, content);
        successCount++;
        if (debug) {
          console.log(chalk.gray(`      ✓ ${toolId} → ${fileName}`));
        }
      } catch (error: any) {
        failCount++;
        console.log(chalk.red(`      ✗ Failed to generate tool ${toolId}: ${error.message}`));
      }
    }
    if (debug) {
      console.log(chalk.gray(`   Tools: ${successCount} succeeded, ${failCount} failed`));
    }
  } else if (debug) {
    console.log(chalk.gray('\n   No tools to generate'));
  }

  // Generate function tools (from agents)
  if (projectData.agents) {
    let totalFunctionTools = 0;
    let successCount = 0;
    let failCount = 0;
    
    for (const [agentId, agentData] of Object.entries(projectData.agents)) {
      if (agentData.functionTools) {
        const functionToolCount = Object.keys(agentData.functionTools).length;
        totalFunctionTools += functionToolCount;
        
        for (const [functionToolId, functionToolData] of Object.entries(agentData.functionTools)) {
          if (!functionToolId || typeof functionToolId !== 'string') {
            if (debug) {
              console.log(chalk.yellow(`      ⚠ Skipping invalid function tool ID in agent ${agentId}`));
            }
            continue;
          }
          
          try {
            const fileName = `tools/${toFileName(functionToolId)}.ts`;
            
            // functionToolData contains metadata (name, description, functionId)
            // We need to look up the actual implementation from the functions object
            const functionId = functionToolData.functionId || functionToolId;
            const functionImpl = agentData.functions?.[functionId] || projectData.functions?.[functionId];
            
            if (!functionImpl) {
              throw new Error(`Function implementation not found for functionId: ${functionId}`);
            }
            
            const mergedData = {
              id: functionToolId,
              name: functionToolData.name || functionToolId,
              description: functionToolData.description,
              implementation: functionImpl?.executeCode,
              parameters: functionImpl?.inputSchema,
              dependencies: functionImpl?.dependencies,
            };
            const content = generateFunctionFile(functionToolId, mergedData, style);
            filesToGenerate.set(fileName, content);
            successCount++;
            if (debug) {
              console.log(chalk.gray(`      ✓ Function tool ${functionToolId} (from agent ${agentId}) → ${fileName}`));
            }
          } catch (error: any) {
            failCount++;
            console.log(chalk.red(`      ✗ Failed to generate function tool ${functionToolId} from agent ${agentId}: ${error.message}`));
          }
        }
      }
    }
    
    if (totalFunctionTools > 0) {
      if (debug) {
        console.log(chalk.gray(`\n   Function tools from agents: ${successCount} succeeded, ${failCount} failed (total: ${totalFunctionTools})`));
      }
    } else if (debug) {
      console.log(chalk.gray('\n   No function tools in agents'));
    }
  }

  // Generate project-level function tools (if they exist)
  if (projectData.functionTools) {
    const functionToolCount = Object.keys(projectData.functionTools).length;
    if (debug) {
      console.log(chalk.gray(`\n   Generating ${functionToolCount} project-level function tools...`));
    }
    let successCount = 0;
    let failCount = 0;
    
    for (const [functionToolId, functionToolData] of Object.entries(projectData.functionTools)) {
      try {
        const fileName = `tools/${toFileName(functionToolId)}.ts`;
        // Merge function tool metadata with function implementation
        const functionId = functionToolData.functionId || functionToolId;
        const functionImpl = projectData.functions?.[functionId];
        
        if (!functionImpl) {
          throw new Error(`Function implementation not found for functionId: ${functionId}`);
        }
        
        const mergedData = {
          id: functionToolId,
          name: functionToolData.name,
          description: functionToolData.description,
          implementation: functionImpl?.executeCode,
          parameters: functionImpl?.inputSchema,
          dependencies: functionImpl?.dependencies,
        };
        const content = generateFunctionFile(functionToolId, mergedData, style);
        filesToGenerate.set(fileName, content);
        successCount++;
        if (debug) {
          console.log(chalk.gray(`      ✓ ${functionToolId} → ${fileName}`));
        }
      } catch (error: any) {
        failCount++;
        console.log(chalk.red(`      ✗ Failed to generate function tool ${functionToolId}: ${error.message}`));
      }
    }
    if (debug) {
      console.log(chalk.gray(`   Function tools: ${successCount} succeeded, ${failCount} failed`));
    }
  } else if (debug) {
    console.log(chalk.gray('\n   No project-level function tools'));
  }

  // Generate data components
  if (projectData.dataComponents) {
    const componentCount = Object.keys(projectData.dataComponents).length;
    if (debug) {
      console.log(chalk.gray(`\n   Generating ${componentCount} data components...`));
    }
    let successCount = 0;
    let failCount = 0;
    
    for (const [componentId, componentData] of Object.entries(projectData.dataComponents)) {
      try {
        const fileName = `data-components/${toFileName(componentId)}.ts`;
        const content = generateDataComponentFile(componentId, componentData, style);
        filesToGenerate.set(fileName, content);
        successCount++;
        if (debug) {
          console.log(chalk.gray(`      ✓ ${componentId} → ${fileName}`));
        }
      } catch (error: any) {
        failCount++;
        console.log(chalk.red(`      ✗ Failed to generate data component ${componentId}: ${error.message}`));
      }
    }
    if (debug) {
      console.log(chalk.gray(`   Data components: ${successCount} succeeded, ${failCount} failed`));
    }
  } else if (debug) {
    console.log(chalk.gray('\n   No data components to generate'));
  }

  // Generate artifact components
  if (projectData.artifactComponents) {
    const componentCount = Object.keys(projectData.artifactComponents).length;
    if (debug) {
      console.log(chalk.gray(`\n   Generating ${componentCount} artifact components...`));
    }
    let successCount = 0;
    let failCount = 0;
    
    for (const [componentId, componentData] of Object.entries(projectData.artifactComponents)) {
      try {
        const fileName = `artifact-components/${toFileName(componentId)}.ts`;
        const content = generateArtifactComponentFile(componentId, componentData, style);
        filesToGenerate.set(fileName, content);
        successCount++;
        if (debug) {
          console.log(chalk.gray(`      ✓ ${componentId} → ${fileName}`));
        }
      } catch (error: any) {
        failCount++;
        console.log(chalk.red(`      ✗ Failed to generate artifact component ${componentId}: ${error.message}`));
      }
    }
    if (debug) {
      console.log(chalk.gray(`   Artifact components: ${successCount} succeeded, ${failCount} failed`));
    }
  } else if (debug) {
    console.log(chalk.gray('\n   No artifact components to generate'));
  }

  // Generate status components
  if (projectData.statusComponents) {
    const componentCount = Object.keys(projectData.statusComponents).length;
    if (debug) {
      console.log(chalk.gray(`\n   Generating ${componentCount} status components...`));
    }
    let successCount = 0;
    let failCount = 0;
    
    for (const [componentId, componentData] of Object.entries(projectData.statusComponents)) {
      try {
        const fileName = `status-components/${toFileName(componentId)}.ts`;
        const content = generateStatusComponentFile(componentId, componentData, style);
        filesToGenerate.set(fileName, content);
        successCount++;
        if (debug) {
          console.log(chalk.gray(`      ✓ ${componentId} → ${fileName}`));
        }
      } catch (error: any) {
        failCount++;
        console.log(chalk.red(`      ✗ Failed to generate status component ${componentId}: ${error.message}`));
      }
    }
    if (debug) {
      console.log(chalk.gray(`   Status components: ${successCount} succeeded, ${failCount} failed`));
    }
  } else if (debug) {
    console.log(chalk.gray('\n   No status components to generate'));
  }

  // Generate agents
  if (projectData.agents) {
    const agentCount = Object.keys(projectData.agents).length;
    if (debug) {
      console.log(chalk.gray(`\n   Generating ${agentCount} agents...`));
    }
    let successCount = 0;
    let failCount = 0;
    
    for (const [agentId, agentData] of Object.entries(projectData.agents)) {
      try {
        const fileName = `agents/${toFileName(agentId)}.ts`;
        const content = generateAgentFile(agentId, agentData, projectData, style, componentNameMap);
        filesToGenerate.set(fileName, content);
        successCount++;
        if (debug) {
          console.log(chalk.gray(`      ✓ ${agentId} → ${fileName}`));
          if (agentData.subAgents) {
            const subAgentCount = Object.keys(agentData.subAgents).length;
            console.log(chalk.gray(`        └─ Includes ${subAgentCount} sub-agent(s)`));
          }
        }
      } catch (error: any) {
        failCount++;
        console.log(chalk.red(`      ✗ Failed to generate agent ${agentId}: ${error.message}`));
      }
    }
    if (debug) {
      console.log(chalk.gray(`   Agents: ${successCount} succeeded, ${failCount} failed`));
    }
  } else if (debug) {
    console.log(chalk.gray('\n   No agents to generate'));
  }

  // Generate environment files
  if (
    projectData.credentialReferences &&
    Object.keys(projectData.credentialReferences).length > 0
  ) {
    // Extract ALL credential references from tools, agents, and explicit credentials
    const { extractAllCredentialReferences } = await import('./environment-generator');
    const allCredentials = extractAllCredentialReferences(projectData);
    const credentialCount = Object.keys(allCredentials).length;
    
    if (debug) {
      console.log(chalk.gray(`\n   Generating environment files for ${credentialCount} credentials...`));
    }
    
    try {
      const environmentFiles = generateEnvironmentFiles(
        'development', // Default to development for introspect mode
        allCredentials,
        style
      );

      let fileCount = 0;
      for (const [filename, content] of Object.entries(environmentFiles)) {
        const fullPath = `environments/${filename}`;
        filesToGenerate.set(fullPath, content);
        fileCount++;
        if (debug) {
          console.log(chalk.gray(`      ✓ ${fullPath}`));
        }
      }
      if (debug) {
        console.log(chalk.gray(`   Environment files: ${fileCount} generated`));
      }
    } catch (error: any) {
      console.log(chalk.red(`      ✗ Failed to generate environment files: ${error.message}`));
    }
  } else if (debug) {
    console.log(chalk.gray('\n   No credentials - skipping environment files'));
  }

  // Generate index.ts
  if (debug) {
    console.log(chalk.gray('\n   Generating index.ts...'));
  }
  try {
    const indexContent = generateIndexFile(projectData, componentNameMap, style);
    filesToGenerate.set('index.ts', indexContent);
    if (debug) {
      console.log(chalk.gray('      ✓ index.ts'));
    }
  } catch (error: any) {
    console.log(chalk.red(`      ✗ Failed to generate index.ts: ${error.message}`));
    throw error; // Index file is critical, so we throw
  }

  if (debug) {
    console.log(chalk.blue(`\n✅ Introspect generation complete`));
    console.log(chalk.gray(`   Total files to generate: ${filesToGenerate.size}`));
  }

  return filesToGenerate;
}

/**
 * Build a component name map for introspect mode
 * This ensures consistent variable naming across all generated files
 */
function buildIntrospectComponentNameMap(
  projectData: FullProjectDefinition
): Map<string, { name: string; type: ComponentType }> {
  const componentNameMap = new Map();
  const usedNames = new Set<string>();

  // Add project
  const baseProjectVarName = toVariableName(projectData.id);
  const projectVarName = ensureUniqueName(baseProjectVarName, 'project', usedNames);
  usedNames.add(projectVarName);
  componentNameMap.set(`project:${projectData.id}`, {
    name: projectVarName,
    type: 'project',
  });

  // Add tools
  if (projectData.tools) {
    for (const toolId of Object.keys(projectData.tools)) {
      const baseToolVarName = toVariableName(toolId);
      const toolVarName = ensureUniqueName(baseToolVarName, 'tool', usedNames);
      usedNames.add(toolVarName);
      componentNameMap.set(`tool:${toolId}`, {
        name: toolVarName,
        type: 'tool',
      });
    }
  }

  // Add data components
  if (projectData.dataComponents) {
    for (const componentId of Object.keys(projectData.dataComponents)) {
      const baseVarName = toVariableName(componentId);
      const varName = ensureUniqueName(baseVarName, 'dataComponent', usedNames);
      usedNames.add(varName);
      componentNameMap.set(`dataComponent:${componentId}`, {
        name: varName,
        type: 'dataComponent',
      });
    }
  }

  // Add artifact components
  if (projectData.artifactComponents) {
    for (const componentId of Object.keys(projectData.artifactComponents)) {
      const baseVarName = toVariableName(componentId);
      const varName = ensureUniqueName(baseVarName, 'artifactComponent', usedNames);
      usedNames.add(varName);
      componentNameMap.set(`artifactComponent:${componentId}`, {
        name: varName,
        type: 'artifactComponent',
      });
    }
  }

  // Add status components
  if (projectData.statusComponents) {
    for (const componentId of Object.keys(projectData.statusComponents)) {
      const baseVarName = toVariableName(componentId);
      const varName = ensureUniqueName(baseVarName, 'statusComponent', usedNames);
      usedNames.add(varName);
      componentNameMap.set(`statusComponent:${componentId}`, {
        name: varName,
        type: 'statusComponent',
      });
    }
  }

  // Add function tools from agents (since they generate separate tool files)
  if (projectData.agents) {
    for (const [, agentData] of Object.entries(projectData.agents)) {
      if (agentData.functionTools) {
        for (const functionToolId of Object.keys(agentData.functionTools)) {
          if (!functionToolId || typeof functionToolId !== 'string') {
            continue; // Skip invalid function tool IDs
          }
          const baseFunctionToolVarName = toVariableName(functionToolId);
          const functionToolVarName = ensureUniqueName(baseFunctionToolVarName, 'tool', usedNames);
          usedNames.add(functionToolVarName);
          componentNameMap.set(`tool:${functionToolId}`, {
            name: functionToolVarName,
            type: 'tool',
          });
        }
      }
    }
  }

  // Add agents and their subAgents
  if (projectData.agents) {
    for (const agentId of Object.keys(projectData.agents)) {
      const baseVarName = toVariableName(agentId);
      const varName = ensureUniqueName(baseVarName, 'agent', usedNames);
      usedNames.add(varName);
      componentNameMap.set(`agent:${agentId}`, {
        name: varName,
        type: 'agent',
      });

      // Add subAgents
      const agentData = projectData.agents[agentId];
      if (agentData.subAgents) {
        for (const subAgentId of Object.keys(agentData.subAgents)) {
          const baseSubAgentVarName = toVariableName(subAgentId);
          const subAgentVarName = ensureUniqueName(baseSubAgentVarName, 'subAgent', usedNames);
          usedNames.add(subAgentVarName);
          componentNameMap.set(`subAgent:${subAgentId}`, {
            name: subAgentVarName,
            type: 'subAgent',
          });
        }
      }
    }
  }

  return componentNameMap;
}

/**
 * Convert ID to kebab-case file name (preserve original casing)
 */
function toFileName(id: string): string {
  return id
    .replace(/[^a-zA-Z0-9\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Convert ID to camelCase variable name
 */
function toVariableName(id: string): string {
  if (!id || typeof id !== 'string') {
    throw new Error(
      `toVariableName (introspect): expected string, got ${typeof id}: ${JSON.stringify(id)}`
    );
  }

  return id
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}
