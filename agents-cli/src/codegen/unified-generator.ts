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
  generateAllFilesInBatch,
  generateEnvironmentFileTemplate,
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
  statusComponentsDir: string;
  environmentsDir: string;
}

/**
 * Generate all files from plan using batch generation for token efficiency
 */
export async function generateFilesFromPlan(
  plan: GenerationPlan,
  projectData: FullProjectDefinition,
  dirs: DirectoryStructure,
  modelSettings: ModelSettings,
  debug: boolean = false,
  reasoningConfig?: Record<string, any>
): Promise<void> {
  const startTime = Date.now();

  if (debug) {
    console.log(`[DEBUG] Starting batch generation of ${plan.files.length} files...`);
  }

  // Separate environment files from regular files
  // Environment files need special handling and are generated separately
  const environmentFiles = plan.files.filter(f => f.type === 'environment');
  const regularFiles = plan.files.filter(f => f.type !== 'environment');

  if (debug && regularFiles.length > 0) {
    console.log(`[DEBUG] Batching ${regularFiles.length} regular files into single LLM request...`);
  }

  // Build file specs for batch generation
  const fileSpecs = regularFiles.map(fileInfo => {
    const outputPath = `${dirs.projectRoot}/${fileInfo.path}`;
    const fileData = extractDataForFile(fileInfo, projectData);

    // Determine file type for batch generation
    let batchType: 'index' | 'agent' | 'tool' | 'data_component' | 'artifact_component' | 'status_component';
    switch (fileInfo.type) {
      case 'index':
        batchType = 'index';
        break;
      case 'agent':
        batchType = 'agent';
        break;
      case 'tool':
        batchType = 'tool';
        break;
      case 'dataComponent':
        batchType = 'data_component';
        break;
      case 'artifactComponent':
        batchType = 'artifact_component';
        break;
      case 'statusComponent':
        batchType = 'status_component';
        break;
      default:
        throw new Error(`Unknown file type for batch generation: ${fileInfo.type}`);
    }

    // Get entity ID for this file
    const entityId = fileInfo.entities[0]?.id || fileInfo.path;

    return {
      type: batchType,
      id: entityId,
      data: fileData,
      outputPath,
      toolFilenames: undefined, // TODO: Extract from plan if needed
      componentFilenames: undefined, // TODO: Extract from plan if needed
    };
  });

  // Generate all regular files in a single batch
  if (fileSpecs.length > 0) {
    await generateAllFilesInBatch(fileSpecs, modelSettings, debug, reasoningConfig);
  }

  // Generate environment files using templates (no LLM needed)
  if (debug && environmentFiles.length > 0) {
    console.log(`[DEBUG] Generating ${environmentFiles.length} environment files using templates (no LLM)...`);
  }

  for (const envFile of environmentFiles) {
    const envStartTime = Date.now();
    const outputPath = `${dirs.projectRoot}/${envFile.path}`;
    const fileData = extractDataForFile(envFile, projectData);

    // Determine environment name from file path
    const fileName = envFile.path.split('/').pop() || '';

    if (fileName === 'index.ts') {
      // index.ts will be generated automatically when individual env files are created
      // Skip it here to avoid duplication
      continue;
    }

    // Extract environment name (e.g., 'development' from 'development.env.ts')
    const envName = fileName.replace('.env.ts', '');

    if (debug) {
      console.log(`[DEBUG] ▶ Generating ${envFile.path} using template...`);
    }

    // Use template-based generation (no LLM call)
    generateEnvironmentFileTemplate(dirs.environmentsDir, envName, fileData);

    const envDuration = ((Date.now() - envStartTime) / 1000).toFixed(1);
    if (debug) {
      console.log(`[DEBUG] ✓ Completed ${envFile.path} (template, ${envDuration}s)`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  if (debug) {
    console.log(
      `[DEBUG] All files generated in ${totalTime}s (${regularFiles.length} in batch, ${environmentFiles.length} via templates)`
    );
  }
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
  debug: boolean,
  reasoningConfig?: Record<string, any>
): Promise<void> {
  const fileStartTime = Date.now();
  const model = createModel(modelSettings);

  // Determine output path
  const outputPath = `${dirs.projectRoot}/${fileInfo.path}`;

  // Extract relevant data for this file
  let fileData = extractDataForFile(fileInfo, projectData);
  

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
    console.log(`[DEBUG] ▶ Starting: ${fileInfo.path} (${fileInfo.type})`);
  }

  try {
    const llmStartTime = Date.now();
    const text = await generateTextWithPlaceholders(
      model,
      fileData,
      promptTemplate,
      {
        temperature: 0.1,
        maxOutputTokens: fileInfo.type === 'agent' ? 16000 : 4000,
        abortSignal: AbortSignal.timeout(fileInfo.type === 'agent' ? 300000 : 90000), // Increased for reasoning (5 min for agents, 90s for others)
      },
      debug,
      { fileType: fileInfo.type },
      reasoningConfig // Pass reasoning config
    );
    const llmDuration = ((Date.now() - llmStartTime) / 1000).toFixed(1);

    const cleanedCode = cleanGeneratedCode(text);
    writeFileSync(outputPath, cleanedCode);

    const totalDuration = ((Date.now() - fileStartTime) / 1000).toFixed(1);
    if (debug) {
      console.log(
        `[DEBUG] ✓ Completed: ${fileInfo.path} (LLM: ${llmDuration}s, Total: ${totalDuration}s)`
      );
    }
  } catch (error: any) {
    console.error(`[ERROR] Failed to generate ${fileInfo.path}:`, error.message);
    throw error;
  }
}

/**
 * Extract data relevant to this file from full project data
 */
function extractDataForFile(fileInfo: FileInfo, projectData: FullProjectDefinition): any {
  
  switch (fileInfo.type) {
    case 'index':
      // Index needs full project data
      return projectData;

    case 'agent': {
      // Extract agent data by ID
      const agentId = fileInfo.entities.find((e) => e.entityType === 'agent')?.id;
      if (agentId && projectData.agents) {
        const agentData = projectData.agents[agentId];
        // Transform agent data to avoid ID collisions for LLM
        return ensureUniqueSubAgentKeys(agentData);
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

    case 'statusComponent': {
      // Extract status component from agent statusUpdates
      const statusType = fileInfo.entities[0]?.id;
      if (statusType && projectData.agents) {
        // Search through agents and subAgents for this status component
        for (const agentData of Object.values(projectData.agents)) {
          const agent = agentData as any;
          if (agent.statusUpdates?.statusComponents) {
            const found = agent.statusUpdates.statusComponents.find(
              (sc: any) => sc.type === statusType
            );
            if (found) return found;
          }
        }
      }
      return {};
    }

    case 'environment': {
      // Environment files get credential data
      // Extract credential references from all possible sources
      const credentialData: Record<string, any> = {};
      const sources: string[] = [];
      
      
      // Use direct credentialReferences if available
      if (projectData.credentialReferences) {
        Object.assign(credentialData, projectData.credentialReferences);
        sources.push('direct credentialReferences');
      }
      
      // Extract from tools with credentialReferenceId
      if (projectData.tools) {
        for (const [toolId, toolData] of Object.entries(projectData.tools)) {
          const tool = toolData as any;
          if (tool.credentialReferenceId && !credentialData[tool.credentialReferenceId]) {
            credentialData[tool.credentialReferenceId] = {
              id: tool.credentialReferenceId,
              type: 'api_key',
              description: `Credential for tool ${tool.name || toolId}`,
              _context: {
                source: 'tool',
                toolId,
                toolName: tool.name,
                serverUrl: tool.serverUrl
              }
            };
            sources.push(`tool:${toolId}`);
          }
        }
      }
      
      // Extract from external agents with credentialReferenceId
      if ((projectData as any).externalAgents) {
        for (const [agentId, agentData] of Object.entries((projectData as any).externalAgents)) {
          const agent = agentData as any;
          if (agent.credentialReferenceId && !credentialData[agent.credentialReferenceId]) {
            credentialData[agent.credentialReferenceId] = {
              id: agent.credentialReferenceId,
              type: 'api_key',
              description: `Credential for external agent ${agent.name || agentId}`,
              _context: {
                source: 'externalAgent',
                agentId,
                agentName: agent.name,
                baseUrl: agent.baseUrl
              }
            };
            sources.push(`externalAgent:${agentId}`);
          }
        }
      }
      
      // Extract from agents and subAgents contextConfig
      if (projectData.agents) {
        for (const [agentId, agentData] of Object.entries(projectData.agents)) {
          const agent = agentData as any;
          
          // Check agent's contextConfig for credentials
          if (agent.contextConfig?.headers?.credentialReferenceId) {
            const credId = agent.contextConfig.headers.credentialReferenceId;
            if (!credentialData[credId]) {
              credentialData[credId] = {
                id: credId,
                type: 'api_key',
                description: `Credential for agent ${agent.name || agentId} headers`,
                _context: {
                  source: 'agent.contextConfig.headers',
                  agentId,
                  agentName: agent.name
                }
              };
              sources.push(`agent:${agentId}:headers`);
            }
          }
          
          if (agent.contextConfig?.contextVariables) {
            for (const [varId, varData] of Object.entries(agent.contextConfig.contextVariables)) {
              const contextVar = varData as any;
              if (contextVar.credentialReferenceId) {
                const credId = contextVar.credentialReferenceId;
                if (!credentialData[credId]) {
                  credentialData[credId] = {
                    id: credId,
                    type: 'api_key',
                    description: `Credential for agent ${agent.name || agentId} context variable ${varId}`,
                    _context: {
                      source: 'agent.contextConfig.contextVariables',
                      agentId,
                      agentName: agent.name,
                      variableId: varId
                    }
                  };
                  sources.push(`agent:${agentId}:contextVar:${varId}`);
                }
              }
            }
          }
          
          // Check subAgents for credentials
          if (agent.subAgents) {
            for (const [subAgentId, subAgentData] of Object.entries(agent.subAgents)) {
              const subAgent = subAgentData as any;
              
              if (subAgent.contextConfig?.headers?.credentialReferenceId) {
                const credId = subAgent.contextConfig.headers.credentialReferenceId;
                if (!credentialData[credId]) {
                  credentialData[credId] = {
                    id: credId,
                    type: 'api_key',
                    description: `Credential for subAgent ${subAgent.name || subAgentId} headers`,
                    _context: {
                      source: 'subAgent.contextConfig.headers',
                      agentId,
                      subAgentId,
                      subAgentName: subAgent.name
                    }
                  };
                  sources.push(`subAgent:${subAgentId}:headers`);
                }
              }
              
              if (subAgent.contextConfig?.contextVariables) {
                for (const [varId, varData] of Object.entries(subAgent.contextConfig.contextVariables)) {
                  const contextVar = varData as any;
                  if (contextVar.credentialReferenceId) {
                    const credId = contextVar.credentialReferenceId;
                    if (!credentialData[credId]) {
                      credentialData[credId] = {
                        id: credId,
                        type: 'api_key',
                        description: `Credential for subAgent ${subAgent.name || subAgentId} context variable ${varId}`,
                        _context: {
                          source: 'subAgent.contextConfig.contextVariables',
                          agentId,
                          subAgentId,
                          subAgentName: subAgent.name,
                          variableId: varId
                        }
                      };
                      sources.push(`subAgent:${subAgentId}:contextVar:${varId}`);
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      // Add metadata about where credentials were found
      if (Object.keys(credentialData).length > 0) {
        credentialData._meta = {
          foundCredentials: Object.keys(credentialData).filter(k => k !== '_meta'),
          sources,
          extractedFrom: 'comprehensive scan of project data'
        };
      }
      
      
      return credentialData;
    }

    default:
      return {};
  }
}

/**
 * Ensure subAgent keys are unique to avoid LLM confusion
 * 
 * When agent and subAgent have the same ID, the LLM sees duplicate keys and generates empty fields.
 * This adds a simple suffix to make subAgent keys unique while preserving original IDs.
 */
function ensureUniqueSubAgentKeys(agentData: any): any {
  if (!agentData?.subAgents) {
    return agentData;
  }

  const transformedData = { ...agentData };
  const transformedSubAgents: Record<string, any> = {};

  for (const [subAgentKey, subAgentData] of Object.entries(agentData.subAgents)) {
    let uniqueKey = subAgentKey;
    
    // If subAgent key matches agent ID, make it unique
    if (subAgentKey === agentData.id) {
      uniqueKey = `${subAgentKey}_sub`;
    }
    
    transformedSubAgents[uniqueKey] = subAgentData;
  }

  transformedData.subAgents = transformedSubAgents;
  return transformedData;
}

/**
 * Find example code from detected patterns
 */
function findExampleCode(fileInfo: FileInfo, patterns: DetectedPatterns): string | undefined {
  // Sample files disabled to prevent misleading examples
  return undefined;
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
1. Use EXACT variable names from the registry above - DO NOT modify or "improve" them
2. Copy the exact import statements provided in the registry
3. The 'id' field in objects keeps the original value
4. Variable names must be unique (no conflicts across types)
5. Follow detected patterns for code style
6. Match existing formatting and conventions
7. NEVER generate your own variable names - only use what's provided

PLACEHOLDER HANDLING (CRITICAL):
8. When you see placeholder values like "<{{path.to.field.abc123}}>" in the JSON data, copy them EXACTLY as-is into the generated TypeScript code
9. DO NOT replace placeholders with empty strings or other values - use the exact placeholder text
10. Placeholders will be automatically replaced with real values after code generation
11. ESPECIALLY when IDs are duplicated in the data, always use the placeholder values from the JSON - never generate empty template literals
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

    case 'statusComponent':
      return createStatusComponentPrompt(fileData, context, registryInfo, commonInstructions);

    case 'environment':
      return createEnvironmentPrompt(fileData, context, registryInfo, commonInstructions);

    default:
      throw new Error(`Unknown file type: ${fileInfo.type}`);
  }
}

/**
 * Create prompt for index file
 */
function createIndexPrompt(
  _projectData: any,
  context: GenerationContext,
  _registryInfo: string,
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
  _agentData: any,
  context: GenerationContext,
  _registryInfo: string,
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

${
  hasInlineTools
    ? `
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
`
    : ''
}

IMPORTS (CRITICAL - MUST BE FIRST):
ALWAYS import these at the TOP of the file:
- import { agent, subAgent, functionTool } from '@inkeep/agents-sdk';
- import { z } from 'zod'; (REQUIRED when using ANY Zod schemas like responseSchema, headersSchema)
- import { contextConfig, fetchDefinition, headers } from '@inkeep/agents-core'; (REQUIRED when agent has contextConfig)
- import status components from '../status-components/' when needed

SUBAGENT AND AGENT API (CRITICAL):
- Use 'canUse' (NOT 'tools') - must be a FUNCTION returning array
- Use 'canDelegateTo' - must be a FUNCTION returning array
- Use 'dataComponents' - must be a FUNCTION returning array
- Use 'subAgents' in agent() - must be a FUNCTION returning array

CONTEXT CONFIG (CRITICAL - NO PLAIN OBJECTS):
- NEVER use plain objects for contextConfig
- ALWAYS use helper functions: headers(), fetchDefinition(), contextConfig()
- Create separate const variables for each helper before the agent definition
- Pattern:
  const myHeaders = headers({ schema: z.object({ api_key: z.string() }) });
  const myFetch = fetchDefinition({ id: '...', fetchConfig: {...}, responseSchema: z.object({...}) });
  const myContext = contextConfig({ headers: myHeaders, contextVariables: { data: myFetch } });
  export const myAgent = agent({ contextConfig: myContext });
- Use myHeaders.toTemplate('key_name') for header values in fetchConfig
- Use myContext.toTemplate('variable.field') for prompt interpolation

FETCHDEFINITION STRUCTURE (CRITICAL - COPY EXACT FORMAT):
- ALWAYS wrap HTTP config in 'fetchConfig' object
- COPY the exact authorization format from source data (don't modify headers)
- Use .nullable() instead of z.union([type, z.null()]) for schemas
- responseSchema is raw Zod code (NO backticks around it)
- String values use template literals (backticks for strings)

CORRECT fetchDefinition structure:
fetchDefinition({
  id: 'fetch-id',
  name: 'Fetch Name',
  trigger: 'initialization',
  fetchConfig: {
    url: 'api-endpoint-url',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: headersVar.toTemplate('key') // COPY EXACT format from source
    },
    body: { query: 'request-body' }
  },
  responseSchema: z.object({
    field: z.string().nullable()
  }),
  transform: 'data.path',
  defaultValue: 'fallback'
})

STRING LITERALS (CRITICAL - MUST FOLLOW):
- For STRING VALUES: ALWAYS use template literals (backticks \`)
- This includes: prompt, description, query, url, method, body, defaultValue, etc.
- Template literals prevent syntax errors with apostrophes (don't, user's, it's)
- For object keys that are identifiers (no hyphens), omit quotes: Authorization not 'Authorization'
- For object keys with hyphens, use quotes: 'Content-Type'

EXCEPTION - Schema Fields (NO template literals):
- headersSchema: z.object({ ... }) (raw Zod code, NOT a string)
- responseSchema: z.object({ ... }) (raw Zod code, NOT a string)
- These are TypeScript expressions, not string values

CORRECT EXAMPLES:
✅ prompt: \`You are a helpful assistant.\` (string value)
✅ query: \`query GetData { field }\` (string value)
✅ responseSchema: z.object({ name: z.string() }) (Zod code, NO backticks)
✅ headersSchema: z.object({ 'inkeep_api_key': z.string() }) (Zod code, NO backticks)

WRONG EXAMPLES:
❌ prompt: 'You are a helpful assistant.' (use backticks not single quotes)
❌ responseSchema: \`z.object({ name: z.string() })\` (don't wrap Zod in backticks)

STATUS COMPONENTS (CRITICAL):
- Status components are ALWAYS imported from '../status-components/' directory
- In statusUpdates.statusComponents array, use statusComponent.config to get the config object
- NEVER inline status component definitions in the agent file
- Example: import { toolSummary } from '../status-components/tool-summary'
- Then use: statusComponents: [toolSummary.config]

✅ CORRECT:
import { toolSummary } from '../status-components/tool-summary';

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
  subAgents: () => [weatherSubAgent],  // FUNCTION returning array
  statusUpdates: {
    numEvents: 1,
    timeInSeconds: 1,
    statusComponents: [toolSummary.config]  // Use .config
  }
});

❌ WRONG:
prompt: 'Multi-line
string',  // NO - use backticks for multi-line
tools: [tool1, tool2],  // NO - use 'canUse' not 'tools'
canUse: [tool1, tool2],  // NO - must be a function
subAgents: [weatherSubAgent],  // NO - must be a function
statusComponents: [{ type: '...', ... }],  // NO - import from files

Generate ONLY the TypeScript code without markdown.`;
}

/**
 * Create prompt for tool file
 */
function createToolPrompt(
  _toolData: any,
  _context: GenerationContext,
  _registryInfo: string,
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
4. For tools with credentials, import envSettings and use envSettings.getEnvironmentSetting('credential_key')
5. CRITICAL: Transport must be an OBJECT format: transport: { type: 'streamable_http' } NOT a string

CREDENTIAL HANDLING (CRITICAL):
If the tool data includes credential information, you MUST:
1. Import { envSettings } from '../environments'
2. Use credential: envSettings.getEnvironmentSetting('credential_key') in the tool definition
3. Convert credential IDs to underscore format (e.g., 'linear-api' -> 'linear_api')

Example for tool with credential:
\`\`\`typescript
import { mcpTool } from '@inkeep/agents-sdk';
import { envSettings } from '../environments';

export const toolName = mcpTool({
  id: 'tool-id',
  name: 'Tool Name',
  serverUrl: 'https://example.com/mcp',
  credential: envSettings.getEnvironmentSetting('linear_api'), // underscore format
  transport: { type: 'streamable_http' }
});
\`\`\`

Generate ONLY the TypeScript code without markdown.`;
}

/**
 * Create prompt for data component file
 */
function createDataComponentPrompt(
  _componentData: any,
  _context: GenerationContext,
  _registryInfo: string,
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
  props: z.object({
    fieldName: z.string().describe('Field description'),
    optionalField: z.number().optional().describe('Optional field description'),
  })
})

REQUIREMENTS:
1. Import dataComponent from '@inkeep/agents-sdk'
2. Import z from 'zod' for schema definitions
3. Use exact variable name from registry
4. Use 'props' property with Zod schema (NOT JSON Schema)
5. Include 'id', 'name', and 'description' properties
6. Use .describe() for field descriptions
7. Use .optional() for optional fields
8. Use .nullable() for nullable fields (not z.union([z.string(), z.null()]))
9. CRITICAL: All imports must be alphabetically sorted to comply with Biome linting

EXAMPLE:
import { dataComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const weatherForecast = dataComponent({
  id: 'weather-forecast',
  name: 'WeatherForecast',
  description: 'Hourly weather forecast',
  props: z.object({
    forecast: z.array(z.object({
      time: z.string().describe('The time of current item E.g. 12PM, 1PM'),
      temperature: z.number().describe('Temperature at given time in Fahrenheit'),
      code: z.number().describe('Weather code at given time'),
    })).describe('The hourly forecast for the weather at a given location'),
  }),
});

EXAMPLE WITH OPTIONAL FIELDS:
import { dataComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

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

Generate ONLY the TypeScript code without markdown.`;
}

/**
 * Create prompt for artifact component file
 */
function createArtifactComponentPrompt(
  _componentData: any,
  _context: GenerationContext,
  _registryInfo: string,
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
 * Create prompt for status component file
 */
function createStatusComponentPrompt(
  _componentData: any,
  _context: GenerationContext,
  _registryInfo: string,
  commonInstructions: string
): string {
  return `Generate TypeScript file for Inkeep status component.

COMPONENT DATA:
{{DATA}}

${commonInstructions}

REQUIREMENTS:
1. Import statusComponent from '@inkeep/agents-sdk'
2. Import z from 'zod' for schema definitions if detailsSchema is present
3. Use exact variable name from registry
4. Convert any JSON Schema in detailsSchema to Zod schema
5. Use 'type' field as the identifier
6. The statusComponent() function handles .config conversion automatically

EXAMPLE:
import { statusComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const toolSummary = statusComponent({
  type: 'tool_summary',
  description: 'Summary of tool calls',
  detailsSchema: z.object({
    tool_name: z.string().describe('Name of tool used'),
    summary: z.string().describe('What was accomplished'),
  }),
});

Generate ONLY the TypeScript code without markdown.`;
}

/**
 * Format registry information for a specific file
 */
function formatRegistryForFile(fileInfo: FileInfo, _registry: any): string {
  let result = 'REQUIRED VARIABLE NAMES (YOU MUST USE ONLY THESE EXACT NAMES):\n\n';

  // Entities defined in this file
  if (fileInfo.entities.length > 0) {
    result += 'Variables to define in this file:\n';
    for (const entity of fileInfo.entities) {
      result += `  - ID "${entity.id}" → MUST use variable name: ${entity.variableName}\n`;
    }
    result += '\n';
  }

  // Inline content (subagents, etc.)
  if (fileInfo.inlineContent && fileInfo.inlineContent.length > 0) {
    result += 'Inline variables to define in this file:\n';
    for (const entity of fileInfo.inlineContent) {
      result += `  - ID "${entity.id}" → MUST use variable name: ${entity.variableName}\n`;
    }
    result += '\n';
  }

  // Dependencies (imports)
  if (fileInfo.dependencies.length > 0) {
    result += '!!! EXACT IMPORT STATEMENTS - COPY PRECISELY !!!\n';
    for (const dep of fileInfo.dependencies) {
      result += `import { ${dep.variableName} } from '${dep.fromPath}';\n`;
    }
    result += '\n';
    result += '!!! WARNING: IDs ≠ FILE PATHS !!!\n';
    result += 'Entity IDs (with underscores) are NOT the same as file paths (with kebab-case):\n';
    for (const dep of fileInfo.dependencies) {
      // Try to extract the entity from the file info to show the ID vs path difference
      const entity = fileInfo.entities.find(e => e.variableName === dep.variableName) ||
                     fileInfo.inlineContent?.find(e => e.variableName === dep.variableName);
      if (entity && entity.id !== dep.fromPath.split('/').pop()?.replace('.ts', '')) {
        result += `- Entity ID: "${entity.id}" → File path: "${dep.fromPath}"\n`;
      }
    }
    result += '\nCRITICAL: Use the FILE PATHS above, NOT the entity IDs!\n\n';
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

/**
 * Create prompt for environment file
 */
function createEnvironmentPrompt(
  credentialData: any,
  context: GenerationContext,
  _registryInfo: string,
  commonInstructions: string
): string {
  // Determine environment name from file path (e.g., "development" from "environments/development.env.ts")
  const filePath = context.fileInfo.path || '';
  const fileName = filePath.split('/').pop() || '';
  
  // Check if this is the environments index file
  if (fileName === 'index.ts') {
    // Find all environment files from the plan to get their exact variable names
    const environmentFiles = context.plan.files.filter(f => 
      f.type === 'environment' && f.path !== 'environments/index.ts'
    );
    
    // Build import statements using exact variable names from registry
    const imports = environmentFiles.map(envFile => {
      const envEntity = envFile.entities[0]; // Environment files have one entity
      if (envEntity) {
        return `import { ${envEntity.variableName} } from './${envFile.path.replace('environments/', '').replace('.ts', '')}';`;
      }
      return '';
    }).filter(Boolean).join('\n');
    
    // Build the object properties using exact variable names
    const envSettings = environmentFiles.map(envFile => {
      const envEntity = envFile.entities[0];
      return envEntity ? `  ${envEntity.variableName},` : '';
    }).filter(Boolean).join('\n');


    return `${commonInstructions}

ENVIRONMENTS INDEX FILE (CRITICAL):

Create an environments/index.ts file that exports environment settings using createEnvironmentSettings.

CREDENTIAL DATA (from project):
${JSON.stringify(credentialData, null, 2)}

EXACT IMPORT STATEMENTS (MUST USE THESE):
${imports}

ENVIRONMENTS INDEX STRUCTURE (MUST FOLLOW EXACTLY):

import { createEnvironmentSettings } from '@inkeep/agents-sdk';
${imports}

export const envSettings = createEnvironmentSettings({
${envSettings}
});

CRITICAL RULES:
1. Import createEnvironmentSettings from '@inkeep/agents-sdk'
2. Use the EXACT import statements provided above - DO NOT modify them
3. Use the EXACT variable names in the createEnvironmentSettings object
4. Export envSettings using createEnvironmentSettings()
5. Include all environments that have credential files

Generate ONLY the TypeScript code without markdown.`;
  }
  
  // Individual environment file
  const envName = fileName.replace('.env.ts', '') || 'development';
  
  return `${commonInstructions}

ENVIRONMENT FILE (CRITICAL):

Create an environment file that registers credential settings for the "${envName}" environment.

CREDENTIAL DATA (from project):
${JSON.stringify(credentialData, null, 2)}

ENVIRONMENT FILE STRUCTURE (MUST FOLLOW EXACTLY):

import { credential, registerEnvironmentSettings } from '@inkeep/agents-sdk';

export const ${envName} = registerEnvironmentSettings({
  credentials: {
    CREDENTIAL_KEY: credential({
      id: 'CREDENTIAL_ID',
      type: 'CREDENTIAL_TYPE', 
      credentialStoreId: 'CREDENTIAL_STORE_ID',
      retrievalParams: {
        key: 'ENV_VARIABLE_NAME'
      }
    })
  }
});

CRITICAL RULES:
1. Import { credential, registerEnvironmentSettings } from '@inkeep/agents-sdk'
2. Export a const named "${envName}" (matching the environment)
3. Use registerEnvironmentSettings() wrapper
4. Create credential() objects for each credential in the data
5. Convert credential IDs to environment variable keys (e.g., 'linear-api' -> 'LINEAR_API_KEY')
6. Use exact credential IDs, types, and credentialStoreId from the data provided
7. Set retrievalParams.key to the environment variable name (uppercase with underscores)

Example for credential with id 'linear-api':
- Export const: ${envName}
- Credential key: linear_api (underscore format for object key)
- retrievalParams.key: 'LINEAR_API_KEY' (uppercase for environment variable)

Generate ONLY the TypeScript code without markdown.`;
}
