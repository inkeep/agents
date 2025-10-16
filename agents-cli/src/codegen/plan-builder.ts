/**
 * Plan Builder
 *
 * Uses LLM to generate a file structure plan based on:
 * - Detected patterns from existing code
 * - New project data from backend
 * - Variable name registry to avoid conflicts
 */

import type { FullProjectDefinition, ModelSettings } from '@inkeep/agents-core';
import { generateTextWithPlaceholders } from '../commands/pull.llm-generate';
import type { DetectedPatterns } from './pattern-analyzer';
import {
  collectAllEntities,
  type EntityType,
  VariableNameGenerator,
  type VariableNameRegistry,
} from './variable-name-registry';

export interface FileEntity {
  id: string;
  variableName: string;
  entityType: EntityType;
  exportName: string;
}

export interface FileDependency {
  variableName: string;
  fromPath: string;
  entityType: EntityType;
}

export interface FileInfo {
  path: string;
  type:
    | 'agent'
    | 'tool'
    | 'dataComponent'
    | 'artifactComponent'
    | 'statusComponent'
    | 'environment'
    | 'index';
  entities: FileEntity[];
  dependencies: FileDependency[];
  inlineContent?: FileEntity[]; // Tools/components defined inline in this file
}

export interface GenerationPlan {
  files: FileInfo[];
  variableRegistry: VariableNameRegistry;
  patterns: DetectedPatterns;
  processedProjectData: FullProjectDefinition; // Include processed data with suffixed IDs
  metadata: {
    totalFiles: number;
    newFiles: number;
    updatedFiles: number;
    conflicts: Array<{
      id: string;
      types: EntityType[];
      resolvedNames: Record<string, string>;
    }>;
  };
}

/**
 * Generate a file structure plan using LLM
 */
export async function generatePlan(
  projectData: FullProjectDefinition,
  patterns: DetectedPatterns,
  modelSettings: ModelSettings,
  createModel: (config: ModelSettings) => any,
  targetEnvironment: string = 'development'
): Promise<GenerationPlan> {
  // Step 1: Initialize variable name generator with detected conventions
  const nameGenerator = new VariableNameGenerator(patterns.namingConventions);

  // Step 2: Register existing variables from detected patterns
  if (patterns.examples.mappings) {
    for (const mapping of patterns.examples.mappings) {
      try {
        nameGenerator.register(mapping.id, mapping.variableName, mapping.entityType);
      } catch {
        // Skip invalid mappings
      }
    }
  }

  // Step 3: Collect all entities to detect ID conflicts
  const allEntities = collectAllEntities(projectData);
  
  // Step 3.5: Apply ID suffixes to resolve conflicts at the data level
  // Note: This ensures data integrity by preventing ID collisions that cause data loss
  const processedProjectData = applyIdSuffixes(projectData, new VariableNameGenerator(patterns.namingConventions));
  
  // Step 4: Generate variable names for all entities from processed project data
  const finalEntities = processedProjectData !== projectData 
    ? collectAllEntities(processedProjectData) 
    : allEntities;
  for (const entity of finalEntities) {
    nameGenerator.generateVariableName(entity.id, entity.type, entity.data);
  }

  // Step 3.5: Pre-compute filenames for guaranteed consistency
  const fileNameMappings = new Map<string, string>();
  for (const entity of finalEntities) {
    const fileName = nameGenerator.generateFileName(entity.id, entity.type, entity.data);
    fileNameMappings.set(entity.id, fileName);
  }

  // Step 4: Use LLM to generate file structure plan with placeholder optimization
  const model = createModel(modelSettings);
  const promptTemplate = createPlanningPromptTemplate(nameGenerator.getRegistry(), finalEntities, fileNameMappings, targetEnvironment);

  // Combine processedProjectData and patterns for placeholder processing
  const promptData = {
    projectData: processedProjectData,
    patterns,
  };

  const text = await generateTextWithPlaceholders(
    model,
    promptData,
    promptTemplate,
    {
      temperature: 0.1,
      maxOutputTokens: 8000,
    },
    false // debug flag
  );

  // Step 5: Parse LLM response to extract file plan
  const filePlan = parsePlanResponse(text, nameGenerator.getRegistry());

  // Step 6: Build final generation plan
  const plan: GenerationPlan = {
    files: filePlan,
    variableRegistry: nameGenerator.getRegistry(),
    patterns,
    processedProjectData,
    metadata: {
      totalFiles: filePlan.length,
      newFiles: filePlan.length, // TODO: Compare with existing files
      updatedFiles: 0,
      conflicts: nameGenerator.getConflicts(),
    },
  };

  return plan;
}

/**
 * Create LLM planning prompt template
 * Uses {{DATA}} placeholder for large data that will be processed by placeholder system
 */
function createPlanningPromptTemplate(
  registry: VariableNameRegistry,
  allEntities: Array<{ id: string; type: EntityType; data?: any }>,
  fileNameMappings: Map<string, string>,
  targetEnvironment: string = 'development'
): string {
  // Format variable mappings for prompt
  const mappings = formatVariableMappings(registry, allEntities);
  
  // Format filename mappings for prompt
  const fileNames = formatFileNameMappings(fileNameMappings, allEntities);

  return `You are a code generation planner. Generate a file structure plan for an Inkeep TypeScript project.

DATA (PROJECT AND PATTERNS):
{{DATA}}

The DATA above contains:
- projectData: Full project definition from the backend (agents, tools, dataComponents, etc.)
- patterns: Detected patterns from existing code (fileStructure, namingConventions, codeStyle, examples)

VARIABLE NAME MAPPINGS (MUST USE THESE EXACT NAMES):
${mappings}

FILENAME MAPPINGS (MUST USE THESE EXACT FILENAMES):
${fileNames}

CRITICAL RULES:

1. TOOL TYPES - VERY IMPORTANT:
   - **Function Tools** (type: "function"): ALWAYS define INLINE within agent files using "inlineContent" array
   - **MCP Tools** (type: "mcp"): Create separate files in tools/ directory
   - VALID FILE TYPES: Only use these exact types: "agent", "tool", "dataComponent", "artifactComponent", "statusComponent", "environment", "index"
   - NEVER create file type "functionTool" - function tools go in "inlineContent" of agent files

2. STATUS COMPONENTS - VERY IMPORTANT:
   - **Status Components**: ALWAYS create separate files in status-components/ directory
   - Status components are found in agent.statusUpdates.statusComponents array
   - Each status component should get its own file
   - Agents must import status components from status-components/ directory
   - Status components are NEVER inlined in agent files

3. ENVIRONMENT FILES - VERY IMPORTANT:
   - **When credential references exist**: Create environment files in environments/ directory
   - **Environment Structure**: Create ONLY "${targetEnvironment}.env.ts" file for target environment (credentials are embedded in this file)
   - **Environment Index**: Create "environments/index.ts" that imports environment files and exports envSettings using createEnvironmentSettings
   - **NO separate credential files**: Credentials are defined INSIDE the environment files, not as separate files
   - **Environment entities**: Use type "environment" for both environment files and index file

4. File Structure:
   - If patterns show "toolsLocation": "inline", ALL tools should be in "inlineContent" of agent files
   - If patterns show "toolsLocation": "separate", MCP tools get separate files, function tools still inline
   - Follow the detected file naming convention (kebab-case, camelCase, or snake_case)

4. Variable Names:
   - MUST use the exact variable names from the mappings above
   - If ID "weather" is used by both agent and subAgent, they will have different variable names
   - Do NOT generate new variable names - use what's provided

5. File Placement:
   - agents/ directory: Agent files (with function tools in "inlineContent")
   - tools/ directory: MCP tool files only
   - data-components/ directory: Data component files
   - artifact-components/ directory: Artifact component files
   - status-components/ directory: Status component files
   - environments/ directory: Environment/credential files
   - index.ts: Main project file

6. File Paths (CRITICAL):
   - Paths MUST be relative to the project root directory
   - DO NOT include the project name in the path
   - CORRECT: "agents/weather-agent.ts", "tools/inkeep-facts.ts", "status-components/tool-summary.ts"
   - WRONG: "my-project/agents/weather-agent.ts", "project-name/tools/inkeep-facts.ts"

7. Dependencies:
   - Each file should list which variables it needs to import from other files
   - Imports should use relative paths
   - Respect detected import style (named vs default)

OUTPUT FORMAT (JSON):
{
  "files": [
    {
      "path": "agents/weather-agent.ts",
      "type": "agent",
      "entities": [
        {
          "id": "weather",
          "variableName": "weatherSubAgent",
          "entityType": "subAgent",
          "exportName": "weatherSubAgent"
        },
        {
          "id": "weather",
          "variableName": "weatherAgent",
          "entityType": "agent",
          "exportName": "weatherAgent"
        }
      ],
      "dependencies": [
        {
          "variableName": "weatherApi",
          "fromPath": "../tools/weather-api",
          "entityType": "tool"
        }
      ],
      "inlineContent": [
        {
          "id": "get-forecast",
          "variableName": "getForecast",
          "entityType": "tool",
          "exportName": "getForecast"
        }
      ]
    },
    {
      "path": "tools/weather-api.ts",
      "type": "tool",
      "entities": [
        {
          "id": "weather-api",
          "variableName": "weatherApi",
          "entityType": "tool",
          "exportName": "weatherApi"
        }
      ],
      "dependencies": [],
      "inlineContent": null
    },
    {
      "path": "status-components/tool-summary.ts",
      "type": "statusComponent",
      "entities": [
        {
          "id": "tool_summary",
          "variableName": "toolSummary",
          "entityType": "statusComponent",
          "exportName": "toolSummary"
        }
      ],
      "dependencies": [],
      "inlineContent": null
    },
    {
      "path": "environments/${targetEnvironment}.env.ts",
      "type": "environment",
      "entities": [
        {
          "id": "${targetEnvironment}",
          "variableName": "${targetEnvironment}",
          "entityType": "environment",
          "exportName": "${targetEnvironment}"
        }
      ],
      "dependencies": [],
      "inlineContent": null
    },
    {
      "path": "environments/index.ts", 
      "type": "environment",
      "entities": [
        {
          "id": "envSettings",
          "variableName": "envSettings",
          "entityType": "environment",
          "exportName": "envSettings"
        }
      ],
      "dependencies": [
        {
          "variableName": "${targetEnvironment}",
          "fromPath": "./${targetEnvironment}.env",
          "entityType": "environment"
        }
      ],
      "inlineContent": null
    },
    {
      "path": "index.ts",
      "type": "index",
      "entities": [
        {
          "id": "my-weather-project",
          "variableName": "myWeatherProject",
          "entityType": "project",
          "exportName": "myWeatherProject"
        }
      ],
      "dependencies": [
        {
          "variableName": "weatherAgent",
          "fromPath": "./agents/weather-agent",
          "entityType": "agent"
        },
        {
          "variableName": "weatherApi",
          "fromPath": "./tools/weather-api",
          "entityType": "tool"
        }
      ]
    }
  ]
}

Generate ONLY the JSON response, no markdown or explanations.`;
}

/**
 * Format variable mappings for LLM prompt
 */
function formatVariableMappings(
  registry: VariableNameRegistry,
  allEntities: Array<{ id: string; type: EntityType }>
): string {
  let result = '';

  // Group entities by type
  const byType: Record<string, Array<{ id: string; variableName: string }>> = {
    agent: [],
    subAgent: [],
    tool: [],
    dataComponent: [],
    artifactComponent: [],
    statusComponent: [],
    credential: [],
    environment: [],
  };

  for (const entity of allEntities) {
    const registryMap = getRegistryMap(registry, entity.type);
    const variableName = registryMap.get(entity.id);
    if (variableName) {
      byType[entity.type].push({ id: entity.id, variableName });
    }
  }

  // Format each type
  for (const [type, entities] of Object.entries(byType)) {
    if (entities.length > 0) {
      result += `\n${type.toUpperCase()}S:\n`;
      for (const entity of entities) {
        result += `  - id: "${entity.id}" → variableName: "${entity.variableName}"\n`;
      }
    }
  }

  return result;
}

/**
 * Format filename mappings for LLM prompt
 */
function formatFileNameMappings(
  fileNameMappings: Map<string, string>,
  allEntities: Array<{ id: string; type: EntityType; data?: any }>
): string {
  let result = '';

  // Group entities by type that have file mappings
  const byType: Record<string, Array<{ id: string; fileName: string; name?: string }>> = {
    agent: [],
    tool: [],
    dataComponent: [],
    artifactComponent: [],
    statusComponent: [],
    credential: [],
  };

  for (const entity of allEntities) {
    const fileName = fileNameMappings.get(entity.id);
    if (fileName && byType[entity.type]) {
      byType[entity.type].push({
        id: entity.id,
        fileName,
        name: entity.data?.name // Include human-readable name for context
      });
    }
  }

  // Format output
  for (const [type, entities] of Object.entries(byType)) {
    if (entities.length > 0) {
      result += `\n${type.toUpperCase()}S:\n`;
      for (const entity of entities) {
        if (entity.name && entity.name !== entity.id) {
          result += `  - id: "${entity.id}" (${entity.name}) → filename: "${entity.fileName}.ts"\n`;
        } else {
          result += `  - id: "${entity.id}" → filename: "${entity.fileName}.ts"\n`;
        }
      }
    }
  }

  return result;
}

/**
 * Get registry map for entity type
 */
function getRegistryMap(
  registry: VariableNameRegistry,
  entityType: EntityType
): Map<string, string> {
  switch (entityType) {
    case 'agent':
      return registry.agents;
    case 'subAgent':
      return registry.subAgents;
    case 'tool':
      return registry.tools;
    case 'dataComponent':
      return registry.dataComponents;
    case 'artifactComponent':
      return registry.artifactComponents;
    case 'statusComponent':
      return registry.statusComponents;
    case 'credential':
      return registry.credentials;
    default:
      throw new Error(`Unknown entity type: ${entityType}`);
  }
}

/**
 * Parse LLM response to extract file plan
 */
function parsePlanResponse(text: string, registry: VariableNameRegistry): FileInfo[] {
  // Remove markdown code fences if present
  const cleaned = text
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);

    // Validate structure
    if (!parsed.files || !Array.isArray(parsed.files)) {
      throw new Error('Invalid plan structure: missing files array');
    }

    return parsed.files as FileInfo[];
  } catch (error) {
    console.error('Failed to parse LLM plan response:', error);
    console.error('Response text:', cleaned);

    // Fallback to default structure
    return generateDefaultPlan(registry);
  }
}

/**
 * Generate default plan if LLM fails
 */
function generateDefaultPlan(registry: VariableNameRegistry): FileInfo[] {
  const files: FileInfo[] = [];

  // Create agent files
  for (const [agentId, variableName] of registry.agents.entries()) {
    files.push({
      path: `agents/${kebabCase(agentId)}.ts`,
      type: 'agent',
      entities: [
        {
          id: agentId,
          variableName,
          entityType: 'agent',
          exportName: variableName,
        },
      ],
      dependencies: [],
    });
  }

  // Create tool files
  for (const [toolId, variableName] of registry.tools.entries()) {
    files.push({
      path: `tools/${kebabCase(toolId)}.ts`,
      type: 'tool',
      entities: [
        {
          id: toolId,
          variableName,
          entityType: 'tool',
          exportName: variableName,
        },
      ],
      dependencies: [],
    });
  }

  // Create data component files
  for (const [compId, variableName] of registry.dataComponents.entries()) {
    files.push({
      path: `data-components/${kebabCase(compId)}.ts`,
      type: 'dataComponent',
      entities: [
        {
          id: compId,
          variableName,
          entityType: 'dataComponent',
          exportName: variableName,
        },
      ],
      dependencies: [],
    });
  }

  // Create artifact component files
  for (const [compId, variableName] of registry.artifactComponents.entries()) {
    files.push({
      path: `artifact-components/${kebabCase(compId)}.ts`,
      type: 'artifactComponent',
      entities: [
        {
          id: compId,
          variableName,
          entityType: 'artifactComponent',
          exportName: variableName,
        },
      ],
      dependencies: [],
    });
  }

  // Create status component files
  for (const [compId, variableName] of registry.statusComponents.entries()) {
    files.push({
      path: `status-components/${kebabCase(compId)}.ts`,
      type: 'statusComponent',
      entities: [
        {
          id: compId,
          variableName,
          entityType: 'statusComponent',
          exportName: variableName,
        },
      ],
      dependencies: [],
    });
  }

  // Create index file
  files.push({
    path: 'index.ts',
    type: 'index',
    entities: [],
    dependencies: [],
  });

  return files;
}

/**
 * Check if there are ID conflicts between different entity types
 */
function hasIdConflicts(entities: Array<{ id: string; type: EntityType }>): boolean {
  const seenIds = new Set<string>();
  for (const entity of entities) {
    if (seenIds.has(entity.id)) {
      return true; // Found a conflict
    }
    seenIds.add(entity.id);
  }
  return false; // No conflicts
}

/**
 * Apply ID suffixes to resolve conflicts at the data level
 * This prevents data loss during collision resolution
 */
function applyIdSuffixes(projectData: FullProjectDefinition, nameGenerator: VariableNameGenerator): FullProjectDefinition {
  // Create a deep copy of project data
  const processedData = JSON.parse(JSON.stringify(projectData));
  
  // Process agents
  if (processedData.agents) {
    const newAgents: Record<string, any> = {};
    for (const [agentId, agentData] of Object.entries(processedData.agents)) {
      const newAgentId = nameGenerator.generateUniqueId(agentId, 'agent');
      const updatedAgentData = { ...(agentData as any), id: newAgentId };
      
      // Process subAgents within this agent
      if (updatedAgentData.subAgents) {
        const newSubAgents: Record<string, any> = {};
        for (const [subAgentId, subAgentData] of Object.entries(updatedAgentData.subAgents)) {
          const newSubAgentId = nameGenerator.generateUniqueId(subAgentId, 'subAgent');
          const updatedSubAgentData = { ...(subAgentData as any), id: newSubAgentId };
          newSubAgents[newSubAgentId] = updatedSubAgentData;
          
          // Update defaultSubAgentId reference if it matches this subAgent
          if (updatedAgentData.defaultSubAgentId === subAgentId) {
            updatedAgentData.defaultSubAgentId = newSubAgentId;
          }
        }
        updatedAgentData.subAgents = newSubAgents;
      }
      
      newAgents[newAgentId] = updatedAgentData;
    }
    processedData.agents = newAgents;
  }
  
  // Process tools
  if (processedData.tools) {
    const newTools: Record<string, any> = {};
    for (const [toolId, toolData] of Object.entries(processedData.tools)) {
      const newToolId = nameGenerator.generateUniqueId(toolId, 'tool');
      const updatedToolData = { ...(toolData as any), id: newToolId };
      newTools[newToolId] = updatedToolData;
    }
    processedData.tools = newTools;
  }
  
  // Process data components
  if (processedData.dataComponents) {
    const newDataComponents: Record<string, any> = {};
    for (const [compId, compData] of Object.entries(processedData.dataComponents)) {
      const newCompId = nameGenerator.generateUniqueId(compId, 'dataComponent');
      const updatedCompData = { ...(compData as any), id: newCompId };
      newDataComponents[newCompId] = updatedCompData;
    }
    processedData.dataComponents = newDataComponents;
  }
  
  // Process artifact components
  if (processedData.artifactComponents) {
    const newArtifactComponents: Record<string, any> = {};
    for (const [compId, compData] of Object.entries(processedData.artifactComponents)) {
      const newCompId = nameGenerator.generateUniqueId(compId, 'artifactComponent');
      const updatedCompData = { ...(compData as any), id: newCompId };
      newArtifactComponents[newCompId] = updatedCompData;
    }
    processedData.artifactComponents = newArtifactComponents;
  }
  
  return processedData;
}

/**
 * Convert string to kebab-case
 */
function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Convert string to camelCase
 */
function _camelCase(str: string): string {
  const parts = str.split(/[-_]/);
  return parts
    .map((part, index) => {
      if (index === 0) {
        return part.toLowerCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}
