import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI, openai } from '@ai-sdk/openai';
import type { ModelSettings } from '@inkeep/agents-core';
import { generateText } from 'ai';
import {
  calculateTokenSavings,
  createPlaceholders,
  restorePlaceholders,
} from './pull.placeholder-system';

/**
 * Create a language model instance from configuration
 * Similar to ModelFactory but simplified for CLI use
 */
function createModel(config: ModelSettings) {
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

/**
 * Reusable naming convention rules for all LLM generation functions
 */
const NAMING_CONVENTION_RULES = `
CRITICAL NAMING CONVENTION RULES (Apply to ALL imports/exports):
- File paths ALWAYS use the exact original ID (e.g., '../tools/inkeep_facts', '../data-components/user-profile')
- Import/export names MUST be camelCase versions of the ID
- Conversion rules for import/export names:
  - IDs with underscores: 'inkeep_facts' → inkeepFacts
  - IDs with hyphens: 'weather-api' → weatherApi
  - IDs with both: 'my_weather-api' → myWeatherApi
  - Random/UUID IDs: Keep as-is (e.g., 'fUI2riwrBVJ6MepT8rjx0' → fUI2riwrBVJ6MepT8rjx0)
  - IDs starting with uppercase: Make first letter lowercase unless it's an acronym
- The ID field in the exported object keeps the original format
- Examples:
  - Tool: import { inkeepFacts } from '../tools/inkeep_facts'; export const inkeepFacts = mcpTool({ id: 'inkeep_facts', ... })
  - Component: import { userProfile } from '../data-components/user-profile'; export const userProfile = dataComponent({ id: 'user-profile', ... })
  - Graph: import { myGraph } from './graphs/my-graph'; export const myGraph = agentGraph({ id: 'my-graph', ... })
`;

const IMPORT_INSTRUCTIONS = `
CRITICAL IMPORT PATTERNS:
- Tools: Import from '../tools/{toolId}' (individual files)
- Data components: Import from '../data-components/{componentId}' (individual files)
- Artifact components: Import from '../artifact-components/{componentId}' (individual files)
- Graphs: Import from './graphs/{graphId}' (individual files)

NEVER use barrel imports from directories:
❌ WRONG: import { ambiguity, fact } from '../data-components';
✅ CORRECT:
   import { ambiguity } from '../data-components/ambiguity';
   import { fact } from '../data-components/fact';

EXAMPLES:
// Multiple data components - each from individual file:
import { ambiguity } from '../data-components/ambiguity';
import { clarifyingquestion } from '../data-components/clarifyingquestion';
import { fact } from '../data-components/fact';

// Tools - each from individual file:
import { inkeepFacts } from '../tools/inkeep_facts';
import { weatherApi } from '../tools/weather-api';

// Graphs - each from individual file:
import { inkeepQaGraph } from './graphs/inkeep-qa-graph';
import { weatherGraph } from './graphs/weather-graph';
`;

/**
 * Clean generated text by removing markdown code fences
 */
function cleanGeneratedCode(text: string): string {
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
  debug: boolean = false
): Promise<string> {
  // Create placeholders to reduce prompt size
  const { processedData, replacements } = createPlaceholders(data);

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

PROJECT DATA:
{{DATA}}

${NAMING_CONVENTION_RULES}

CRITICAL IMPORT PATTERNS FOR INDEX.TS:
- Tools: Import from './tools/{toolId}' (individual files)
- Data components: Import from './data-components/{componentId}' (individual files)
- Artifact components: Import from './artifact-components/{componentId}' (individual files)
- Graphs: Import from './graphs/{graphId}' (individual files)

NEVER use barrel imports from directories:
❌ WRONG: import { ambiguity, fact } from './data-components';
✅ CORRECT:
   import { ambiguity } from './data-components/ambiguity';
   import { fact } from './data-components/fact';

EXAMPLES:
// Multiple data components - each from individual file:
import { ambiguity } from './data-components/ambiguity';
import { clarifyingquestion } from './data-components/clarifyingquestion';
import { fact } from './data-components/fact';

REQUIREMENTS:
1. Import the project function from '@inkeep/agents-sdk'
2. Import each graph from individual files in the graphs directory
3. Import each tool from individual files in the tools directory
4. Import each data component from individual files in the data-components directory
5. Import each artifact component from individual files in the artifact-components directory
6. CRITICAL: All imports MUST be alphabetically sorted (both named imports and path names)
7. Export a const named after the project ID (in camelCase) using the project() function
8. The project object should include:
   - id: project ID
   - name: project name
   - description: project description (if provided)
   - models: model configuration (if provided)
   - stopWhen: stop configuration (if provided)
   - graphs: arrow function returning array of imported graphs
   - tools: arrow function returning array of imported tools by their IDs (if any)
   - dataComponents: arrow function returning array of imported data components (if any)
   - artifactComponents: arrow function returning array of imported artifact components (if any)

EXAMPLE (note: tools are imported and referenced by ID, not name):
import { project } from '@inkeep/agents-sdk';
import { weatherForecast } from './data-components/weather-forecast';
import { basicGraph } from './graphs/basic-graph';  // Note: 'basic-graph' becomes camelCase 'basicGraph'
import { myGraphId } from './graphs/my-graph-id';  // Note: 'my-graph-id' becomes camelCase 'myGraphId'
import { weatherGraph } from './graphs/weather-graph';
import { fUI2riwrBVJ6MepT8rjx0 } from './tools/fUI2riwrBVJ6MepT8rjx0';
import { fdxgfv9HL7SXlfynPx8hf } from './tools/fdxgfv9HL7SXlfynPx8hf';

export const weatherProject = project({
  id: 'weather-project',
  name: 'Weather Project',
  description: 'A weather information system',
  models: {
    base: { model: 'gpt-4o-mini' }
  },
  graphs: () => [basicGraph, myGraphId, weatherGraph],
  tools: () => [fUI2riwrBVJ6MepT8rjx0, fdxgfv9HL7SXlfynPx8hf],
  dataComponents: () => [weatherForecast]
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
 * Generate a graph TypeScript file
 */
export async function generateGraphFile(
  graphData: any,
  graphId: string,
  outputPath: string,
  modelSettings: ModelSettings,
  debug: boolean = false
): Promise<void> {
  const model = createModel(modelSettings);

  const promptTemplate = `Generate a TypeScript file for an Inkeep agent graph.

GRAPH DATA:
{{DATA}}

GRAPH ID: ${graphId}

IMPORTANT CONTEXT:
- Tools are defined at the project level and imported from '../tools' directory
- Data components are imported from individual files in '../data-components' directory
- Artifact components are imported from individual files in '../artifact-components' directory
- CRITICAL: Tool files are named by their IDs (e.g., '../tools/fUI2riwrBVJ6MepT8rjx0')
- CRITICAL: Import tools using their IDs as both file name and variable name
- Agents reference these resources by their imported variable names
- The 'tools' field in agents contains tool IDs that must match the imported variable names

${NAMING_CONVENTION_RULES}

REQUIREMENTS:
1. Import { agent, agentGraph } from '@inkeep/agents-sdk' - ALWAYS sort named imports alphabetically
2. Import tools from '../tools/{toolId}' following naming convention rules
3. Import data components from '../data-components/{componentId}' following naming convention rules
4. Import artifact components from '../artifact-components/{componentId}' following naming convention rules
5. Define each agent using the agent() function with:
   - id, name, description, prompt
   - canUse: arrow function returning array of imported tool variables (using their IDs)
   - selectedTools: if present, maps tool ID variable to selected tool names
   - dataComponents: arrow function returning array of imported component configs
   - artifactComponents: arrow function returning array of imported component configs
   - canTransferTo/canDelegateTo: arrow functions returning agent variables
6. Create the graph using agentGraph() with proper structure
   - IMPORTANT: If description is null, undefined, or empty string, omit the description field entirely
   - Only include description if it has a meaningful value
7. CRITICAL: Export the graph with proper camelCase naming:
   - Convert graph IDs with hyphens to camelCase (e.g., 'basic-graph' becomes 'basicGraph')
   - Remove hyphens and capitalize the letter after each hyphen
   - First letter should be lowercase
8. Ensure all imports are sorted alphabetically
9. CRITICAL: For multi-line strings (especially prompts), ALWAYS use template literals with backticks:
   - Single-line strings: use regular quotes 'short string'
   - Multi-line strings: MUST use template literals starting and ending with backticks
   - IMPORTANT: ANY placeholder that starts with < and ends with > MUST be wrapped in template literals (backticks)
   - Placeholders contain multi-line content and require template literals
   - This prevents TypeScript syntax errors with newlines and special characters

NAMING CONVENTION EXAMPLES:
// Tool with underscore ID 'inkeep_facts':
import { inkeepFacts } from '../tools/inkeep_facts';  // camelCase import, exact ID in path

// Tool with hyphen ID 'weather-api':
import { weatherApi } from '../tools/weather-api';  // camelCase import, exact ID in path

// Data component with hyphen ID 'user-profile':
import { userProfile } from '../data-components/user-profile';  // camelCase import, exact ID in path

// Random ID (no conversion needed):
import { fUI2riwrBVJ6MepT8rjx0 } from '../tools/fUI2riwrBVJ6MepT8rjx0';

// PLACEHOLDER HANDLING EXAMPLES:
// CORRECT - Placeholder wrapped in template literals:
prompt: \`<{{agents.facts.prompt.abc12345}}>\`

// INCORRECT - Placeholder wrapped in single quotes (causes syntax errors):
prompt: '<{{agents.facts.prompt.abc12345}}>'

${IMPORT_INSTRUCTIONS}

FULL EXAMPLE:
import { agent, agentGraph } from '@inkeep/agents-sdk';
import { userProfile } from '../data-components/user-profile';
import { inkeepFacts } from '../tools/inkeep_facts';
import { weatherApi } from '../tools/weather-api';

const routerAgent = agent({
  id: 'router',
  name: 'Router Agent',
  prompt: 'Route requests to appropriate agents',
  canTransferTo: () => [qaAgent]
});

const qaAgent = agent({
  id: 'qa',
  name: 'QA Agent',
  prompt: \`You are a helpful QA agent.

Follow these rules:
- Always be helpful
- Provide accurate answers
- Use available tools\`,
  canUse: () => [searchTool, weatherTool],
  selectedTools: {
    [searchTool.id]: ['search_web', 'search_docs'],
    [weatherTool.id]: ['get_forecast']
  },
  dataComponents: () => [userProfile.config]
});

// Example: Graph ID 'support-graph' becomes 'supportGraph'
export const supportGraph = agentGraph({
  id: 'support-graph',
  name: 'Support Graph',
  description: 'Multi-agent support system', // Only include if description has a value
  defaultAgent: routerAgent,
  agents: () => [routerAgent, qaAgent]
});

// Example without description (when null or undefined):
export const weatherGraph = agentGraph({
  id: 'weather-graph',
  name: 'Weather Graph',
  // description is omitted when null, undefined, or empty
  defaultAgent: routerAgent,
  agents: () => [routerAgent, qaAgent]
});

Generate ONLY the TypeScript code without any markdown or explanations.`;

  if (debug) {
    console.log(`\n[DEBUG] === Starting graph generation for: ${graphId} ===`);
    console.log(`[DEBUG] Output path: ${outputPath}`);
    console.log(`[DEBUG] Model: ${modelSettings.model || 'default'}`);
    console.log(`[DEBUG] Graph data size: ${JSON.stringify(graphData).length} characters`);

    // Log graph complexity
    const agentCount = Object.keys(graphData.agents || {}).length;
    const toolIds = new Set();
    const dataComponentIds = new Set();
    const artifactComponentIds = new Set();

    for (const agent of Object.values(graphData.agents || {})) {
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

    console.log(`[DEBUG] Graph complexity:`);
    console.log(`[DEBUG]   - Agents: ${agentCount}`);
    console.log(`[DEBUG]   - Unique tools: ${toolIds.size}`);
    console.log(`[DEBUG]   - Data components: ${dataComponentIds.size}`);
    console.log(`[DEBUG]   - Artifact components: ${artifactComponentIds.size}`);
    console.log(
      `[DEBUG]   - Has relations: ${graphData.relations ? Object.keys(graphData.relations).length : 0}`
    );
  }

  try {
    const startTime = Date.now();

    if (debug) {
      console.log(`[DEBUG] Sending request to LLM API...`);
    }

    const text = await generateTextWithPlaceholders(
      model,
      graphData,
      promptTemplate,
      {
        temperature: 0.1,
        maxOutputTokens: 16000,
        abortSignal: AbortSignal.timeout(240000), // 240 second timeout for complex graphs
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
      console.log(`[DEBUG] Graph file written successfully`);
      console.log(`[DEBUG] === Completed graph generation for: ${graphId} ===\n`);
    }
  } catch (error: any) {
    if (debug) {
      console.error(`[DEBUG] === ERROR generating graph file ${graphId} ===`);
      console.error(`[DEBUG] Error name: ${error.name}`);
      console.error(`[DEBUG] Error message: ${error.message}`);
      if (error.name === 'AbortError') {
        console.error(`[DEBUG] Request timed out after 240 seconds`);
        console.error(`[DEBUG] This might indicate the graph is too complex or the API is slow`);
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

${NAMING_CONVENTION_RULES}

REQUIREMENTS:
1. Import mcpTool from '@inkeep/agents-sdk' - ensure imports are alphabetically sorted
2. CRITICAL: Always include serverUrl property (required by SDK) extracted from config.mcp.server.url
3. CRITICAL: Use individual properties supported by mcpTool - do NOT use nested config object
4. Extract configuration properties and map them to mcpTool's expected properties (serverUrl, transport, etc.)
5. Export the tool following naming convention rules (camelCase version of ID)
6. CRITICAL: If credentialReferenceId exists in tool data, add it as a credential property using envSettings.getEnvironmentSetting()
7. Convert credentialReferenceId to credential key format by replacing hyphens with underscores for the getEnvironmentSetting() call (e.g., 'inkeep-api-credential' becomes 'inkeep_api_credential')
8. CRITICAL: All imports must be alphabetically sorted to comply with Biome linting
9. TRANSPORT CONFIG: If config.mcp.transport exists, extract it as a transport property (not nested in config)
10. NO CONFIG OBJECT: mcpTool does not accept a 'config' property - use individual properties only

EXAMPLE FOR TOOL WITH UNDERSCORE ID:
import { mcpTool } from '@inkeep/agents-sdk';

// Tool ID 'inkeep_facts' becomes export name 'inkeepFacts'
export const inkeepFacts = mcpTool({
  id: 'inkeep_facts',  // Keep original ID here
  name: 'Inkeep Facts',
  serverUrl: 'https://facts.inkeep.com/mcp'
});

EXAMPLE FOR TOOL WITH CREDENTIAL REFERENCE:
import { mcpTool } from '@inkeep/agents-sdk';
import { envSettings } from '../environments';

// Tool with credential reference - note credentialReferenceId 'inkeep-api-credential' becomes 'inkeep_api_credential'
// IMPORTANT: Use individual properties only, no nested config object
export const inkeepFacts = mcpTool({
  id: 'inkeep_facts',
  name: 'inkeep_facts',
  serverUrl: 'https://mcp.inkeep.com/inkeep/mcp',
  credential: envSettings.getEnvironmentSetting('inkeep_api_credential')
});

EXAMPLE FOR TOOL WITH TRANSPORT CONFIG:
import { mcpTool } from '@inkeep/agents-sdk';

// Tool with transport config - extract transport from config.mcp.transport
export const transportTool = mcpTool({
  id: 'transport_tool',
  name: 'Transport Tool',
  serverUrl: 'https://example.com/mcp',
  transport: {
    type: 'streamable_http'
  }
});

EXAMPLE FOR TOOL WITH HYPHEN ID:
import { mcpTool } from '@inkeep/agents-sdk';

// Tool ID 'weather-api' becomes export name 'weatherApi'
export const weatherApi = mcpTool({
  id: 'weather-api',  // Keep original ID here
  name: 'Weather API',
  serverUrl: 'npx',
  args: ['-y', '@modelcontextprotocol/server-weather']
});

EXAMPLE FOR RANDOM ID:
import { mcpTool } from '@inkeep/agents-sdk';

// If tool ID is 'fUI2riwrBVJ6MepT8rjx0', export name is 'fUI2riwrBVJ6MepT8rjx0'
export const fUI2riwrBVJ6MepT8rjx0 = mcpTool({
  id: 'fUI2riwrBVJ6MepT8rjx0',
  name: 'Weather Forecast',
  serverUrl: 'https://weather-forecast-mcp.vercel.app/mcp'
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

${NAMING_CONVENTION_RULES}

REQUIREMENTS:
1. Import dataComponent from '@inkeep/agents-sdk'
2. Create the data component using dataComponent()
3. Include all properties from the component data INCLUDING the 'id' property
4. Export following naming convention rules (camelCase version of ID)
5. CRITICAL: All imports must be alphabetically sorted to comply with Biome linting

EXAMPLE WITH UNDERSCORE ID:
import { dataComponent } from '@inkeep/agents-sdk';

// Component ID 'user_profile' becomes export name 'userProfile'
export const userProfile = dataComponent({
  id: 'user_profile',
  name: 'User Profile',
  description: 'User profile information',
  props: {
    userId: { type: 'string', required: true },
    email: { type: 'string', required: true },
    preferences: { type: 'object' }
  }
});

EXAMPLE WITH HYPHEN ID:
import { dataComponent } from '@inkeep/agents-sdk';

// Component ID 'weather-data' becomes export name 'weatherData'
export const weatherData = dataComponent({
  id: 'weather-data',
  name: 'Weather Data',
  description: 'Weather information',
  props: {
    temperature: { type: 'number', required: true },
    conditions: { type: 'string' }
  }
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

${NAMING_CONVENTION_RULES}

REQUIREMENTS:
1. Import artifactComponent from '@inkeep/agents-sdk'
2. Create the artifact component using artifactComponent()
3. Include summaryProps and fullProps from the component data
4. Export following naming convention rules (camelCase version of ID)
5. Include the 'id' property to preserve the original component ID
6. CRITICAL: All imports must be alphabetically sorted to comply with Biome linting

EXAMPLE WITH UNDERSCORE ID:
import { artifactComponent } from '@inkeep/agents-sdk';

// Component ID 'pdf_export' becomes export name 'pdfExport'
export const pdfExport = artifactComponent({
  id: 'pdf_export',
  name: 'PDF Export',
  description: 'Export data as PDF',
  summaryProps: {
    filename: { type: 'string', required: true }
  },
  fullProps: {
    filename: { type: 'string', required: true },
    content: { type: 'object', required: true }
  }
});

EXAMPLE WITH HYPHEN ID:
import { artifactComponent } from '@inkeep/agents-sdk';

// Component ID 'order-summary' becomes export name 'orderSummary'
export const orderSummary = artifactComponent({
  id: 'order-summary',
  name: 'Order Summary',
  description: 'Summary of customer order',
  summaryProps: {
    orderId: { type: 'string', required: true },
    total: { type: 'number', required: true }
  },
  fullProps: {
    orderId: { type: 'string', required: true },
    items: { type: 'array', required: true },
    total: { type: 'number', required: true },
    tax: { type: 'number' }
  }
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
    .map(env => `import { ${env} } from './${env}.env';`)
    .join('\n');

  const environmentObject = existingEnvironments
    .map(env => `  ${env},`)
    .join('\n');

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
 * Generate TypeScript code using LLM to intelligently merge graph data
 */
export async function generateTypeScriptFileWithLLM(
  graphData: any,
  graphId: string,
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
  const prompt = createPrompt(graphData, graphId, existingContent, fileExists, retryContext);

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
  graphData: any,
  graphId: string,
  existingContent: string,
  fileExists: boolean,
  retryContext?: {
    attempt: number;
    maxRetries: number;
    previousDifferences?: string[];
  }
): string {
  const graphDataJson = JSON.stringify(graphData, null, 2);

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

CRITICAL: This is a retry attempt. You must be extremely careful to match the exact structure and values from the graph data. Double-check all IDs, names, and configurations.
`
      : '';

  if (!fileExists) {
    // Create new file
    return `You are an expert TypeScript developer. Generate a complete TypeScript file for an Inkeep agent graph configuration.${retryInstructions}

GRAPH DATA (JSON):
${graphDataJson}

GRAPH ID: ${graphId}

REQUIREMENTS:
1. Create a complete TypeScript file that exports an agentGraph configuration
2. Use the exact structure and patterns shown in the graph data
3. For agents, use the \`agent()\` function with proper configuration
4. For MCP tools, use the \`mcpTool()\` function with proper configuration
5. For context configs, use the \`contextConfig()\` function
6. For credential references, use the \`credential()\` function
7. Use proper TypeScript syntax with correct imports
8. Handle multi-line strings with template literals (backticks) when needed
9. Preserve the exact structure and relationships from the graph data
10. Use descriptive variable names based on IDs (e.g., \`qaAgent\`, \`factsTool\`)
11. Include helpful comments for complex configurations
12. Preserve all configuration details exactly as provided in the graph data

IMPORTANT:
- Agents use \`canUse\` for tools, not \`tools\`
- Graph's \`agents\` property should be an arrow function: agents: () => [...]
- DataComponents don't have \`id\` field in their config
- Use \`undefined\` instead of \`null\` for missing optional values
- If tools array contains numeric indices, use the actual tool IDs instead
- Preserve all configuration details exactly as provided
- Use proper TypeScript formatting and indentation
- Include all necessary imports at the top
- Add comments for complex objects like GraphQL queries or multi-line instructions
- Keep the same structure and organization as typical Inkeep graph files

CRITICAL: Generate ONLY the raw TypeScript code. Do NOT wrap it in markdown code blocks (no triple backticks with typescript). Do NOT include any explanations, comments, or markdown formatting. Return only the pure TypeScript code that can be written directly to a .ts file.`;
  } else {
    // Update existing file
    return `You are an expert TypeScript developer. You must make MINIMAL changes to an existing TypeScript file. Your job is to update ONLY the specific values that have changed, while preserving EVERYTHING else exactly as it is.${retryInstructions}

EXISTING FILE CONTENT:
\`\`\`typescript
${existingContent}
\`\`\`

NEW GRAPH DATA (JSON):
${graphDataJson}

GRAPH ID: ${graphId}

CRITICAL RULES - FOLLOW THESE EXACTLY:
1. PRESERVE ALL EXISTING CONTENT - Do not delete, rewrite, or restructure anything
2. ONLY change property values that are actually different between the existing file and new graph data
3. KEEP ALL COMMENTS - Do not remove any comments unless they are factually incorrect
4. KEEP ALL FORMATTING - Preserve exact spacing, indentation, line breaks, and code style
5. KEEP ALL IMPORTS - Do not change import statements
6. KEEP ALL VARIABLE NAMES - Use the exact same variable names as in the existing file
7. KEEP ALL STRUCTURE - Do not reorganize code blocks or change the order of definitions

WHAT TO CHANGE:
- Only update property values (like id, name, description, instructions, etc.) that are different
- If a property value is the same, leave it exactly as it is
- If a new agent/tool/config is added in the graph data, add it following the existing patterns
- If an agent/tool/config is removed from the graph data, remove it from the file

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
