/**
 * Plan Builder
 *
 * Uses LLM to generate a file structure plan based on:
 * - Detected patterns from existing code
 * - New project data from backend
 * - Variable name registry to avoid conflicts
 */

import type { FullProjectDefinition, ModelSettings } from '@inkeep/agents-core';
import { generateText } from 'ai';
import type { DetectedPatterns } from './pattern-analyzer';
import {
	type EntityType,
	type VariableNameRegistry,
	VariableNameGenerator,
	collectAllEntities,
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
	type: 'agent' | 'tool' | 'dataComponent' | 'artifactComponent' | 'environment' | 'index';
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
	if (patterns.examples.mappings) {
		for (const mapping of patterns.examples.mappings) {
			try {
				nameGenerator.register(mapping.id, mapping.variableName, mapping.entityType);
			} catch {
				// Skip invalid mappings
			}
		}
	}

	// Step 3: Generate variable names for all entities from new project data
	const allEntities = collectAllEntities(projectData);
	for (const entity of allEntities) {
		nameGenerator.generateVariableName(entity.id, entity.type);
	}

	// Step 4: Use LLM to generate file structure plan
	const model = createModel(modelSettings);
	const prompt = createPlanningPrompt(
		projectData,
		patterns,
		nameGenerator.getRegistry(),
		allEntities
	);

	const { text } = await generateText({
		model,
		prompt,
		temperature: 0.1,
		maxOutputTokens: 8000,
	});

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
 * Create LLM planning prompt
 */
function createPlanningPrompt(
	projectData: FullProjectDefinition,
	patterns: DetectedPatterns,
	registry: VariableNameRegistry,
	allEntities: Array<{ id: string; type: EntityType }>
): string {
	// Format variable mappings for prompt
	const mappings = formatVariableMappings(registry, allEntities);

	return `You are a code generation planner. Generate a file structure plan for an Inkeep TypeScript project.

PROJECT DATA:
${JSON.stringify(projectData, null, 2)}

DETECTED PATTERNS:
${JSON.stringify(patterns, null, 2)}

VARIABLE NAME MAPPINGS (MUST USE THESE EXACT NAMES):
${mappings}

CRITICAL RULES:

1. TOOL TYPES - VERY IMPORTANT:
   - **Function Tools** (type: "function"): ALWAYS define INLINE within agent files using "inlineContent" array
   - **MCP Tools** (type: "mcp"): Create separate files in tools/ directory
   - VALID FILE TYPES: Only use these exact types: "agent", "tool", "dataComponent", "artifactComponent", "environment", "index"
   - NEVER create file type "functionTool" - function tools go in "inlineContent" of agent files

2. File Structure:
   - If patterns show "toolsLocation": "inline", ALL tools should be in "inlineContent" of agent files
   - If patterns show "toolsLocation": "separate", MCP tools get separate files, function tools still inline
   - Follow the detected file naming convention (kebab-case, camelCase, or snake_case)

3. Variable Names:
   - MUST use the exact variable names from the mappings above
   - If ID "weather" is used by both agent and subAgent, they will have different variable names
   - Do NOT generate new variable names - use what's provided

4. File Placement:
   - agents/ directory: Agent files (with function tools in "inlineContent")
   - tools/ directory: MCP tool files only
   - data-components/ directory: Data component files
   - artifact-components/ directory: Artifact component files
   - environments/ directory: Environment/credential files
   - index.ts: Main project file

5. Dependencies:
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
      "path": "index.ts",
      "type": "index",
      "entities": [
        {
          "id": "${projectData.id}",
          "variableName": "${camelCase(projectData.id)}",
          "entityType": "agent",
          "exportName": "${camelCase(projectData.id)}"
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
	const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

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
function camelCase(str: string): string {
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
