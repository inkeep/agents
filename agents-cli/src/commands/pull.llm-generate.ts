import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI, openai } from '@ai-sdk/openai';
import type { ModelSettings } from '@inkeep/agents-core';
import { generateText } from 'ai';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
 * Clean generated text by removing markdown code fences
 */
function cleanGeneratedCode(text: string): string {
  // Remove opening and closing markdown code fences
  // Handles ```typescript, ```ts, or just ```
  return text.replace(/^```(?:typescript|ts)?\n?/, '').replace(/\n?```$/, '').trim();
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

  const prompt = `Generate a TypeScript index.ts file for an Inkeep project with the following data:

PROJECT DATA:
${JSON.stringify(projectData, null, 2)}

REQUIREMENTS:
1. Import the project function from '@inkeep/agents-sdk'
2. Import all graphs from the graphs directory (e.g., import { graphName } from './graphs/graphName')
3. Import all tools from the tools directory if any exist
4. Import all data components from the data-components directory if any exist
5. Import all artifact components from the artifact-components directory if any exist
6. CRITICAL: All imports MUST be alphabetically sorted (both named imports and path names)
7. Export a const named after the project ID using the project() function
8. The project object should include:
   - id: project ID
   - name: project name
   - description: project description (if provided)
   - models: model configuration (if provided)
   - stopWhen: stop configuration (if provided)
   - graphs: arrow function returning array of imported graphs
   - tools: arrow function returning array of imported tools (if any)
   - dataComponents: arrow function returning array of imported data components (if any)
   - artifactComponents: arrow function returning array of imported artifact components (if any)

EXAMPLE:
import { project } from '@inkeep/agents-sdk';
import { weatherGraph } from './graphs/weather-graph';
import { searchTool } from './tools/search-tool';

export const weatherProject = project({
  id: 'weather-project',
  name: 'Weather Project',
  description: 'A weather information system',
  models: {
    base: { model: 'gpt-4o-mini' }
  },
  graphs: () => [weatherGraph],
  tools: () => [searchTool]
});

Generate ONLY the TypeScript code without any markdown or explanations.`;

  const { text } = await generateText({
    model,
    prompt,
    temperature: 0.1,
    maxOutputTokens: 4000,
  });

  writeFileSync(outputPath, cleanGeneratedCode(text));
}

/**
 * Generate inkeep.config.ts file with projectId
 */
export async function generateInkeepConfigFile(
  projectData: any,
  projectId: string,
  outputPath: string,
  modelSettings: ModelSettings
): Promise<void> {
  // Create the config file directly without LLM since it's a simple template
  const modelConfig = projectData.models || {};

  const configContent = `import { defineConfig } from '@inkeep/agents-cli/config';

const config = defineConfig({
  projectId: '${projectId}',
  tenantId: "default",
  agentsManageApiUrl: 'http://localhost:3002',
  agentsRunApiUrl: 'http://localhost:3003',
  modelSettings: ${JSON.stringify({
    base: modelConfig.base || { model: 'anthropic/claude-sonnet-4-20250514' },
    structuredOutput: modelConfig.structuredOutput || { model: 'anthropic/claude-3-5-haiku-20241022' },
    summarizer: modelConfig.summarizer || { model: 'anthropic/claude-3-5-haiku-20241022' }
  }, null, 4).split('\n').map((line, i) => i === 0 ? line : '  ' + line).join('\n')}
});

export default config;
`;

  // Write the config file directly
  writeFileSync(outputPath, configContent);
}

/**
 * Generate a graph TypeScript file
 */
export async function generateGraphFile(
  graphData: any,
  graphId: string,
  outputPath: string,
  modelSettings: ModelSettings
): Promise<void> {
  const model = createModel(modelSettings);

  const prompt = `Generate a TypeScript file for an Inkeep agent graph.

GRAPH DATA:
${JSON.stringify(graphData, null, 2)}

GRAPH ID: ${graphId}

REQUIREMENTS:
1. Import functions from '@inkeep/agents-sdk' - ALWAYS sort named imports alphabetically (e.g., import { agent, agentGraph } not { agentGraph, agent })
2. Import any necessary tool functions - sort all import paths alphabetically
3. Define each agent using the agent() function with their configurations
4. Create the graph using agentGraph() with:
   - id: graph ID
   - name: graph name
   - description: graph description (use undefined, not null, if no description)
   - defaultAgent: the default agent
   - agents: arrow function returning array of all agents: agents: () => [agent1, agent2]
5. Export the graph as a named export
6. For agent relationships, use canTransferTo and canDelegateTo as arrow functions
7. CRITICAL: For agent properties that accept arrays:
   - canUse: Use arrow function syntax: canUse: () => [tool1, tool2]
   - dataComponents: Use arrow function syntax: dataComponents: () => [component1]
   - artifactComponents: Use arrow function syntax: artifactComponents: () => [component1]
   - canTransferTo: Use arrow function syntax: canTransferTo: () => [agent1, agent2]
   - canDelegateTo: Use arrow function syntax: canDelegateTo: () => [agent1, agent2]
8. Use proper TypeScript syntax
9. CRITICAL: Ensure all imports are sorted alphabetically to comply with Biome linting rules

EXAMPLE:
import { agent, agentGraph, mcpTool } from '@inkeep/agents-sdk';

const searchTool = mcpTool({ id: 'search', name: 'Search', serverUrl: 'https://example.com/mcp' });

const routerAgent = agent({
  id: 'router',
  name: 'Router Agent',
  prompt: 'Route requests to appropriate agents',
  canTransferTo: () => [qaAgent, orderAgent]
});

const qaAgent = agent({
  id: 'qa',
  name: 'QA Agent',
  prompt: 'Answer questions',
  canUse: () => [searchTool]  // MUST be arrow function
});

export const supportGraph = agentGraph({
  id: 'support-graph',
  name: 'Customer Support',
  description: 'Multi-agent customer support system',
  defaultAgent: routerAgent,
  agents: () => [routerAgent, qaAgent]  // MUST be arrow function
});

Generate ONLY the TypeScript code without any markdown or explanations.`;

  const { text } = await generateText({
    model,
    prompt,
    temperature: 0.1,
    maxOutputTokens: 16000,
  });

  writeFileSync(outputPath, cleanGeneratedCode(text));
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

  const prompt = `Generate a TypeScript file for an Inkeep tool.

TOOL DATA:
${JSON.stringify(toolData, null, 2)}

TOOL ID: ${toolId}

REQUIREMENTS:
1. Import mcpTool from '@inkeep/agents-sdk' - ensure imports are alphabetically sorted
2. Use mcpTool() with serverUrl property (not nested server object)
3. Include id, name, and serverUrl as the main properties
4. Export the tool as a named export
5. Include all configuration from the tool data
6. CRITICAL: All imports must be alphabetically sorted to comply with Biome linting

IMPORTANT: The exported const MUST be named exactly after the tool ID (camelCased) since the ID is unique and will be imported by that name.

EXAMPLE FOR MCP TOOL:
import { mcpTool } from '@inkeep/agents-sdk';

// If tool ID is 'search-tool', export name is 'searchTool'
export const searchTool = mcpTool({
  id: 'search-tool',
  name: 'Search Tool',
  serverUrl: 'npx',
  args: ['-y', '@modelcontextprotocol/server-brave-search']
});

EXAMPLE FOR MCP TOOL WITH RANDOM ID:
import { mcpTool } from '@inkeep/agents-sdk';

// If tool ID is 'fUI2riwrBVJ6MepT8rjx0', export name is 'fUI2riwrBVJ6MepT8rjx0'
export const fUI2riwrBVJ6MepT8rjx0 = mcpTool({
  id: 'fUI2riwrBVJ6MepT8rjx0',
  name: 'Weather Forecast',
  serverUrl: 'https://weather-forecast-mcp.vercel.app/mcp'
});

Generate ONLY the TypeScript code without any markdown or explanations.`;

  const { text } = await generateText({
    model,
    prompt,
    temperature: 0.1,
    maxOutputTokens: 4000,
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

  const prompt = `Generate a TypeScript file for an Inkeep data component.

DATA COMPONENT DATA:
${JSON.stringify(componentData, null, 2)}

COMPONENT ID: ${componentId}

REQUIREMENTS:
1. Import dataComponent from '@inkeep/agents-sdk'
2. Create the data component using dataComponent()
3. Include all properties from the component data
4. Export as a named export
5. CRITICAL: All imports must be alphabetically sorted to comply with Biome linting

IMPORTANT: The exported const MUST be named exactly after the component ID (camelCased) since the ID is unique and will be imported by that name.

EXAMPLE:
import { dataComponent } from '@inkeep/agents-sdk';

// If component ID is 'user-profile', export name is 'userProfile'
export const userProfile = dataComponent({
  name: 'User Profile',
  description: 'User profile information',
  props: {
    userId: { type: 'string', required: true },
    email: { type: 'string', required: true },
    preferences: { type: 'object' }
  }
});

Generate ONLY the TypeScript code without any markdown or explanations.`;

  const { text } = await generateText({
    model,
    prompt,
    temperature: 0.1,
    maxOutputTokens: 4000,
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

  const prompt = `Generate a TypeScript file for an Inkeep artifact component.

ARTIFACT COMPONENT DATA:
${JSON.stringify(componentData, null, 2)}

COMPONENT ID: ${componentId}

REQUIREMENTS:
1. Import artifactComponent from '@inkeep/agents-sdk'
2. Create the artifact component using artifactComponent()
3. Include summaryProps and fullProps from the component data
4. Export as a named export
5. CRITICAL: All imports must be alphabetically sorted to comply with Biome linting

IMPORTANT: The exported const MUST be named exactly after the component ID (camelCased) since the ID is unique and will be imported by that name.

EXAMPLE:
import { artifactComponent } from '@inkeep/agents-sdk';

// If component ID is 'order-summary', export name is 'orderSummary'
export const orderSummary = artifactComponent({
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

  const { text } = await generateText({
    model,
    prompt,
    temperature: 0.1,
    maxOutputTokens: 4000,
  });

  writeFileSync(outputPath, cleanGeneratedCode(text));
}

/**
 * Generate environment template files
 */
export async function generateEnvironmentFiles(
  environmentsDir: string,
  projectData: any
): Promise<void> {
  // Generate production.env.ts template
  const prodEnvContent = `// Production environment configuration
import { credential } from '@inkeep/agents-sdk';

export const production = {
  // Add your production credential references here
  // Example:
  // apiKey: credential({
  //   id: 'prod-api-key',
  //   name: 'Production API Key',
  //   type: 'string'
  // })
};
`;

  // Generate staging.env.ts template
  const stagingEnvContent = `// Staging environment configuration
import { credential } from '@inkeep/agents-sdk';

export const staging = {
  // Add your staging credential references here
  // Example:
  // apiKey: credential({
  //   id: 'staging-api-key',
  //   name: 'Staging API Key',
  //   type: 'string'
  // })
};
`;

  // Generate development.env.ts template
  const devEnvContent = `// Development environment configuration
import { credential } from '@inkeep/agents-sdk';

export const development = {
  // Add your development credential references here
  // Example:
  // apiKey: credential({
  //   id: 'dev-api-key',
  //   name: 'Development API Key',
  //   type: 'string'
  // })
};
`;

  // Generate .env.validation.ts template
  const validationContent = `// Environment validation schema
import { z } from 'zod';

// Define your environment validation schema
export const envSchema = z.object({
  // Add validation rules for your credentials
  // Example:
  // apiKey: z.string().min(1, 'API Key is required')
});

// Type for validated environment
export type ValidatedEnv = z.infer<typeof envSchema>;
`;

  // Write all environment files
  writeFileSync(join(environmentsDir, 'production.env.ts'), prodEnvContent);
  writeFileSync(join(environmentsDir, 'staging.env.ts'), stagingEnvContent);
  writeFileSync(join(environmentsDir, 'development.env.ts'), devEnvContent);
  writeFileSync(join(environmentsDir, '.env.validation.ts'), validationContent);
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