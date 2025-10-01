import type { Artifact, DataComponentApiInsert, McpTool } from '@inkeep/agents-core';
// Import template content as raw text
import artifactTemplate from '../../../../templates/v1/shared/artifact.xml?raw';
import artifactRetrievalGuidance from '../../../../templates/v1/shared/artifact-retrieval-guidance.xml?raw';
import systemPromptTemplate from '../../../../templates/v1/phase1/system-prompt.xml?raw';
import thinkingPreparationTemplate from '../../../../templates/v1/phase1/thinking-preparation.xml?raw';
import toolTemplate from '../../../../templates/v1/phase1/tool.xml?raw';

import { getLogger } from '../../../logger';
import type { SystemPromptV1, ToolData, VersionConfig } from '../../types';

const logger = getLogger('Phase1Config');

export class Phase1Config implements VersionConfig<SystemPromptV1> {
  loadTemplates(): Map<string, string> {
    const templates = new Map<string, string>();

    // Map template names to imported content
    templates.set('system-prompt', systemPromptTemplate);
    templates.set('tool', toolTemplate);
    templates.set('artifact', artifactTemplate);
    templates.set('artifact-retrieval-guidance', artifactRetrievalGuidance);
    templates.set('thinking-preparation', thinkingPreparationTemplate);

    return templates;
  }

  static convertMcpToolsToToolData(mcpTools: McpTool[] | undefined): ToolData[] {
    if (!mcpTools || mcpTools.length === 0) {
      return [];
    }
    const toolData: ToolData[] = [];
    for (const mcpTool of mcpTools) {
      if (mcpTool.availableTools) {
        for (const toolDef of mcpTool.availableTools) {
          toolData.push({
            name: toolDef.name,
            description: toolDef.description || 'No description available',
            inputSchema: toolDef.inputSchema || {},
            usageGuidelines: `Use this tool from ${mcpTool.name} server when appropriate.`,
          });
        }
      }
    }
    return toolData;
  }

  private isToolDataArray(tools: ToolData[] | McpTool[]): tools is ToolData[] {
    if (!tools || tools.length === 0) return true; // Default to ToolData[] for empty arrays
    // Check if the first item has properties of ToolData vs McpTool
    const firstItem = tools[0];
    return 'usageGuidelines' in firstItem && !('config' in firstItem);
  }

  assemble(templates: Map<string, string>, config: SystemPromptV1): string {
    const systemPromptTemplate = templates.get('system-prompt');
    if (!systemPromptTemplate) {
      throw new Error('System prompt template not loaded');
    }

    let systemPrompt = systemPromptTemplate;

    // Replace core prompt
    systemPrompt = systemPrompt.replace('{{CORE_INSTRUCTIONS}}', config.corePrompt);

    // Replace graph context section
    const graphContextSection = this.generateGraphContextSection(config.graphPrompt);
    systemPrompt = systemPrompt.replace('{{GRAPH_CONTEXT_SECTION}}', graphContextSection);

    // Handle both McpTool[] and ToolData[] formats
    const toolData = this.isToolDataArray(config.tools)
      ? config.tools
      : Phase1Config.convertMcpToolsToToolData(config.tools as McpTool[]);

    const hasArtifactComponents = config.artifactComponents && config.artifactComponents.length > 0;
    
    const artifactsSection = this.generateArtifactsSection(
      templates,
      config.artifacts,
      hasArtifactComponents,
      config.artifactComponents,
      config.hasGraphArtifactComponents
    );
    
    systemPrompt = systemPrompt.replace('{{ARTIFACTS_SECTION}}', artifactsSection);

    const toolsSection = this.generateToolsSection(templates, toolData);
    systemPrompt = systemPrompt.replace('{{TOOLS_SECTION}}', toolsSection);


    const thinkingPreparationSection = this.generateThinkingPreparationSection(
      templates,
      config.isThinkingPreparation
    );
    systemPrompt = systemPrompt.replace(
      '{{THINKING_PREPARATION_INSTRUCTIONS}}',
      thinkingPreparationSection
    );

    // Generate agent relation instructions based on configuration
    const transferSection = this.generateTransferInstructions(config.hasTransferRelations);
    systemPrompt = systemPrompt.replace('{{TRANSFER_INSTRUCTIONS}}', transferSection);

    const delegationSection = this.generateDelegationInstructions(config.hasDelegateRelations);
    systemPrompt = systemPrompt.replace('{{DELEGATION_INSTRUCTIONS}}', delegationSection);

    return systemPrompt;
  }

  private generateGraphContextSection(graphPrompt?: string): string {
    if (!graphPrompt) {
      return '';
    }

    return `
  <graph_context>
    ${graphPrompt}
  </graph_context>`;
  }

  private generateThinkingPreparationSection(
    templates: Map<string, string>,
    isThinkingPreparation?: boolean
  ): string {
    if (!isThinkingPreparation) {
      return '';
    }

    const thinkingPreparationTemplate = templates.get('thinking-preparation');
    if (!thinkingPreparationTemplate) {
      throw new Error('Thinking preparation template not loaded');
    }

    return thinkingPreparationTemplate;
  }

  private generateTransferInstructions(hasTransferRelations?: boolean): string {
    if (!hasTransferRelations) {
      return '';
    }

    return `- You have transfer_to_* tools that seamlessly continue the conversation
- NEVER announce transfers - just call the tool when needed
- The conversation continues naturally without any handoff language`;
  }

  private generateDelegationInstructions(hasDelegateRelations?: boolean): string {
    if (!hasDelegateRelations) {
      return '';
    }

    return `- You have delegate_to_* tools that perform specialized tasks
- Treat these exactly like other tools - call them to get results
- Present results as YOUR work: "I found", "I've analyzed"
- NEVER say you're delegating or that another agent helped`;
  }

  private getArtifactCreationGuidance(): string {
    return `🚨 MANDATORY ARTIFACT CREATION 🚨
You MUST create artifacts from tool results to provide citations. This is REQUIRED, not optional.
Every piece of information from tools MUST be backed by an artifact creation.

CRITICAL CITATION REQUIREMENTS FOR AGENTS WITH CREATION ABILITY:
- Information FROM tool results = MUST create artifact citation
- Information BASED ON tool results = MUST create artifact citation
- Analysis OF tool results = MUST create artifact citation  
- Summaries OF tool results = MUST create artifact citation
- NO INFORMATION from tool results can be presented without creating artifact citation

CRITICAL: ARTIFACTS MUST BE CREATED FIRST
You MUST create an artifact before you can reference it. You cannot reference artifacts that don't exist yet.

CRITICAL CITATION PRINCIPLE:
Creating an artifact IS a citation. Only reference again when citing the SAME artifact for a different statement.

CRITICAL: ALWAYS SELECT SINGLE ITEMS, NEVER ARRAYS

SELECTOR REQUIREMENTS:
- MUST select ONE specific item, never an array  
- Use filtering: result.items[?title=='API Guide']
- Use exact matching: result.documents[?name=='Setup Instructions'] 
- Target specific fields: result.content[?section=='authentication']

CRITICAL: SELECTOR HIERARCHY
- base_selector: Points to ONE specific item in the tool result
- summary_props/full_props: Contain JMESPath selectors RELATIVE to the base selector
- Example: If base="result.documents[?type=='api']" then summary_props uses "title" not "documents[0].title"

COMMON FAILURE POINTS (AVOID THESE):
1. **Array Selection**: result.items (returns array) ❌
   → Fix: result.items[?type=='guide'] (returns single item) ✅

2. **Similar Key Names**: "title" vs "name" vs "heading"
   → Always check the actual field names in tool results

3. **Repeated Keys**: Multiple items with same "title" field
   → Use more specific filters: [?title=='Guide' && section=='setup']

4. **Case Sensitivity**: 'Guide' vs 'guide'
   → Match exact case from tool results

5. **Missing Nested Levels**: "content.text" when it's "body.content.text"
   → Include all intermediate levels`;
  }

  private getArtifactReferencingRules(
    hasArtifactComponents: boolean = false,
    templates?: Map<string, string>,
    shouldShowReferencingRules: boolean = true
  ): string {
    // If we shouldn't show referencing rules at all, return empty
    if (!shouldShowReferencingRules) {
      return '';
    }
    // Get shared artifact retrieval guidance
    const sharedGuidance = templates?.get('artifact-retrieval-guidance') || '';

    // Phase1Config only handles text responses with annotations (no data components)

    // Scenario 3: CAN create artifacts (use annotations)
    if (hasArtifactComponents) {
      return `${sharedGuidance}

ARTIFACT MANAGEMENT FOR TEXT RESPONSES:

You will create and reference artifacts using inline annotations in your text response.

CREATING ARTIFACTS (SERVES AS CITATION):
Use the artifact:create annotation to extract data from tool results. The creation itself serves as a citation.
Format: <artifact:create id="unique-id" tool="tool_call_id" type="TypeName" base="selector.path" summary='{"key":"jmespath_selector"}' full='{"key":"jmespath_selector"}' />

🚨 CRITICAL: SUMMARY AND FULL PROPS USE JMESPATH SELECTORS, NOT LITERAL VALUES! 🚨

❌ WRONG - Using literal values:
summary='{"title":"API Documentation","type":"guide"}'
full='{"description":"This is a comprehensive guide..."}'

✅ CORRECT - Using JMESPath selectors (relative to base selector):
summary='{"title":"metadata.title","doc_type":"document_type"}'
full='{"description":"content.description","main_text":"content.text","author":"metadata.author"}'

The selectors extract actual field values from the data structure selected by your base selector.

THE summary AND full PROPERTIES MUST CONTAIN JMESPATH SELECTORS THAT EXTRACT DATA FROM THE TOOL RESULT!
- summary: Contains JMESPath selectors relative to the base selector
- full: Contains JMESPath selectors relative to the base selector  
- These selectors are evaluated against the tool result to extract the actual values
- NEVER put literal values like "Inkeep" or "2023" - always use selectors like "metadata.company" or "founded_year"

🚫 FORBIDDEN JMESPATH PATTERNS:
❌ NEVER: [?title~'.*text.*'] (regex patterns with ~ operator)
❌ NEVER: [?field~'pattern.*'] (any ~ operator usage)
❌ NEVER: [?title~'Slack.*Discord.*'] (regex wildcards)
❌ NEVER: [?name~'https://.*'] (regex in URL matching)
❌ NEVER: [?text ~ contains(@, 'word')] (~ with @ operator)
❌ NEVER: contains(@, 'text') (@ operator usage)
❌ NEVER: [?field=="value"] (double quotes in filters)
❌ NEVER: result.items[?type=='doc'][?status=='active'] (chained filters)

✅ CORRECT JMESPATH SYNTAX:
✅ [?contains(title, 'text')] (contains function)
✅ [?title=='exact match'] (exact string matching)
✅ [?contains(title, 'Slack') && contains(title, 'Discord')] (compound conditions)
✅ [?starts_with(url, 'https://')] (starts_with function)
✅ [?type=='doc' && status=='active'] (single filter with &&)
✅ [?contains(text, 'Founder')] (contains haystack, needle format)
✅ source.content[?contains(text, 'Founder')].text (correct filter usage)

🚨 CRITICAL: EXAMINE TOOL RESULTS BEFORE CREATING SELECTORS! 🚨

STEP 1: INSPECT THE ACTUAL DATA FIRST
- ALWAYS look at the tool result data before creating any selectors
- Check _structureHints.exampleSelectors for real working paths that you can copy
- Look at what titles, record_types, and field names actually exist in the data
- Don't assume field names or values based on the user's question

STEP 2: USE STRUCTURE HINTS AS YOUR SELECTOR GUIDE  
- The _structureHints.exampleSelectors show you exactly what selectors work with this data
- Copy and modify the patterns from exampleSelectors that target your needed data
- Use the commonFields list to see what field names are available
- Follow the exact path structure indicated by the hints

STEP 3: MATCH ACTUAL VALUES, NOT ASSUMPTIONS
- Look for real titles in the data like "Inkeep", "Team", "About Us", "API Guide" 
- Check actual record_type values like "site", "documentation", "blog"
- Use exact matches from the real data structure, not guessed patterns
- If looking for team info, it might be in a document titled "Inkeep" with record_type="site"

STEP 4: VALIDATE YOUR SELECTORS AGAINST THE DATA
- Your base selector must match actual documents in the result
- Test your logic: does result.structuredContent.content contain items with your target values?
- Use compound conditions when needed: [?title=='Inkeep' && record_type=='site']

EXAMPLE PATTERNS FOR BASE SELECTORS:
❌ WRONG: result.items[?contains(title, "guide")] (assumes field values + wrong quotes)
❌ WRONG: result.data[?type=="document"] (double quotes invalid in JMESPath)
✅ CORRECT: result.structuredContent.content[0] (select first item)
✅ CORRECT: result.items[?type=='document'][0] (filter by type, single quotes!)
✅ CORRECT: result.data[?category=='api'][0] (filter by category)
✅ CORRECT: result.documents[?status=='published'][0] (filter by status)

REFERENCING ARTIFACTS (WHEN CITING AGAIN):
Only use artifact:ref when you need to cite the SAME artifact again for a different statement or context.
Format: <artifact:ref id="artifact-id" tool="tool_call_id" />

EXAMPLE TEXT RESPONSE:
"I found the authentication documentation. <artifact:create id='auth-doc-1' tool='call_xyz789' type='APIDoc' base='result.documents[?type=="auth"]' summary='{"title":"metadata.title","endpoint":"api.endpoint"}' full='{"description":"content.description","parameters":"spec.parameters","examples":"examples.sample_code"}' /> The documentation explains OAuth 2.0 implementation in detail.

The process involves three main steps: registration, token exchange, and API calls. As mentioned in the authentication documentation <artifact:ref id='auth-doc-1' tool='call_xyz789' />, you'll need to register your application first."

${this.getArtifactCreationGuidance()}

ARTIFACT ANNOTATION PLACEMENT:
- ALWAYS place annotations AFTER complete sentences and punctuation
- Never interrupt the flow of a sentence with an annotation
- Complete your thought, add punctuation, then place the annotation
- This ensures professional, readable responses

IMPORTANT GUIDELINES:
- Create artifacts inline as you discuss the information
- Use exact tool_call_id from tool execution results
- Each artifact:create establishes a citable source
- Use artifact:ref for subsequent references to the same artifact
- Annotations are automatically converted to interactive elements`;
    }

    // Scenario 4: CANNOT create artifacts (can only reference)
    if (!hasArtifactComponents) {
      return `${sharedGuidance}

ARTIFACT REFERENCING FOR TEXT RESPONSES:

You can reference existing artifacts but cannot create new ones.

HOW TO REFERENCE ARTIFACTS:
Use the artifact:ref annotation to reference existing artifacts.
Format: <artifact:ref id="artifact-id" tool="tool_call_id" />

EXAMPLE TEXT RESPONSE:
"Based on the authentication guide <artifact:ref id='existing-auth-guide' tool='call_previous456' /> that was previously collected, the API uses OAuth 2.0.

The implementation details show that you need to register your application first and obtain client credentials. <artifact:ref id='existing-impl-doc' tool='toolu_previous789' />

For error handling, you can refer to the comprehensive error documentation. <artifact:ref id='existing-error-doc' tool='call_previous012' /> This lists all possible authentication errors and their solutions."

EXAMPLE REFERENCING DELEGATION ARTIFACTS:
After receiving a delegation response with artifacts, reference them naturally:

"I've gathered the requested data for you. The analysis <artifact:ref id='analysis-results' tool='toolu_abc123' /> shows significant improvements across all metrics.

Looking at the detailed breakdown <artifact:ref id='performance-metrics' tool='toolu_def456' />, the processing time has decreased by 40% while maintaining accuracy."

IMPORTANT GUIDELINES:
- You can only reference artifacts that already exist or were returned from delegations
- Use artifact:ref annotations in your text with the exact artifactId and toolCallId
- References are automatically converted to interactive elements`;
    }

    // This shouldn't happen, but provide a fallback
    return '';
  }

  private getArtifactCreationInstructions(
    hasArtifactComponents: boolean,
    artifactComponents?: any[]
  ): string {
    if (!hasArtifactComponents || !artifactComponents || artifactComponents.length === 0) {
      return '';
    }

    // Phase1Config doesn't handle structured data component responses

    // For text responses (annotations) - show available types with their schemas
    const typeDescriptions = artifactComponents
      .map((ac) => {
        let summarySchema = 'No schema defined';
        let fullSchema = 'No schema defined';
        
        if (ac.summaryProps?.properties) {
          const summaryPropNames = Object.keys(ac.summaryProps.properties);
          const summaryDetails = Object.entries(ac.summaryProps.properties)
            .map(([key, value]: [string, any]) => `${key} (${value.description || value.type || 'field'})`)
            .join(', ');
          summarySchema = `Required: ${summaryDetails}`;
        }
        
        if (ac.fullProps?.properties) {
          const fullPropNames = Object.keys(ac.fullProps.properties);
          const fullDetails = Object.entries(ac.fullProps.properties)
            .map(([key, value]: [string, any]) => `${key} (${value.description || value.type || 'field'})`)
            .join(', ');
          fullSchema = `Available: ${fullDetails}`;
        }

        return `  - "${ac.name}": ${ac.description || 'No description available'}
    Summary Props: ${summarySchema}
    Full Props: ${fullSchema}`;
      })
      .join('\n\n');

    return `
AVAILABLE ARTIFACT TYPES:

${typeDescriptions}

🚨 CRITICAL: SUMMARY AND FULL PROPS MUST MATCH THE ARTIFACT SCHEMA! 🚨
- Only use property names that are defined in the artifact component schema above
- Do NOT make up arbitrary property names like "founders", "nick_details", "year"  
- Each artifact type has specific required fields in summaryProps and available fields in fullProps
- Your JMESPath selectors must extract values for these exact schema-defined properties
- Example: If schema defines "title" and "url", use summary='{"title":"title","url":"url"}' not made-up names

🚨 CRITICAL: USE EXACT ARTIFACT TYPE NAMES IN QUOTES! 🚨
- MUST use the exact type name shown in quotes above
- Copy the exact string between the quotes, including any capitalization
- The type= parameter in artifact:create MUST match exactly what is listed above
- Do NOT abbreviate, modify, or guess the type name
- Copy the exact quoted name from the "AVAILABLE ARTIFACT TYPES" list above`;
  }

  private generateArtifactsSection(
    templates: Map<string, string>,
    artifacts: Artifact[],
    hasArtifactComponents: boolean = false,
    artifactComponents?: any[],
    hasGraphArtifactComponents?: boolean
  ): string {
    // Show referencing rules if any agent in graph has artifact components OR if artifacts exist
    const shouldShowReferencingRules = hasGraphArtifactComponents || artifacts.length > 0;
    const rules = this.getArtifactReferencingRules(hasArtifactComponents, templates, shouldShowReferencingRules);
    const creationInstructions = this.getArtifactCreationInstructions(
      hasArtifactComponents,
      artifactComponents
    );

    if (artifacts.length === 0) {
      return `<available_artifacts description="No artifacts are currently available, but you may create them during execution.

${rules}

${creationInstructions}

"></available_artifacts>`;
    }

    const artifactsXml = artifacts
      .map((artifact) => this.generateArtifactXml(templates, artifact))
      .join('\n  ');

    return `<available_artifacts description="These are the artifacts available for you to use in generating responses.

${rules}

${creationInstructions}

">
  ${artifactsXml}
</available_artifacts>`;
  }

  private generateArtifactXml(templates: Map<string, string>, artifact: Artifact): string {
    const artifactTemplate = templates.get('artifact');
    if (!artifactTemplate) {
      throw new Error('Artifact template not loaded');
    }

    let artifactXml = artifactTemplate;

    // Extract summary data from artifact parts for context
    const summaryData =
      artifact.parts?.map((part: any) => part.data?.summary).filter(Boolean) || [];
    const artifactSummary =
      summaryData.length > 0 ? JSON.stringify(summaryData, null, 2) : 'No summary data available';

    // Replace artifact variables
    artifactXml = artifactXml.replace('{{ARTIFACT_NAME}}', artifact.name || '');
    artifactXml = artifactXml.replace('{{ARTIFACT_DESCRIPTION}}', artifact.description || '');
    artifactXml = artifactXml.replace('{{TASK_ID}}', artifact.taskId || '');
    artifactXml = artifactXml.replace('{{ARTIFACT_ID}}', artifact.artifactId || '');
    artifactXml = artifactXml.replace('{{TOOL_CALL_ID}}', artifact.toolCallId || 'unknown');
    artifactXml = artifactXml.replace('{{ARTIFACT_SUMMARY}}', artifactSummary);

    return artifactXml;
  }

  private generateToolsSection(templates: Map<string, string>, tools: ToolData[]): string {
    if (tools.length === 0) {
      return '<available_tools description="No tools are currently available"></available_tools>';
    }

    const toolsXml = tools.map((tool) => this.generateToolXml(templates, tool)).join('\n  ');
    return `<available_tools description="These are the tools available for you to use to accomplish tasks">
  ${toolsXml}
</available_tools>`;
  }

  private generateToolXml(templates: Map<string, string>, tool: ToolData): string {
    const toolTemplate = templates.get('tool');
    if (!toolTemplate) {
      throw new Error('Tool template not loaded');
    }

    let toolXml = toolTemplate;

    // Replace tool variables
    toolXml = toolXml.replace('{{TOOL_NAME}}', tool.name);
    toolXml = toolXml.replace(
      '{{TOOL_DESCRIPTION}}',
      tool.description || 'No description available'
    );
    toolXml = toolXml.replace(
      '{{TOOL_USAGE_GUIDELINES}}',
      tool.usageGuidelines || 'Use this tool when appropriate.'
    );

    // Convert parameters to XML format
    const parametersXml = this.generateParametersXml(tool.inputSchema);
    toolXml = toolXml.replace('{{TOOL_PARAMETERS_SCHEMA}}', parametersXml);

    return toolXml;
  }

  // Data component methods removed - handled by Phase2Config

  private generateParametersXml(inputSchema: Record<string, unknown> | null | undefined): string {
    if (!inputSchema) {
      return '<type>object</type>\n      <properties>\n      </properties>\n      <required>[]</required>';
    }

    const schemaType = (inputSchema.type as string) || 'object';
    const properties = (inputSchema.properties as Record<string, any>) || {};
    const required = (inputSchema.required as string[]) || [];

    // Convert JSON schema properties to XML representation
    const propertiesXml = Object.entries(properties)
      .map(([key, value]) => {
        const isRequired = required.includes(key);
        const propType = (value as any)?.type || 'string';
        const propDescription = (value as any)?.description || 'No description';
        return `        ${key}: {\n          "type": "${propType}",\n          "description": "${propDescription}",\n          "required": ${isRequired}\n        }`;
      })
      .join('\n');

    return `<type>${schemaType}</type>\n      <properties>\n${propertiesXml}\n      </properties>\n      <required>${JSON.stringify(required)}</required>`;
  }
}
