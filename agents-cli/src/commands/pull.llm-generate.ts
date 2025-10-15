import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI, openai } from '@ai-sdk/openai';
import type { FullAgentDefinition, ModelSettings } from '@inkeep/agents-core';
import { ANTHROPIC_MODELS, GOOGLE_MODELS, OPENAI_MODELS } from '@inkeep/agents-core';
import { generateText } from 'ai';
import {
  calculateTokenSavings,
  createPlaceholders,
  restorePlaceholders,
} from './pull.placeholder-system';

// Create require function for ESM context
const require = createRequire(import.meta.url);

/**
 * Read the complete type definitions from @inkeep/agents-sdk package
 * This provides the LLM with full type context for generating code
 * @internal - Exported for testing purposes
 */
export function getTypeDefinitions(): string {
  try {
    // Resolve package from node_modules using require.resolve
    // This mirrors TypeScript's actual module resolution and works in:
    // - Monorepo workspaces (resolves to workspace package)
    // - Published packages (resolves to node_modules)
    // - Different environments (no hardcoded relative paths)
    const sdkPackagePath = require.resolve('@inkeep/agents-sdk/package.json');
    const sdkPackageDir = join(sdkPackagePath, '..');
    const sdkDtsPath = join(sdkPackageDir, 'dist/index.d.ts');

    // Read the entire declaration file - let the LLM see all available types
    const dtsContent = readFileSync(sdkDtsPath, 'utf-8');

    return `
TYPESCRIPT TYPE DEFINITIONS (from @inkeep/agents-sdk):

The following is the complete type definition file from '@inkeep/agents-sdk'.

---START OF TYPE DEFINITIONS---
${dtsContent}
---END OF TYPE DEFINITIONS---
`;
  } catch (error) {
    // Fallback to comment if extraction fails
    console.warn('Could not read type definitions:', error);
    return `
// Type definitions from @inkeep/agents-sdk could not be loaded.
`;
  }
}

/**
 * Create a language model instance from configuration
 * Similar to ModelFactory but simplified for CLI use
 * @internal - Exported for use in codegen modules
 */
export function createModel(config: ModelSettings): any {
  // Extract from model settings - model is required
  if (!config.model) {
    throw new Error('Model configuration is required for pull command');
  }
  const modelString = config.model;
  const providerOptions = config.providerOptions;

  const { provider, modelName } = parseModelString(modelString);

  switch (provider) {
    case 'anthropic':
      if (providerOptions) {
        const provider = createAnthropic(providerOptions);
        return provider(modelName);
      }
      return anthropic(modelName);

    case 'openai':
      if (providerOptions) {
        const provider = createOpenAI(providerOptions);
        return provider(modelName);
      }
      return openai(modelName);

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

const PROJECT_JSON_EXAMPLE = `
---START OF PROJECT JSON EXAMPLE---
{
  "id": "my-project",
  "name": "My Project",
  "description": "test test",
  "models": {
    "base": {
      "model": "${ANTHROPIC_MODELS.CLAUDE_OPUS_4_1_20250805}",
      "providerOptions": {
        "temperature": 0.7,
        "maxTokens": 2096
      }
    },
    "structuredOutput": {
      "model": "${OPENAI_MODELS.GPT_4_1_MINI_20250414}",
      "providerOptions": {
        "temperature": 0.4,
        "maxTokens": 2048
      }
    },
    "summarizer": {
      "model": "${OPENAI_MODELS.GPT_5_NANO_20250807}",
      "providerOptions": {
        "temperature": 0.8,
        "maxTokens": 1024
      }
    }
  },
  "stopWhen": {
    "transferCountIs": 10,
    "stepCountIs": 24
  },
  "agent": {
    "customer-service": {
      "id": "customer-service",
      "name": "customer-service",
      "description": "respond to customer service requests",
      "defaultSubAgentId": "router",
      "subAgents": {
        "refund-agent": {
          "id": "refund-agent",
          "name": "Refund Agent",
          "description": "This agent is responsible for refunding customer orders",
          "prompt": "Refund customer orders based on the following criteria:\n- Order is under $100\n- Order was placed in the last 30 days\n- Customer has no other refunds in the last 30 days",
          "models": {
            "base": {
              "model": "${GOOGLE_MODELS.GEMINI_2_5_FLASH}"
            }
          },
          "stopWhen": {
            "stepCountIs": 24
          },
          "canTransferTo": ["router"],
          "canDelegateTo": [],
          "dataComponents": [],
          "artifactComponents": [],
          "canUse": []
        },
        "router": {
          "id": "router",
          "name": "Router",
          "description": "Routing incoming requests",
          "prompt": "You route incoming requests to the correect agent",
          "models": null,
          "stopWhen": {
            "stepCountIs": 24
          },
          "canTransferTo": ["refund-agent"],
          "canDelegateTo": [],
          "dataComponents": [],
          "artifactComponents": [],
          "canUse": []
        }
      },
      "createdAt": "2025-10-05T16:40:22.655Z",
      "updatedAt": "2025-10-05T16:43:26.813Z",
      "models": {
        "base": {
          "model": "${ANTHROPIC_MODELS.CLAUDE_SONNET_4_20250514}",
          "providerOptions": {
            "temperature": 0.5
          }
        }
      },
      "statusUpdates": {
        "numEvents": 10,
        "timeInSeconds": 13
      },
      "stopWhen": {
        "transferCountIs": 5
      }
    }
  },
  "tools": {},
  "dataComponents": {
    "listorders": {
      "id": "listorders",
      "name": "ListOrders",
      "description": "Display a list of customer orders",
      "props": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "An object containing a list of orders.",
        "properties": {
          "orders": {
            "type": "array",
            "description": "A list of order objects.",
            "items": {
              "type": "object",
              "description": "An individual order with identifying and creation details.",
              "properties": {
                "id": {
                  "type": "string",
                  "description": "Unique identifier for the order."
                },
                "name": {
                  "type": "string",
                  "description": "Human-readable name or label for the order."
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time",
                  "description": "Timestamp when the order was created, in ISO 8601 format."
                }
              },
              "required": ["id", "name", "createdAt"]
            }
          }
        },
        "required": ["orders"]
      }
    }
  },
  "artifactComponents": {},
  "credentialReferences": {},
  "createdAt": "2025-10-05T16:25:10.238Z",
  "updatedAt": "2025-10-05T16:27:27.777Z"
}
---END OF PROJECT JSON EXAMPLE---
`;

/**
 * Reusable naming convention rules for all LLM generation functions
 * @internal - Exported for use in codegen modules
 */
export const NAMING_CONVENTION_RULES = `
CRITICAL NAMING CONVENTION RULES (Apply to ALL imports/exports):
- File paths use kebab-case naming (e.g., '../tools/tool-name', '../data-components/component-name')
- Variable names MUST be camelCase versions of the entity ID
- Conversion rules for variable names:
  - IDs with underscores: 'inkeep_facts' → inkeepFacts
  - IDs with hyphens: 'weather-api' → weatherApi
  - IDs with both: 'my_weather-api' → myWeatherApi
  - Random/UUID IDs: Keep as-is (e.g., 'fUI2riwrBVJ6MepT8rjx0' → fUI2riwrBVJ6MepT8rjx0)
- The ID field in the exported object keeps the original format
- IMPORTANT: Import paths use kebab-case file names, NOT entity IDs
- Examples:
  - Tool: import { toolName } from '../tools/tool-name'; export const toolName = mcpTool({ id: 'tool_id', ... })
  - Component: import { componentName } from '../data-components/component-name'; export const componentName = dataComponent({ id: 'component-id', ... })
  - Agent: import { agentName } from './agents/agent-name'; export const agentName = agent({ id: 'agent-id', ... })
`;

/**
 * Import instruction rules for LLM generation
 * @internal - Exported for use in codegen modules
 */
export const IMPORT_INSTRUCTIONS = `
CRITICAL: All imports MUST be alphabetically sorted (both named imports and path names)

CRITICAL IMPORT PATTERNS:
- Tools: Import from '../tools/{file-name}' (use kebab-case file names)
- Data components: Import from '../data-components/{file-name}' (use kebab-case file names)
- Artifact components: Import from '../artifact-components/{file-name}' (use kebab-case file names)
- Agent: Import from './agents/{file-name}' (use kebab-case file names)

NEVER use barrel imports from directories:
❌ WRONG: import { ordersList, refundApproval } from '../data-components';
✅ CORRECT:
   import { ordersList } from '../data-components/orders-list';
   import { refundApproval } from '../data-components/refund-approval';

EXAMPLES: 
// Multiple data components - each from individual file:
import { ordersList } from '../data-components/orders-list';
import { refundApproval } from '../data-components/refund-approval';

// Tools - each from individual file:
import { inkeepFacts } from '../tools/inkeep_facts';
import { weatherApi } from '../tools/weather-api';

// Agent - each from individual file:
import { inkeepQaAgent } from './agent/inkeep-qa-agent';
import { weatherAgent } from './agent/weather-agent';
`;

/**
 * Clean generated text by removing markdown code fences
 * @internal - Exported for use in codegen modules
 */
export function cleanGeneratedCode(text: string): string {
  // Remove opening and closing markdown code fences
  // Handles ```typescript, ```ts, or just ```
  return text
    .replace(/^```(?:typescript|ts)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}

/**
 * Enhanced generateText wrapper with placeholder support
 *
 * @param model - The language model instance
 * @param data - The data object to process for placeholders
 * @param promptTemplate - Template string with {{DATA}} placeholder for data insertion
 * @param options - Generation options (temperature, maxTokens, etc.)
 * @param debug - Whether to log debug information
 * @returns Generated and processed text with placeholders restored
 */
export async function generateTextWithPlaceholders(
  model: any,
  data: any,
  promptTemplate: string,
  options: {
    temperature?: number;
    maxOutputTokens?: number;
    abortSignal?: AbortSignal;
  },
  debug: boolean = false,
  context?: { fileType?: string }
): Promise<string> {
  // Create placeholders to reduce prompt size
  const { processedData, replacements } = createPlaceholders(data, context);

  if (debug && Object.keys(replacements).length > 0) {
    const savings = calculateTokenSavings(data, processedData);
    console.log(`[DEBUG] Placeholder optimization:`);
    console.log(`[DEBUG]   - Original data size: ${savings.originalSize} characters`);
    console.log(`[DEBUG]   - Processed data size: ${savings.processedSize} characters`);
    console.log(
      `[DEBUG]   - Token savings: ${savings.savings} characters (${savings.savingsPercentage.toFixed(1)}%)`
    );
    console.log(`[DEBUG]   - Placeholders created: ${Object.keys(replacements).length}`);
  }

  // Replace {{DATA}} in the prompt template with the processed data
  const prompt = promptTemplate.replace('{{DATA}}', JSON.stringify(processedData, null, 2));

  if (debug) {
    console.log(`[DEBUG] Final prompt size: ${prompt.length} characters`);
  }

  // Generate text using the LLM
  const { text } = await generateText({
    model,
    prompt,
    ...options,
  });

  // Restore placeholders in the generated code
  const restoredText = restorePlaceholders(text, replacements);

  if (debug && Object.keys(replacements).length > 0) {
    console.log(`[DEBUG] Placeholders restored successfully`);
  }

  return restoredText;
}

/**
 * Parse model string to extract provider and model name
 */
function parseModelString(modelString: string): { provider: string; modelName: string } {
  if (modelString.includes('/')) {
    const [provider, ...modelParts] = modelString.split('/');
    return {
      provider: provider.toLowerCase(),
      modelName: modelParts.join('/'),
    };
  }

  // Default to anthropic if no provider specified
  return {
    provider: 'anthropic',
    modelName: modelString,
  };
}

/**
 * Generate index.ts file with complete project definition
 */
export async function generateIndexFile(
  projectData: any,
  outputPath: string,
  modelSettings: ModelSettings
): Promise<void> {
  const model = createModel(modelSettings);

  const promptTemplate = `Generate a TypeScript index.ts file for an Inkeep project with the following data:

PROJECT JSON DATA:
{{DATA}}


${getTypeDefinitions()}

${NAMING_CONVENTION_RULES}

${IMPORT_INSTRUCTIONS}


REQUIREMENTS:
1. Import the project function from '@inkeep/agents-sdk'
2. The project object should include all required properties and any optional properties (according to the type definitions) that are present in the project data

PROJECT JSON EXAMPLE:
${PROJECT_JSON_EXAMPLE}


EXAMPLE OUTPUT:
import { project } from '@inkeep/agents-sdk';

export const myProject = project({
  id: 'my-project',
  name: 'My Project',
  description: 'test test',
  models: {
    base: { model: 'gpt-4o-mini' }
  }
});

Generate ONLY the TypeScript code without any markdown or explanations.`;

  const text = await generateTextWithPlaceholders(model, projectData, promptTemplate, {
    temperature: 0.1,
    maxOutputTokens: 4000,
    abortSignal: AbortSignal.timeout(60000), // 60 second timeout
  });

  writeFileSync(outputPath, cleanGeneratedCode(text));
}

/**
 * Generate import path mappings for the LLM prompt
 */
function generateImportMappings(
  toolFilenames?: Map<string, string>,
  componentFilenames?: Map<string, string>
): string {
  let result = '';
  
  if (toolFilenames && toolFilenames.size > 0) {
    result += 'TOOLS (use exact import paths):\n';
    for (const [toolId, fileName] of toolFilenames.entries()) {
      result += `  - Tool ID: "${toolId}" → Import: "../tools/${fileName.replace('.ts', '')}"\n`;
    }
    result += '\n';
  }
  
  if (componentFilenames && componentFilenames.size > 0) {
    result += 'COMPONENTS (use exact import paths):\n';
    for (const [componentId, fileName] of componentFilenames.entries()) {
      // Determine directory based on component type patterns
      let directory = 'components'; // fallback
      if (fileName.includes('data-') || componentId.includes('data-')) {
        directory = 'data-components';
      } else if (fileName.includes('artifact-') || componentId.includes('artifact-')) {
        directory = 'artifact-components';
      } else if (fileName.includes('status-') || componentId.includes('status-')) {
        directory = 'status-components';
      }
      result += `  - Component ID: "${componentId}" → Import: "../${directory}/${fileName.replace('.ts', '')}"\n`;
    }
  }
  
  return result;
}

/**
 * Generate an agent TypeScript file
 */
export async function generateAgentFile(
  agentData: FullAgentDefinition,
  agentId: string,
  outputPath: string,
  modelSettings: ModelSettings,
  toolFilenames?: Map<string, string>,
  componentFilenames?: Map<string, string>,
  debug: boolean = false
): Promise<void> {
  const model = createModel(modelSettings);

  const promptTemplate = `Generate a TypeScript file for an Inkeep agent.

AGENT DATA:
{{DATA}}

AGENT ID: ${agentId}

${toolFilenames || componentFilenames ? `IMPORT PATH MAPPINGS (CRITICAL - USE EXACT PATHS):
${generateImportMappings(toolFilenames, componentFilenames)}

!!! WARNING: Entity IDs ≠ File Paths !!!
- Entity IDs may use underscores or different naming
- File paths use kebab-case naming convention
- ALWAYS use the exact import paths from the mappings above
- NEVER use entity IDs directly as import paths

` : ''}${getTypeDefinitions()}

IMPORTANT CONTEXT:
- Agents reference resources (tools, components) by their imported variable names
- Tools and components are referenced by variable names in code, but imports use FILE PATHS
- CRITICAL: Import statements use file paths (../tools/tool-filename), NOT tool IDs
- Variable names in canUse() arrays should match the imported variable names
- If contextConfig is present, it must be imported from '@inkeep/agents-core' and used to create the context config

${NAMING_CONVENTION_RULES}

${IMPORT_INSTRUCTIONS}

REQUIREMENTS:
1. IMPORTS (CRITICAL - USE FILE PATHS, NOT IDs):
   - For tool/component imports: Use ONLY the exact file paths from IMPORT PATH MAPPINGS above
   - Import paths are based on actual file names, not entity IDs
   - Always use kebab-case file paths (../tools/tool-name, not ../tools/tool_name)
   - ALWAYS import { agent, subAgent } from '@inkeep/agents-sdk'
   - ALWAYS import { z } from 'zod' when using ANY Zod schemas (responseSchema, headersSchema, etc.)
   - ALWAYS import { contextConfig, fetchDefinition, headers } from '@inkeep/agents-core' when agent has contextConfig
   - Import status components from '../status-components/' when needed
2. Define each agent using the agent() function following the type definitions provided above
3. Create the agent using agent() with proper structure
   - IMPORTANT: If description is null, undefined, or empty string, omit the description field entirely
4. CRITICAL: Template Literals vs Raw Code:
   - For STRING VALUES: ALWAYS use template literals with backticks: \`string content\`
   - This includes: prompt, description, query, url, method, body, defaultValue, etc.
   - This prevents TypeScript syntax errors with apostrophes (user's, don't, etc.)
   - IMPORTANT: ANY placeholder that starts with < and ends with > MUST be wrapped in template literals (backticks)
   - For object keys: use quotes only for keys with hyphens ('Content-Type'), omit for simple identifiers (Authorization)
   
   EXCEPTION - Schema Fields (NO template literals):
   - headersSchema: z.object({ ... }) (raw Zod code, NOT a string)
   - responseSchema: z.object({ ... }) (raw Zod code, NOT a string)
   - These are TypeScript expressions, not string values
   
   Examples:
   ✅ prompt: \`You are a helpful assistant.\` (string value, use backticks)
   ✅ query: \`query GetData { field }\` (string value, use backticks)
   ✅ responseSchema: z.object({ name: z.string() }) (Zod code, NO backticks)
   ✅ headersSchema: z.object({ 'inkeep_api_key': z.string() }) (Zod code, NO backticks)
   ❌ responseSchema: \`z.object({ name: z.string() })\` (WRONG - don't wrap Zod in backticks)
   
   - convert template literals to use the appropriate headers schema or context config toTemplate method. a template literal is a substring that starts with {{ and ends with }}.
    - if you see a template literal with {{headers.}}, convert it to use the headers schema toTemplate method.
    - if you see a template literal with {{contextVariableKey.field_name}}, convert it to use the context config toTemplate method.
5. For contextConfig (CRITICAL):
   - NEVER use plain objects for contextConfig
   - ALWAYS use helper functions: headers(), fetchDefinition(), contextConfig()
   - Create separate const variables for each helper before the agent definition
   - Pattern: const myHeaders = headers({ schema: z.object({ api_key: z.string() }) });
   - Pattern: const myFetch = fetchDefinition({ id: '...', fetchConfig: {...}, responseSchema: z.object({...}) });
   - Pattern: const myContext = contextConfig({ headers: myHeaders, contextVariables: { data: myFetch } });
   - Then use: export const myAgent = agent({ contextConfig: myContext });
   - Use myHeaders.toTemplate('key_name') for header interpolation in fetch configs
   - Use myContext.toTemplate('variable.field') for context variable interpolation

7. If you are writing zod schemas make them clean. For example if you see z.union([z.string(), z.null()]) write it as z.string().nullable()

PLACEHOLDER HANDLING EXAMPLES:
// CORRECT - Placeholder wrapped in template literals:
prompt: \`<{{subAgents.facts.prompt.abc12345}}>\`

// INCORRECT - Placeholder wrapped in single quotes (causes syntax errors):
prompt: '<{{subAgents.facts.prompt.abc12345}}>'

FULL EXAMPLE:
import { agent, agent } from '@inkeep/agents-sdk';
import { contextConfig, fetchDefinition, headers } from '@inkeep/agents-core';
import { userProfile } from '../data-components/user-profile';
import { searchTool } from '../tools/search-tool';
import { weatherTool } from '../tools/weather-tool';
import { toolSummary } from '../status-components/tool-summary';
import { progressStatus } from '../status-components/progress-status';
import { z } from 'zod';

const supportAgentHeaders = headers({
  schema: z.object({
    userId: z.string(),
    sessionToken: z.string(),
  }),
});

const supportDescriptionFetchDefinition = fetchDefinition({
  id: 'support-description',
  name: 'Support Description',
  trigger: 'initialization',
  fetchConfig: {
    url: 'https://api.example.com/support-description',
    method: 'GET',
    headers: {
      'Authorization': \`Bearer \${supportAgentHeaders.toTemplate('sessionToken')}\`,
    },
    transform: 'data',
  },
  responseSchema: z.object({
    description: z.string(),
  }),
  defaultValue: 'Support Description',
});

const supportAgentContext = contextConfig({
  headers: supportAgentHeaders,
  contextVariables: {
    supportDescription: supportDescriptionDefinition,
  },
});

const routerAgent = agent({
  id: 'router',
  name: 'Router Agent',
  prompt: \`Route requests to appropriate agents using \${supportAgentContext.toTemplate('supportDescription.description')} for the user \${supportAgentHeaders.toTemplate('userId')}\`,
  canTransferTo: () => [qaAgent]
});

const qaAgent = agent({
  id: 'qa',
  name: 'QA Agent',
  prompt: \`You are a helpful QA agent.

Follow these rules:
- Always be helpful
- Provide accurate answers
- Use the user's name \${supportAgentHeaders.toTemplate('userId')} when applicable
- Use available tools\`,
  canUse: () => [searchTool, weatherTool],
  selectedTools: {
    [searchTool.id]: ['search_web', 'search_docs'],
    [weatherTool.id]: ['get_forecast']
  },
  dataComponents: () => [userProfile.config]
});

export const supportAgent = agent({
  id: 'support-agent',
  name: 'Support Agent',
  description: 'Multi-agent support system', // Only include if description has a value
  defaultSubAgent: routerAgent,
  subAgents: () => [routerAgent, qaAgent],
  models: {
    base: { model: 'gpt-4' },
    summarizer: { model: 'gpt-4' },
  },
  statusUpdates: {
    numEvents: 3,
    timeInSeconds: 15,
    statusComponents: [toolSummary.config, progressStatus.config],
  },
});

Generate ONLY the TypeScript code without any markdown or explanations.`;

  if (debug) {
    console.log(`\n[DEBUG] === Starting agent generation for: ${agentId} ===`);
    console.log(`[DEBUG] Output path: ${outputPath}`);
    console.log(`[DEBUG] Model: ${modelSettings.model || 'default'}`);
    console.log(`[DEBUG] Agent data size: ${JSON.stringify(agentData).length} characters`);

    // Log agent complexity
    const agentCount = Object.keys(agentData.subAgents || {}).length;
    const toolIds = new Set();
    const dataComponentIds = new Set();
    const artifactComponentIds = new Set();
    for (const agent of Object.values(agentData.subAgents || {})) {
      const agentData = agent as any;
      if (agentData.tools) {
        for (const toolId of Object.keys(agentData.tools)) {
          toolIds.add(toolId);
        }
      }
      if (agentData.dataComponents) {
        for (const id of Object.keys(agentData.dataComponents)) {
          dataComponentIds.add(id);
        }
      }
      if (agentData.artifactComponents) {
        for (const id of Object.keys(agentData.artifactComponents)) {
          artifactComponentIds.add(id);
        }
      }
    }

    console.log(`[DEBUG] Agent complexity:`);
    console.log(`[DEBUG]   - Agents: ${agentCount}`);
    console.log(`[DEBUG]   - Unique tools: ${toolIds.size}`);
    console.log(`[DEBUG]   - Data components: ${dataComponentIds.size}`);
    console.log(`[DEBUG]   - Artifact components: ${artifactComponentIds.size}`);
    console.log(`[DEBUG]   - Context config: ${agentData.contextConfig ? 'Yes' : 'No'}`);
  }

  try {
    const startTime = Date.now();

    if (debug) {
      console.log(`[DEBUG] Sending request to LLM API...`);
    }

    const text = await generateTextWithPlaceholders(
      model,
      agentData,
      promptTemplate,
      {
        temperature: 0.1,
        maxOutputTokens: 16000,
        abortSignal: AbortSignal.timeout(240000), // 240 second timeout for complex agent
      },
      debug // Pass debug flag to show placeholder optimization info
    );

    const duration = Date.now() - startTime;

    if (debug) {
      console.log(`[DEBUG] LLM response received in ${duration}ms`);
      console.log(`[DEBUG] Generated text length: ${text.length} characters`);
      console.log(`[DEBUG] Writing to file: ${outputPath}`);
    }

    const cleanedCode = cleanGeneratedCode(text);
    writeFileSync(outputPath, cleanedCode);

    if (debug) {
      console.log(`[DEBUG] Agent file written successfully`);
      console.log(`[DEBUG] === Completed agent generation for: ${agentId} ===\n`);
    }
  } catch (error: any) {
    if (debug) {
      console.error(`[DEBUG] === ERROR generating agent file ${agentId} ===`);
      console.error(`[DEBUG] Error name: ${error.name}`);
      console.error(`[DEBUG] Error message: ${error.message}`);
      if (error.name === 'AbortError') {
        console.error(`[DEBUG] Request timed out after 240 seconds`);
        console.error(`[DEBUG] This might indicate the agent is too complex or the API is slow`);
      }
      if (error.response) {
        console.error(`[DEBUG] Response status: ${error.response.status}`);
        console.error(`[DEBUG] Response headers:`, error.response.headers);
      }
      console.error(`[DEBUG] Full error:`, error);
    }
    throw error;
  }
}

/**
 * Generate a tool TypeScript file
 */
export async function generateToolFile(
  toolData: any,
  toolId: string,
  outputPath: string,
  modelSettings: ModelSettings
): Promise<void> {
  const model = createModel(modelSettings);

  const promptTemplate = `Generate a TypeScript file for an Inkeep tool.

TOOL DATA:
{{DATA}}

TOOL ID: ${toolId}

${getTypeDefinitions()}

${NAMING_CONVENTION_RULES}

${IMPORT_INSTRUCTIONS}

REQUIREMENTS:
1. Import mcpTool from '@inkeep/agents-sdk'
2. CRITICAL: Always include serverUrl property (required by SDK) extracted from config.mcp.server.url
3. CRITICAL: Use individual properties supported by mcpTool - do NOT use nested config object
4. Extract configuration properties and map them to mcpTool's expected properties (serverUrl, transport, etc.)
5. CRITICAL: If credentialReferenceId exists in tool data, add it as a credential property using envSettings.getEnvironmentSetting()
6. Convert credentialReferenceId to credential key format by replacing hyphens with underscores for the getEnvironmentSetting() call (e.g., 'inkeep-api-credential' becomes 'inkeep_api_credential')
7. TRANSPORT CONFIG: If config.mcp.transport exists, extract it as a transport property (not nested in config)
8. NO CONFIG OBJECT: mcpTool does not accept a 'config' property - use individual properties only

EXAMPLE WITH CREDENTIAL REFERENCE:
import { envSettings } from '../environments';
import { mcpTool } from '@inkeep/agents-sdk';

export const inkeepFacts = mcpTool({
  id: 'inkeep_facts',
  name: 'inkeep_facts',
  serverUrl: 'https://mcp.inkeep.com/inkeep/mcp',
  credential: envSettings.getEnvironmentSetting('inkeep_api_credential')
});

EXAMPLE WITH TRANSPORT CONFIG:
import { mcpTool } from '@inkeep/agents-sdk';

export const transportTool = mcpTool({
  id: 'transport_tool',
  name: 'Transport Tool',
  serverUrl: 'https://example.com/mcp',
  transport: {
    type: 'streamable_http'
  }
});

Generate ONLY the TypeScript code without any markdown or explanations.`;

  const text = await generateTextWithPlaceholders(model, toolData, promptTemplate, {
    temperature: 0.1,
    maxOutputTokens: 4000,
    abortSignal: AbortSignal.timeout(60000), // 60 second timeout
  });

  writeFileSync(outputPath, cleanGeneratedCode(text));
}

/**
 * Generate a data component TypeScript file
 */
export async function generateDataComponentFile(
  componentData: any,
  componentId: string,
  outputPath: string,
  modelSettings: ModelSettings
): Promise<void> {
  const model = createModel(modelSettings);

  const promptTemplate = `Generate a TypeScript file for an Inkeep data component.

DATA COMPONENT DATA:
{{DATA}}

COMPONENT ID: ${componentId}

${getTypeDefinitions()}

${NAMING_CONVENTION_RULES}

${IMPORT_INSTRUCTIONS}

REQUIREMENTS:
1. Import dataComponent from '@inkeep/agents-sdk'
2. Import z from 'zod' for schema definitions
3. Create the data component using dataComponent()
4. Include all properties from the component data INCLUDING the 'id' property
5. CRITICAL: All imports must be alphabetically sorted to comply with Biome linting
6. If you are writing zod schemas make them clean. For example if you see z.union([z.string(), z.null()]) write it as z.string().nullable()

EXAMPLE:
import { dataComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const weatherData = dataComponent({
  id: 'weather-data',
  name: 'Weather Data',
  description: 'Weather information',
  props: z.object({
    temperature: z.number().describe('Temperature value'),
    conditions: z.string().describe('Weather conditions'),
    humidity: z.number().optional().describe('Humidity percentage'),
  }),
});

EXAMPLE WITH HYPHEN ID:
import { dataComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

// Component ID 'user-profile' becomes export name 'userProfile'
export const userProfile = dataComponent({
  id: 'user-profile',
  name: 'User Profile',
  description: 'User profile information',
  props: z.object({
    userId: z.string().describe('Unique user identifier'),
    name: z.string().describe('User full name'),
    email: z.string().email().describe('User email address'),
    preferences: z.object({
      theme: z.enum(['light', 'dark']),
      notifications: z.boolean(),
    }).optional().describe('User preferences'),
  }),
});

Generate ONLY the TypeScript code without any markdown or explanations.`;

  const text = await generateTextWithPlaceholders(model, componentData, promptTemplate, {
    temperature: 0.1,
    maxOutputTokens: 4000,
    abortSignal: AbortSignal.timeout(60000), // 60 second timeout
  });

  writeFileSync(outputPath, cleanGeneratedCode(text));
}

/**
 * Generate an artifact component TypeScript file
 */
export async function generateArtifactComponentFile(
  componentData: any,
  componentId: string,
  outputPath: string,
  modelSettings: ModelSettings
): Promise<void> {
  const model = createModel(modelSettings);

  const promptTemplate = `Generate a TypeScript file for an Inkeep artifact component.

ARTIFACT COMPONENT DATA:
{{DATA}}

COMPONENT ID: ${componentId}

${getTypeDefinitions()}

${NAMING_CONVENTION_RULES}

${IMPORT_INSTRUCTIONS}

REQUIREMENTS:
1. Import artifactComponent from '@inkeep/agents-sdk'
2. Import z from 'zod' and preview from '@inkeep/agents-core' for schema definitions
3. Create the artifact component using artifactComponent()
4. Use preview() helper for fields that should be shown in previews
5. Export following naming convention rules (camelCase version of ID)
6. Include the 'id' property to preserve the original component ID
7. CRITICAL: All imports must be alphabetically sorted to comply with Biome linting
8. If you are writing zod schemas make them clean. For example if you see z.union([z.string(), z.null()]) write it as z.string().nullable()

EXAMPLE:
import { preview } from '@inkeep/agents-core';
import { artifactComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

// Component ID 'pdf_export' becomes export name 'pdfExport'
export const pdfExport = artifactComponent({
  id: 'pdf_export',
  name: 'PDF Export',
  description: 'Export data as PDF',
  props: z.object({
    filename: preview(z.string().describe('Name of the PDF file')),
    content: z.object({}).describe('PDF content data'),
  }),
});

EXAMPLE WITH HYPHEN ID:
import { preview } from '@inkeep/agents-core';
import { artifactComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

// Component ID 'order-summary' becomes export name 'orderSummary'
export const orderSummary = artifactComponent({
  id: 'order-summary',
  name: 'Order Summary',
  description: 'Summary of customer order',
  props: z.object({
    orderId: preview(z.string().describe('Unique identifier for the order')),
    total: preview(z.number().describe('Total order amount')),
    items: z.array(z.object({
      id: z.string(),
      name: z.string(),
      price: z.number(),
    })).describe('List of order items'),
    tax: z.number().optional().describe('Tax amount'),
  }),
});

Generate ONLY the TypeScript code without any markdown or explanations.`;

  const text = await generateTextWithPlaceholders(model, componentData, promptTemplate, {
    temperature: 0.1,
    maxOutputTokens: 4000,
    abortSignal: AbortSignal.timeout(60000), // 60 second timeout
  });

  writeFileSync(outputPath, cleanGeneratedCode(text));
}

/**
 * Generate a status component TypeScript file
 */
export async function generateStatusComponentFile(
  componentData: any,
  componentId: string,
  outputPath: string,
  modelSettings: ModelSettings
): Promise<void> {
  const model = createModel(modelSettings);

  const promptTemplate = `Generate a TypeScript file for an Inkeep status component.

STATUS COMPONENT DATA:
{{DATA}}

COMPONENT ID: ${componentId}

${getTypeDefinitions()}

${NAMING_CONVENTION_RULES}

${IMPORT_INSTRUCTIONS}

REQUIREMENTS:
1. Import statusComponent from '@inkeep/agents-sdk'
2. Import z from 'zod' for schema definitions
3. Create the status component using statusComponent()
4. Export following naming convention rules (camelCase version of ID)
5. Use 'type' field as the identifier (like 'tool_summary')
6. CRITICAL: All imports must be alphabetically sorted to comply with Biome linting
7. If you are writing zod schemas make them clean. For example if you see z.union([z.string(), z.null()]) write it as z.string().nullable()
8. The statusComponent() function handles conversion to .config automatically

EXAMPLE:
import { statusComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const toolSummary = statusComponent({
  type: 'tool_summary',
  description: 'Summary of tool calls and their purpose',
  detailsSchema: z.object({
    tool_name: z.string().describe('Name of tool used'),
    summary: z.string().describe('What was discovered or accomplished'),
  }),
});

EXAMPLE WITH HYPHEN TYPE:
import { statusComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

// Component type 'search-progress' becomes export name 'searchProgress'
export const searchProgress = statusComponent({
  type: 'search-progress',
  description: 'Progress of search operation',
  detailsSchema: z.object({
    query: z.string().describe('Search query being executed'),
    results_found: z.number().describe('Number of results found'),
    time_elapsed: z.number().optional().describe('Time elapsed in milliseconds'),
  }),
});

EXAMPLE WITHOUT DETAILS SCHEMA:
import { statusComponent } from '@inkeep/agents-sdk';

export const simpleStatus = statusComponent({
  type: 'simple_status',
  description: 'A simple status with no additional details',
});

Generate ONLY the TypeScript code without any markdown or explanations.`;

  const text = await generateTextWithPlaceholders(model, componentData, promptTemplate, {
    temperature: 0.1,
    maxOutputTokens: 4000,
    abortSignal: AbortSignal.timeout(60000),
  });

  writeFileSync(outputPath, cleanGeneratedCode(text));
}

/**
 * Generate environment template files
 */
export async function generateEnvironmentFiles(
  environmentsDir: string,
  credentials?: Record<string, any>, // Actual credential data from backend
  environment: string = 'development' // Which environment to generate
): Promise<void> {
  // Helper to generate credential definitions
  const generateCredentialCode = (cred: any) => {
    const params = [
      `id: '${cred.id}'`,
      `type: '${cred.type}'`,
      `credentialStoreId: '${cred.credentialStoreId}'`,
    ];
    if (cred.retrievalParams) {
      params.push(
        `retrievalParams: ${JSON.stringify(cred.retrievalParams, null, 4).replace(/\n/g, '\n      ')}`
      );
    }
    return `credential({\n      ${params.join(',\n      ')}\n    })`;
  };

  // Generate credentials object from actual data
  const hasCredentials = credentials && Object.keys(credentials).length > 0;
  let credentialsCode = '';
  let imports = "import { registerEnvironmentSettings } from '@inkeep/agents-sdk';";

  if (hasCredentials) {
    imports = "import { credential, registerEnvironmentSettings } from '@inkeep/agents-sdk';";
    const credentialEntries: string[] = [];
    for (const [credId, cred] of Object.entries(credentials)) {
      // Use a sanitized version of the ID as the variable name
      const varName = credId.replace(/-/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      credentialEntries.push(`    ${varName}: ${generateCredentialCode(cred)}`);
    }
    credentialsCode = `\n${credentialEntries.join(',\n')}\n  `;
  } else {
    credentialsCode = '\n  ';
  }

  // Generate only the specified environment file
  const envContent = `${imports}

export const ${environment} = registerEnvironmentSettings({
  credentials: {${credentialsCode}}
});
`;
  writeFileSync(join(environmentsDir, `${environment}.env.ts`), envContent);

  // Update environments/index.ts incrementally
  await updateEnvironmentIndex(environmentsDir, environment);
}

/**
 * Update environments/index.ts to include the specified environment
 * without removing existing environments
 */
async function updateEnvironmentIndex(environmentsDir: string, environment: string): Promise<void> {
  const indexPath = join(environmentsDir, 'index.ts');
  const { readFileSync, existsSync } = await import('node:fs');

  const existingEnvironments: string[] = [];
  let existingContent = '';

  // Read existing index.ts if it exists
  if (existsSync(indexPath)) {
    existingContent = readFileSync(indexPath, 'utf-8');

    // Extract existing environment imports
    const importRegex = /import\s+{\s*(\w+)\s*}\s+from\s+['"]\.\/([\w-]+)\.env['"];?/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(existingContent)) !== null) {
      const envName = match[2];
      if (!existingEnvironments.includes(envName)) {
        existingEnvironments.push(envName);
      }
    }
  }

  // Add the new environment if it's not already included
  if (!existingEnvironments.includes(environment)) {
    existingEnvironments.push(environment);
  }

  // Sort environments for consistent output
  existingEnvironments.sort();

  // Generate the complete index.ts content
  const importStatements = existingEnvironments
    .map((env) => `import { ${env} } from './${env}.env';`)
    .join('\n');

  const environmentObject = existingEnvironments.map((env) => `  ${env},`).join('\n');

  const exportStatement = existingEnvironments.join(', ');

  const indexContent = `import { createEnvironmentSettings } from '@inkeep/agents-sdk';
${importStatements}

export const envSettings = createEnvironmentSettings({
${environmentObject}
});

// Export individual environments for direct access if needed
export { ${exportStatement} };
`;

  writeFileSync(indexPath, indexContent);
}

/**
 * Legacy function for backward compatibility
 * Generate TypeScript code using LLM to intelligently merge agent data
 */
export async function generateTypeScriptFileWithLLM(
  agentData: any,
  agentId: string,
  outputFilePath: string,
  modelSettings: ModelSettings,
  retryContext?: {
    attempt: number;
    maxRetries: number;
    previousDifferences?: string[];
  }
): Promise<void> {
  const fs = await import('node:fs');

  // Read existing file content if it exists
  let existingContent = '';
  let fileExists = false;

  try {
    existingContent = fs.readFileSync(outputFilePath, 'utf-8');
    fileExists = true;
  } catch {
    // File doesn't exist, we'll create a new one
    fileExists = false;
  }

  // Create the model instance
  const model = createModel(modelSettings);

  // Prepare the prompt
  const prompt = createPrompt(agentData, agentId, existingContent, fileExists, retryContext);

  try {
    // Generate the updated code using the LLM
    const { text } = await generateText({
      model,
      prompt,
      temperature: 0.1, // Low temperature for consistent code generation
      maxOutputTokens: 16000, // Increased to handle large TypeScript files
      abortSignal: AbortSignal.timeout(60000), // 60 second timeout
    });

    // Write the generated code to the file (clean it first)
    fs.writeFileSync(outputFilePath, cleanGeneratedCode(text), 'utf-8');

    console.log(`✅ Successfully generated TypeScript file: ${outputFilePath}`);
  } catch (error) {
    console.error('❌ Error generating TypeScript file with LLM:', error);
    throw error;
  }
}

/**
 * Create a comprehensive prompt for the LLM to generate/update TypeScript code
 */
function createPrompt(
  agentData: any,
  agentId: string,
  existingContent: string,
  fileExists: boolean,
  retryContext?: {
    attempt: number;
    maxRetries: number;
    previousDifferences?: string[];
  }
): string {
  const agentDataJson = JSON.stringify(agentData, null, 2);

  // Add retry context to the prompt if this is a retry
  const retryInstructions =
    retryContext && retryContext.attempt > 1
      ? `
RETRY CONTEXT:
This is attempt ${retryContext.attempt} of ${retryContext.maxRetries}. Previous attempts had validation issues.

${
  retryContext.previousDifferences && retryContext.previousDifferences.length > 0
    ? `
PREVIOUS VALIDATION ISSUES:
${retryContext.previousDifferences.map((diff, index) => `${index + 1}. ${diff}`).join('\n')}

IMPORTANT: Pay special attention to these specific issues and ensure they are resolved in this attempt.
`
    : ''
}

CRITICAL: This is a retry attempt. You must be extremely careful to match the exact structure and values from the agent data. Double-check all IDs, names, and configurations.
`
      : '';

  if (!fileExists) {
    // Create new file
    return `You are an expert TypeScript developer. Generate a complete TypeScript file for an Inkeep agent configuration.${retryInstructions}

AGENT DATA (JSON):
${agentDataJson}

AGENT ID: ${agentId}

${getTypeDefinitions()}

${NAMING_CONVENTION_RULES}

${IMPORT_INSTRUCTIONS}

REQUIREMENTS:
1. Create a complete TypeScript file that exports an agent configuration
2. Use the exact structure and patterns shown in the agent data
3. For agents, use the \`agent()\` function with proper configuration
4. For MCP tools, use the \`mcpTool()\` function with proper configuration
5. For context configs, use the \`contextConfig()\` function
6. For credential references, use the \`credential()\` function
7. Use proper TypeScript syntax with correct imports
8. Handle multi-line strings with template literals (backticks) when needed
9. Preserve the exact structure and relationships from the agent data
10. Use descriptive variable names based on IDs (e.g., \`qaAgent\`, \`factsTool\`)
11. Include helpful comments for complex configurations
12. Preserve all configuration details exactly as provided in the agent data

IMPORTANT:
- Agents use \`canUse\` for tools, not \`tools\`
- Agent's \`subAgents\` property should be an arrow function: subAgents: () => [...]
- DataComponents don't have \`id\` field in their config
- Use \`undefined\` instead of \`null\` for missing optional values
- If tools array contains numeric indices, use the actual tool IDs instead
- Preserve all configuration details exactly as provided
- Use proper TypeScript formatting and indentation
- Include all necessary imports at the top
- Add comments for complex objects like GraphQL queries or multi-line instructions
- Keep the same structure and organization as typical Inkeep agent files

CRITICAL: Generate ONLY the raw TypeScript code. Do NOT wrap it in markdown code blocks (no triple backticks with typescript). Do NOT include any explanations, comments, or markdown formatting. Return only the pure TypeScript code that can be written directly to a .ts file.`;
  } else {
    // Update existing file
    return `You are an expert TypeScript developer. You must make MINIMAL changes to an existing TypeScript file. Your job is to update ONLY the specific values that have changed, while preserving EVERYTHING else exactly as it is.${retryInstructions}

EXISTING FILE CONTENT:
\`\`\`typescript
${existingContent}
\`\`\`

NEW AGENT DATA (JSON):
${agentDataJson}

AGENT ID: ${agentId}

${getTypeDefinitions()}

${NAMING_CONVENTION_RULES}

${IMPORT_INSTRUCTIONS}

CRITICAL RULES - FOLLOW THESE EXACTLY:
1. PRESERVE ALL EXISTING CONTENT - Do not delete, rewrite, or restructure anything
2. ONLY change property values that are actually different between the existing file and new agent data
3. KEEP ALL COMMENTS - Do not remove any comments unless they are factually incorrect
4. KEEP ALL FORMATTING - Preserve exact spacing, indentation, line breaks, and code style
5. KEEP ALL IMPORTS - Do not change import statements
6. KEEP ALL VARIABLE NAMES - Use the exact same variable names as in the existing file
7. KEEP ALL STRUCTURE - Do not reorganize code blocks or change the order of definitions

WHAT TO CHANGE:
- Only update property values (like id, name, description, instructions, etc.) that are different
- If a property value is the same, leave it exactly as it is
- If a new agent/tool/config is added in the agent data, add it following the existing patterns
- If an agent/tool/config is removed from the agent data, remove it from the file

WHAT NOT TO CHANGE:
- Do not rewrite entire functions or objects
- Do not change the structure or organization
- Do not remove or modify comments
- Do not change formatting or style
- Do not reorganize code blocks
- Do not change variable names or function names

EXAMPLES OF MINIMAL CHANGES:
- If only the description changed: update only that one line
- If only a tool was added: add only the new tool definition
- If only a property value changed: update only that specific property

CRITICAL: Return ONLY the raw TypeScript code. Do NOT wrap it in markdown code blocks (no triple backticks with typescript). Do NOT include any explanations, comments, or markdown formatting. Return only the pure TypeScript code that can be written directly to a .ts file.`;
  }
}
