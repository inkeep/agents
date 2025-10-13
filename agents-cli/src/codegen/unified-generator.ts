/**
 * Unified File Generator
 *
 * Single generator that works off the generation plan.
 * The planner determines file structure, this just generates based on that plan.
 */

import { writeFileSync } from 'node:fs';
import type { FullProjectDefinition, ModelSettings } from '@inkeep/agents-core';
import {
	cleanGeneratedCode,
	createModel,
	generateTextWithPlaceholders,
	getTypeDefinitions,
	IMPORT_INSTRUCTIONS,
	NAMING_CONVENTION_RULES,
} from '../commands/pull.llm-generate';
import type { DetectedPatterns } from './pattern-analyzer';
import type { FileInfo, GenerationPlan } from './plan-builder';

export interface GenerationContext {
	plan: GenerationPlan;
	patterns: DetectedPatterns;
	fileInfo: FileInfo;
	exampleCode?: string;
}

export interface DirectoryStructure {
	projectRoot: string;
	agentsDir: string;
	toolsDir: string;
	dataComponentsDir: string;
	artifactComponentsDir: string;
	environmentsDir: string;
}

/**
 * Generate all files from plan in parallel
 */
export async function generateFilesFromPlan(
	plan: GenerationPlan,
	projectData: FullProjectDefinition,
	dirs: DirectoryStructure,
	modelSettings: ModelSettings,
	debug: boolean = false
): Promise<void> {
	// Create generation tasks for each file in parallel
	const tasks = plan.files.map((fileInfo) =>
		generateFile(fileInfo, projectData, plan, dirs, modelSettings, debug)
	);

	// Execute all in parallel
	await Promise.all(tasks);
}

/**
 * Generate a single file based on plan
 */
async function generateFile(
	fileInfo: FileInfo,
	projectData: FullProjectDefinition,
	plan: GenerationPlan,
	dirs: DirectoryStructure,
	modelSettings: ModelSettings,
	debug: boolean
): Promise<void> {
	const model = createModel(modelSettings);

	// Determine output path
	const outputPath = `${dirs.projectRoot}/${fileInfo.path}`;

	// Extract relevant data for this file
	const fileData = extractDataForFile(fileInfo, projectData);

	// Find example code if available
	const exampleCode = findExampleCode(fileInfo, plan.patterns);

	// Create generation context
	const context: GenerationContext = {
		plan,
		patterns: plan.patterns,
		fileInfo,
		exampleCode,
	};

	// Format registry information for this specific file
	const registryInfo = formatRegistryForFile(fileInfo, plan.variableRegistry);

	// Create prompt based on file type
	const promptTemplate = createPromptForFile(fileInfo, fileData, context, registryInfo);

	if (debug) {
		console.log(`[DEBUG] Generating file: ${fileInfo.path}`);
		console.log(`[DEBUG] File type: ${fileInfo.type}`);
		console.log(`[DEBUG] Entities: ${fileInfo.entities.map((e) => e.variableName).join(', ')}`);
	}

	try {
		const text = await generateTextWithPlaceholders(
			model,
			fileData,
			promptTemplate,
			{
				temperature: 0.1,
				maxOutputTokens: fileInfo.type === 'agent' ? 16000 : 4000,
				abortSignal: AbortSignal.timeout(fileInfo.type === 'agent' ? 240000 : 60000),
			},
			debug
		);

		const cleanedCode = cleanGeneratedCode(text);
		writeFileSync(outputPath, cleanedCode);

		if (debug) {
			console.log(`[DEBUG] ✓ Generated: ${fileInfo.path}`);
		}
	} catch (error: any) {
		console.error(`[ERROR] Failed to generate ${fileInfo.path}:`, error.message);
		throw error;
	}
}

/**
 * Extract data relevant to this file from full project data
 */
function extractDataForFile(
	fileInfo: FileInfo,
	projectData: FullProjectDefinition
): any {
	switch (fileInfo.type) {
		case 'index':
			// Index needs full project data
			return projectData;

		case 'agent': {
			// Extract agent data by ID
			const agentId = fileInfo.entities.find((e) => e.entityType === 'agent')?.id;
			if (agentId && projectData.agents) {
				return projectData.agents[agentId];
			}
			return {};
		}

		case 'tool': {
			// Extract tool data by ID
			const toolId = fileInfo.entities[0]?.id;
			if (toolId && projectData.tools) {
				return projectData.tools[toolId];
			}
			return {};
		}

		case 'dataComponent': {
			// Extract data component by ID
			const compId = fileInfo.entities[0]?.id;
			if (compId && projectData.dataComponents) {
				return projectData.dataComponents[compId];
			}
			return {};
		}

		case 'artifactComponent': {
			// Extract artifact component by ID
			const compId = fileInfo.entities[0]?.id;
			if (compId && projectData.artifactComponents) {
				return projectData.artifactComponents[compId];
			}
			return {};
		}

		case 'environment':
			// Environment files get credential data
			return projectData.credentialReferences || {};

		default:
			return {};
	}
}

/**
 * Find example code from detected patterns
 */
function findExampleCode(fileInfo: FileInfo, patterns: DetectedPatterns): string | undefined {
	switch (fileInfo.type) {
		case 'agent':
			return patterns.examples.sampleAgentFile;
		case 'tool':
			return patterns.examples.sampleToolFile;
		default:
			return undefined;
	}
}

/**
 * Create prompt for specific file type
 */
function createPromptForFile(
	fileInfo: FileInfo,
	fileData: any,
	context: GenerationContext,
	registryInfo: string
): string {
	const commonInstructions = `
${getTypeDefinitions()}

DETECTED PATTERNS (FOLLOW THESE):
- File Structure: ${context.patterns.fileStructure.toolsLocation} tools
- File Naming: ${context.patterns.fileStructure.preferredFileNaming}
- Export Style: ${context.patterns.codeStyle.exportNaming}
- Multi-line strings: ${context.patterns.codeStyle.multiLineStrings}

${context.exampleCode ? `EXAMPLE CODE (your existing style):\n${context.exampleCode}\n` : ''}

VARIABLE NAME REGISTRY (MUST USE EXACT NAMES):
${registryInfo}

${NAMING_CONVENTION_RULES}

${IMPORT_INSTRUCTIONS}

CRITICAL RULES:
1. Use EXACT variable names from the registry above
2. The 'id' field in objects keeps the original value
3. Variable names must be unique (no conflicts across types)
4. Follow detected patterns for code style
5. Match existing formatting and conventions
`;

	switch (fileInfo.type) {
		case 'index':
			return createIndexPrompt(fileData, context, registryInfo, commonInstructions);

		case 'agent':
			return createAgentPrompt(fileData, context, registryInfo, commonInstructions);

		case 'tool':
			return createToolPrompt(fileData, context, registryInfo, commonInstructions);

		case 'dataComponent':
			return createDataComponentPrompt(fileData, context, registryInfo, commonInstructions);

		case 'artifactComponent':
			return createArtifactComponentPrompt(fileData, context, registryInfo, commonInstructions);

		default:
			throw new Error(`Unknown file type: ${fileInfo.type}`);
	}
}

/**
 * Create prompt for index file
 */
function createIndexPrompt(
	projectData: any,
	context: GenerationContext,
	registryInfo: string,
	commonInstructions: string
): string {
	const importMappings = generateImportMappings(context.plan);

	return `Generate index.ts for Inkeep project.

PROJECT DATA:
{{DATA}}

IMPORT MAPPINGS (MUST USE THESE):
${importMappings}

${commonInstructions}

EXAMPLE:
import { project } from '@inkeep/agents-sdk';
import { weatherAgent } from './agents/weather-agent';
import { weatherApi } from './tools/weather-api';

export const myProject = project({
  id: 'my-weather-project',
  name: 'Weather Project',
  models: { base: { model: 'openai/gpt-4o-mini' } },
  agents: () => [weatherAgent],
  tools: () => [weatherApi]
});

Generate ONLY the TypeScript code without markdown.`;
}

/**
 * Create prompt for agent file
 */
function createAgentPrompt(
	agentData: any,
	context: GenerationContext,
	registryInfo: string,
	commonInstructions: string
): string {
	const inlineTools = context.fileInfo.inlineContent || [];
	const hasInlineTools = inlineTools.length > 0;

	return `Generate TypeScript file for Inkeep agent.

AGENT DATA:
{{DATA}}

${commonInstructions}

INLINE CONTENT:
${hasInlineTools ? `This file should define these tools inline:\n${inlineTools.map((e) => `- ${e.variableName} (${e.entityType})`).join('\n')}` : 'No inline content - import all dependencies'}

${hasInlineTools ? `
FUNCTION TOOL API (CRITICAL):
functionTool({
  name: 'tool-name',  // Use 'name' NOT 'id'
  description: 'Tool description',
  inputSchema: {
    type: 'object',
    properties: { ... },
    required: [...]
  },
  execute: async (params: { ... }) => {  // Use 'execute' function NOT 'executeCode' string
    // Implementation here
    return { ... };
  }
})

EXAMPLE:
const calculateBMI = functionTool({
  name: 'calculate-bmi',
  description: 'Calculates BMI',
  inputSchema: {
    type: 'object',
    properties: {
      weight: { type: 'number', description: 'Weight in kg' },
      height: { type: 'number', description: 'Height in meters' }
    },
    required: ['weight', 'height']
  },
  execute: async (params: { weight: number; height: number }) => {
    try {
      const bmi = params.weight / (params.height * params.height);
      return { bmi: Math.round(bmi * 10) / 10 };
    } catch (error: any) {  // Type catch parameter as 'any' for TypeScript
      throw new Error(\`BMI calculation failed: \${error.message}\`);
    }
  }
});
` : ''}

IMPORTS (CRITICAL - MUST BE FIRST):
ALWAYS import these from '@inkeep/agents-sdk' at the TOP of the file:
import { agent, subAgent, functionTool } from '@inkeep/agents-sdk';

SUBAGENT AND AGENT API (CRITICAL):
- Use 'canUse' (NOT 'tools') - must be a FUNCTION returning array
- Use 'canDelegateTo' - must be a FUNCTION returning array
- Use 'dataComponents' - must be a FUNCTION returning array
- Use 'subAgents' in agent() - must be a FUNCTION returning array
- For multi-line strings (like 'prompt'), ALWAYS use template literals (backticks \`...\`)

✅ CORRECT:
const weatherSubAgent = subAgent({
  id: 'weather',
  name: 'Weather Sub',
  description: '...',
  prompt: \`You are a helpful assistant.
When users ask about weather, use your tools.
Always be clear and concise.\`,  // Template literal for multi-line
  canUse: () => [tool1, tool2],  // FUNCTION returning array
  canDelegateTo: () => [otherAgent],  // FUNCTION returning array
  dataComponents: () => [component1]  // FUNCTION returning array
});

const weatherAgent = agent({
  id: 'weather',
  name: 'Weather Agent',
  defaultSubAgent: weatherSubAgent,
  subAgents: () => [weatherSubAgent]  // FUNCTION returning array
});

❌ WRONG:
prompt: 'Multi-line
string',  // NO - use backticks for multi-line
tools: [tool1, tool2],  // NO - use 'canUse' not 'tools'
canUse: [tool1, tool2],  // NO - must be a function
subAgents: [weatherSubAgent],  // NO - must be a function

Generate ONLY the TypeScript code without markdown.`;
}

/**
 * Create prompt for tool file
 */
function createToolPrompt(
	toolData: any,
	context: GenerationContext,
	registryInfo: string,
	commonInstructions: string
): string {
	return `Generate TypeScript file for Inkeep tool.

TOOL DATA:
{{DATA}}

${commonInstructions}

REQUIREMENTS:
1. Import mcpTool or functionTool from '@inkeep/agents-sdk'
2. Use exact variable name from registry
3. Include serverUrl property if MCP tool
4. Handle credentials using envSettings if needed

Generate ONLY the TypeScript code without markdown.`;
}

/**
 * Create prompt for data component file
 */
function createDataComponentPrompt(
	componentData: any,
	context: GenerationContext,
	registryInfo: string,
	commonInstructions: string
): string {
	return `Generate TypeScript file for Inkeep data component.

COMPONENT DATA:
{{DATA}}

${commonInstructions}

DATA COMPONENT API (CRITICAL):
dataComponent({
  id: 'component-id',
  name: 'ComponentName',
  description: 'Component description',
  props: {  // Use 'props' NOT 'propsSchema'
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { ... },
    required: [...],
    additionalProperties: false
  }
})

EXAMPLE:
export const weatherForecast = dataComponent({
  id: 'weather-forecast',
  name: 'WeatherForecast',
  description: 'Hourly weather forecast',
  props: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      forecast: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            time: { type: 'string' },
            temperature: { type: 'number' }
          },
          required: ['time', 'temperature']
        }
      }
    },
    required: ['forecast'],
    additionalProperties: false
  }
});

REQUIREMENTS:
1. Import dataComponent from '@inkeep/agents-sdk'
2. Use exact variable name from registry
3. Use 'props' property with JSON Schema format
4. Include 'id', 'name', and 'description' properties

Generate ONLY the TypeScript code without markdown.`;
}

/**
 * Create prompt for artifact component file
 */
function createArtifactComponentPrompt(
	componentData: any,
	context: GenerationContext,
	registryInfo: string,
	commonInstructions: string
): string {
	return `Generate TypeScript file for Inkeep artifact component.

COMPONENT DATA:
{{DATA}}

${commonInstructions}

REQUIREMENTS:
1. Import artifactComponent from '@inkeep/agents-sdk'
2. Import z from 'zod' and preview from '@inkeep/agents-core'
3. Use exact variable name from registry
4. Use preview() for fields shown in previews
5. Include 'id' property

Generate ONLY the TypeScript code without markdown.`;
}

/**
 * Format registry information for a specific file
 */
function formatRegistryForFile(fileInfo: FileInfo, registry: any): string {
	let result = 'Entities in this file:\n';

	for (const entity of fileInfo.entities) {
		result += `  - ${entity.entityType} "${entity.id}" → variable: ${entity.variableName}\n`;
	}

	if (fileInfo.inlineContent && fileInfo.inlineContent.length > 0) {
		result += '\nInline content (defined in this file):\n';
		for (const entity of fileInfo.inlineContent) {
			result += `  - ${entity.entityType} "${entity.id}" → variable: ${entity.variableName}\n`;
		}
	}

	if (fileInfo.dependencies.length > 0) {
		result += '\nDependencies to import:\n';
		for (const dep of fileInfo.dependencies) {
			result += `  - import { ${dep.variableName} } from '${dep.fromPath}';\n`;
		}
	}

	return result;
}

/**
 * Generate import mappings from plan
 */
function generateImportMappings(plan: GenerationPlan): string {
	let result = '';

	for (const file of plan.files) {
		if (file.type !== 'index' && file.type !== 'environment') {
			for (const entity of file.entities) {
				const importPath = `./${file.path.replace('.ts', '')}`;
				result += `  - ${entity.variableName} from '${importPath}'\n`;
			}
		}
	}

	return result;
}
