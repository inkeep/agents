/**
 * File Generators with Registry Support
 *
 * Enhanced generation functions that use the variable name registry
 * and detected patterns to generate consistent code.
 */

import { writeFileSync } from 'node:fs';
import type { FullAgentDefinition, ModelSettings } from '@inkeep/agents-core';
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
import type { VariableNameRegistry } from './variable-name-registry';

export interface GenerationContext {
  plan: GenerationPlan;
  patterns: DetectedPatterns;
  fileInfo: FileInfo;
  exampleCode?: string; // Similar existing code to learn from
}

/**
 * Generate agent file with registry support
 */
export async function generateAgentFileWithRegistry(
  agentData: FullAgentDefinition,
  agentId: string,
  outputPath: string,
  modelSettings: ModelSettings,
  context: GenerationContext,
  debug: boolean = false
): Promise<void> {
  const model = createModel(modelSettings);

  // Format registry mappings for this file
  const registryInfo = formatRegistryForFile(context.fileInfo, context.plan.variableRegistry);

  const promptTemplate = `Generate a TypeScript file for an Inkeep agent.

AGENT DATA:
{{DATA}}

AGENT ID: ${agentId}

${getTypeDefinitions()}

DETECTED PATTERNS (FOLLOW THESE):
File Structure: ${context.patterns.fileStructure.toolsLocation} tools
Naming: ${context.patterns.codeStyle.exportNaming}
Multi-line strings: ${context.patterns.codeStyle.multiLineStrings}

${context.exampleCode ? `EXAMPLE CODE (your existing style):\n${context.exampleCode}\n` : ''}

VARIABLE NAME REGISTRY (MUST USE EXACT NAMES):
${registryInfo}

CRITICAL RULES:
1. Use EXACT variable names from the registry above
2. The 'id' field in objects keeps the original value, but variable names may differ
3. If ID "weather" is used by both agent and subAgent, use different variable names (e.g., weatherAgent vs weatherSubAgent)
4. Follow detected patterns for tools:
   - If toolsLocation is "inline", define function tools INSIDE this agent file
   - If toolsLocation is "separate", import tools from other files
5. Match the detected code style (export naming, multi-line strings, etc.)

${NAMING_CONVENTION_RULES}

${IMPORT_INSTRUCTIONS}

REQUIREMENTS:
1. Import { agent, subAgent } from '@inkeep/agents-sdk'
2. Define each agent using the agent() function following the type definitions
3. CRITICAL: For multi-line strings (especially prompts), ALWAYS use template literals with backticks
4. If using zod schemas, import { z } from 'zod'
5. If using headers, import { headers } from '@inkeep/agents-core'
6. Convert template literals {{...}} to use toTemplate method
7. Make zod schemas clean (e.g., z.string().nullable() not z.union([z.string(), z.null()]))

VARIABLE NAME CONFLICT EXAMPLES:
✅ CORRECT:
const weatherSubAgent = subAgent({ id: 'weather', ... });
const weatherAgent = agent({ id: 'weather', defaultSubAgent: weatherSubAgent, ... });

❌ WRONG (name conflict):
const weather = subAgent({ id: 'weather', ... });
const weather = agent({ id: 'weather', ... });

FULL EXAMPLE:
import { agent, subAgent } from '@inkeep/agents-sdk';
import { searchTool } from '../tools/search-tool';
import { weatherTool } from '../tools/weather-tool';

const routerSubAgent = subAgent({
  id: 'router',
  name: 'Router',
  prompt: \`Route requests to appropriate agents\`,
  canTransferTo: () => [qaSubAgent]
});

const qaSubAgent = subAgent({
  id: 'qa',
  name: 'QA Agent',
  prompt: \`You are a helpful QA agent.\`,
  canUse: () => [searchTool, weatherTool]
});

export const supportAgent = agent({
  id: 'support-agent',
  name: 'Support Agent',
  defaultSubAgent: routerSubAgent,
  subAgents: () => [routerSubAgent, qaSubAgent]
});

Generate ONLY the TypeScript code without any markdown or explanations.`;

  if (debug) {
    console.log(`\n[DEBUG] === Starting agent generation with registry: ${agentId} ===`);
    console.log(`[DEBUG] Output path: ${outputPath}`);
    console.log(`[DEBUG] Entities in this file:`, context.fileInfo.entities);
    console.log(`[DEBUG] Dependencies:`, context.fileInfo.dependencies);
  }

  try {
    const startTime = Date.now();

    const text = await generateTextWithPlaceholders(
      model,
      agentData,
      promptTemplate,
      {
        temperature: 0.1,
        maxOutputTokens: 16000,
        abortSignal: AbortSignal.timeout(240000),
      },
      debug
    );

    const duration = Date.now() - startTime;

    if (debug) {
      console.log(`[DEBUG] LLM response received in ${duration}ms`);
      console.log(`[DEBUG] Generated text length: ${text.length} characters`);
    }

    const cleanedCode = cleanGeneratedCode(text);
    writeFileSync(outputPath, cleanedCode);

    if (debug) {
      console.log(`[DEBUG] Agent file written successfully`);
      console.log(`[DEBUG] === Completed agent generation: ${agentId} ===\n`);
    }
  } catch (error: any) {
    if (debug) {
      console.error(`[DEBUG] === ERROR generating agent file ${agentId} ===`);
      console.error(`[DEBUG] Error:`, error.message);
    }
    throw error;
  }
}

/**
 * Generate tool file with registry support
 */
export async function generateToolFileWithRegistry(
  toolData: any,
  toolId: string,
  outputPath: string,
  modelSettings: ModelSettings,
  context: GenerationContext
): Promise<void> {
  const model = createModel(modelSettings);

  // Format registry mappings for this file
  const registryInfo = formatRegistryForFile(context.fileInfo, context.plan.variableRegistry);

  const promptTemplate = `Generate a TypeScript file for an Inkeep tool.

TOOL DATA:
{{DATA}}

TOOL ID: ${toolId}

${getTypeDefinitions()}

VARIABLE NAME REGISTRY (MUST USE EXACT NAMES):
${registryInfo}

${NAMING_CONVENTION_RULES}

${IMPORT_INSTRUCTIONS}

REQUIREMENTS:
1. Import mcpTool from '@inkeep/agents-sdk'
2. Use exact variable name from registry
3. CRITICAL: Always include serverUrl property (required by SDK) extracted from config.mcp.server.url
4. Use individual properties supported by mcpTool - do NOT use nested config object
5. If credentialReferenceId exists, add it as a credential property using envSettings.getEnvironmentSetting()
6. Convert credentialReferenceId to credential key format by replacing hyphens with underscores

EXAMPLE:
import { envSettings } from '../environments';
import { mcpTool } from '@inkeep/agents-sdk';

export const inkeepFacts = mcpTool({
  id: 'inkeep_facts',
  name: 'inkeep_facts',
  serverUrl: 'https://mcp.inkeep.com/inkeep/mcp',
  credential: envSettings.getEnvironmentSetting('inkeep_api_credential')
});

Generate ONLY the TypeScript code without any markdown or explanations.`;

  const text = await generateTextWithPlaceholders(model, toolData, promptTemplate, {
    temperature: 0.1,
    maxOutputTokens: 4000,
    abortSignal: AbortSignal.timeout(60000),
  });

  writeFileSync(outputPath, cleanGeneratedCode(text));
}

/**
 * Generate index file with registry support
 */
export async function generateIndexFileWithRegistry(
  projectData: any,
  outputPath: string,
  modelSettings: ModelSettings,
  context: GenerationContext
): Promise<void> {
  const model = createModel(modelSettings);

  // Format all imports based on plan
  const importMappings = generateImportMappings(context.plan);

  const promptTemplate = `Generate index.ts for Inkeep project.

PROJECT DATA:
{{DATA}}

${getTypeDefinitions()}

IMPORT MAPPINGS (MUST USE THESE):
${importMappings}

VARIABLE NAME REGISTRY:
${formatRegistryForPrompt(context.plan.variableRegistry)}

${NAMING_CONVENTION_RULES}

${IMPORT_INSTRUCTIONS}

CRITICAL:
- Import using the exact variable names from registry
- The project() call should reference agents/tools by their variable names
- Agent/tool IDs in the project object are just keys, use actual variable references

EXAMPLE:
import { project } from '@inkeep/agents-sdk';
import { dataWorkshopAgent } from './agents/data-workshop-agent';
import { weatherAgent } from './agents/weather-agent';
import { weatherForecast } from './data-components/weather-forecast';
import { fdxgfv9HL7SXlfynPx8hf } from './tools/fdxgfv9HL7SXlfynPx8hf';
import { fUI2riwrBVJ6MepT8rjx0 } from './tools/fUI2riwrBVJ6MepT8rjx0';

export const myProject = project({
  id: 'my-weather-project',
  name: 'Weather Project',
  description: 'Project containing sample agent framework',
  models: {
    base: { model: 'openai/gpt-4o-mini' }
  },
  agents: () => [weatherAgent, dataWorkshopAgent],
  tools: () => [fUI2riwrBVJ6MepT8rjx0, fdxgfv9HL7SXlfynPx8hf],
  dataComponents: () => [weatherForecast]
});

Generate ONLY the TypeScript code without markdown.`;

  const text = await generateTextWithPlaceholders(model, projectData, promptTemplate, {
    temperature: 0.1,
    maxOutputTokens: 4000,
    abortSignal: AbortSignal.timeout(60000),
  });

  writeFileSync(outputPath, cleanGeneratedCode(text));
}

/**
 * Format registry information for a specific file
 */
function formatRegistryForFile(fileInfo: FileInfo, _registry: VariableNameRegistry): string {
  let result = 'Entities in this file:\n';

  for (const entity of fileInfo.entities) {
    result += `  - ${entity.entityType} with id="${entity.id}" MUST use variable name: ${entity.variableName}\n`;
  }

  if (fileInfo.inlineContent && fileInfo.inlineContent.length > 0) {
    result += '\nInline content (defined in this file):\n';
    for (const entity of fileInfo.inlineContent) {
      result += `  - ${entity.entityType} with id="${entity.id}" → ${entity.variableName}\n`;
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
 * Format registry for full prompt
 */
function formatRegistryForPrompt(registry: VariableNameRegistry): string {
  let result = '';

  if (registry.agents.size > 0) {
    result += '\nAGENTS:\n';
    for (const [id, variableName] of registry.agents.entries()) {
      result += `  - id: "${id}" → variableName: "${variableName}"\n`;
    }
  }

  if (registry.subAgents.size > 0) {
    result += '\nSUBAGENTS:\n';
    for (const [id, variableName] of registry.subAgents.entries()) {
      result += `  - id: "${id}" → variableName: "${variableName}"\n`;
    }
  }

  if (registry.tools.size > 0) {
    result += '\nTOOLS:\n';
    for (const [id, variableName] of registry.tools.entries()) {
      result += `  - id: "${id}" → variableName: "${variableName}"\n`;
    }
  }

  if (registry.dataComponents.size > 0) {
    result += '\nDATA COMPONENTS:\n';
    for (const [id, variableName] of registry.dataComponents.entries()) {
      result += `  - id: "${id}" → variableName: "${variableName}"\n`;
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
