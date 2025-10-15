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
  createModel: (config: ModelSettings) => any
): Promise<GenerationPlan> {
  // Step 1: Initialize variable name generator with detected conventions
  const nameGenerator = new VariableNameGenerator(patterns.namingConventions);

  // Step 2: Register existing variables from detected patterns
  // Only preserve agent/subAgent names (they're usually good)
  // Skip tools/components - regenerate them with name-based logic
  if (patterns.examples.mappings) {
    for (const mapping of patterns.examples.mappings) {
      try {
        // Only preserve agent and subAgent variable names
        // Tools and components will be regenerated using their name fields
        if (mapping.entityType === 'agent' || mapping.entityType === 'subAgent') {
          nameGenerator.register(mapping.id, mapping.variableName, mapping.entityType);
        }
      } catch {
        // Skip invalid mappings
      }
    }
  }

  // Step 3: Generate variable names for all entities from new project data
  const allEntities = collectAllEntities(projectData);
  for (const entity of allEntities) {
    nameGenerator.generateVariableName(entity.id, entity.type, entity.name);
  }

  // Step 4: Use LLM to generate file structure plan with placeholder optimization
  const model = createModel(modelSettings);
  const promptTemplate = createPlanningPromptTemplate(nameGenerator.getRegistry(), allEntities);

  // Combine projectData and patterns for placeholder processing
  const promptData = {
    projectData,
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
  allEntities: Array<{ id: string; type: EntityType }>
): string {
  // Format variable mappings for prompt
  const mappings = formatVariableMappings(registry, allEntities);

  return `You are a code generation planner. Generate a file structure plan for an Inkeep TypeScript project.

DATA (PROJECT AND PATTERNS):
{{DATA}}

The DATA above contains:
- projectData: Full project definition from the backend (agents, tools, dataComponents, etc.)
- patterns: Detected patterns from existing code (fileStructure, namingConventions, codeStyle, examples)

VARIABLE NAME MAPPINGS (MUST USE THESE EXACT NAMES):
${mappings}

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

3. File Structure:
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

6. File Paths and Names (CRITICAL):
   - File paths MUST use kebab-case version of the VARIABLE NAME (not the entity ID)
   - Convert variable names to kebab-case for file names
   - Example: variableName "searchKnowledgeBase" → file path "tools/search-knowledge-base.ts"
   - Example: variableName "ticketStatus" → file path "status-components/ticket-status.ts"
   - Paths MUST be relative to the project root directory
   - DO NOT include the project name in the path
   - CORRECT: "agents/support-agent.ts", "tools/search-knowledge-base.ts", "status-components/ticket-status.ts"
   - WRONG: "my-project/agents/support-agent.ts", "tools/mcp-search-kb-XyZ123.ts" (using ID instead of variable name)

7. Dependencies:
   - Each file should list which variables it needs to import from other files
   - Imports should use relative paths
   - Respect detected import style (named vs default)

OUTPUT FORMAT (JSON):
{
  "files": [
    {
      "path": "agents/support-agent.ts",
      "type": "agent",
      "entities": [
        {
          "id": "support-router",
          "variableName": "supportRouterSubAgent",
          "entityType": "subAgent",
          "exportName": "supportRouterSubAgent"
        },
        {
          "id": "support",
          "variableName": "supportAgent",
          "entityType": "agent",
          "exportName": "supportAgent"
        }
      ],
      "dependencies": [
        {
          "variableName": "searchKnowledgeBase",
          "fromPath": "../tools/search-knowledge-base",
          "entityType": "tool"
        }
      ],
      "inlineContent": [
        {
          "id": "validate-ticket",
          "variableName": "validateTicket",
          "entityType": "tool",
          "exportName": "validateTicket"
        }
      ]
    },
    {
      "path": "tools/search-knowledge-base.ts",
      "type": "tool",
      "entities": [
        {
          "id": "mcp-search-kb-XyZ123",
          "variableName": "searchKnowledgeBase",
          "entityType": "tool",
          "exportName": "searchKnowledgeBase"
        }
      ],
      "dependencies": [],
      "inlineContent": null
    },
    {
      "path": "status-components/ticket-status.ts",
      "type": "statusComponent",
      "entities": [
        {
          "id": "ticket_status",
          "variableName": "ticketStatus",
          "entityType": "statusComponent",
          "exportName": "ticketStatus"
        }
      ],
      "dependencies": [],
      "inlineContent": null
    },
    {
      "path": "index.ts",
      "type": "index",
      "entities": [
        {
          "id": "my-support-project",
          "variableName": "mySupportProject",
          "entityType": "project",
          "exportName": "mySupportProject"
        }
      ],
      "dependencies": [
        {
          "variableName": "supportAgent",
          "fromPath": "./agents/support-agent",
          "entityType": "agent"
        },
        {
          "variableName": "searchKnowledgeBase",
          "fromPath": "./tools/search-knowledge-base",
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
      path: `agents/${kebabCase(variableName)}.ts`,
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
      path: `tools/${kebabCase(variableName)}.ts`,
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
      path: `data-components/${kebabCase(variableName)}.ts`,
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
      path: `artifact-components/${kebabCase(variableName)}.ts`,
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
      path: `status-components/${kebabCase(variableName)}.ts`,
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
