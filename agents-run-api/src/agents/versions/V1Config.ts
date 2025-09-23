import type { Artifact, DataComponentApiInsert, McpTool } from '@inkeep/agents-core';
// Import template content as raw text
import artifactTemplate from '../../../templates/v1/artifact.xml?raw';
import dataComponentTemplate from '../../../templates/v1/data-component.xml?raw';
import systemPromptTemplate from '../../../templates/v1/system-prompt.xml?raw';
import thinkingPreparationTemplate from '../../../templates/v1/thinking-preparation.xml?raw';
import toolTemplate from '../../../templates/v1/tool.xml?raw';

import type { SystemPromptV1, ToolData, VersionConfig } from '../types';

export class V1Config implements VersionConfig<SystemPromptV1> {
  loadTemplates(): Map<string, string> {
    const templates = new Map<string, string>();

    // Map template names to imported content
    templates.set('system-prompt', systemPromptTemplate);
    templates.set('tool', toolTemplate);
    templates.set('data-component', dataComponentTemplate);
    templates.set('artifact', artifactTemplate);
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
      : V1Config.convertMcpToolsToToolData(config.tools as McpTool[]);

    const hasDataComponents = config.dataComponents && config.dataComponents.length > 0;
    const hasArtifactComponents = config.artifactComponents && config.artifactComponents.length > 0;
    const artifactsSection = this.generateArtifactsSection(
      templates,
      config.artifacts,
      hasDataComponents,
      hasArtifactComponents,
      config.artifactComponents
    );
    systemPrompt = systemPrompt.replace('{{ARTIFACTS_SECTION}}', artifactsSection);

    const toolsSection = this.generateToolsSection(templates, toolData);
    systemPrompt = systemPrompt.replace('{{TOOLS_SECTION}}', toolsSection);

    const dataComponentsSection = this.generateDataComponentsSection(
      templates,
      config.dataComponents
    );
    systemPrompt = systemPrompt.replace('{{DATA_COMPONENTS_SECTION}}', dataComponentsSection);

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

    return '- A transfer entails you passing control of the conversation to another agent that may be better suited to handle the task at hand.';
  }

  private generateDelegationInstructions(hasDelegateRelations?: boolean): string {
    if (!hasDelegateRelations) {
      return '';
    }

    return '- A delegation means asking another agent to complete a specific task and return the result to you.';
  }

  private getArtifactReferencingRules(hasDataComponents: boolean = false): string {
    if (hasDataComponents) {
      return `CRITICAL ARTIFACT REFERENCING RULES - MUST ALWAYS FOLLOW:

***GROUNDING REQUIREMENT - ABSOLUTELY MANDATORY***:
- EVERY response MUST be GROUNDED in artifacts when information comes from sources
- ALWAYS try to reference artifacts - this is ESSENTIAL for credible, traceable responses  
- You can NEVER overuse artifact references but you can very easily underuse them
- Artifact references provide the foundation of trust and verifiability for all information

🚨 INDIVIDUAL ARTIFACT PRINCIPLE 🚨:
- Each artifact represents ONE SPECIFIC, IMPORTANT, and UNIQUE document or data item
- Reference artifacts individually by their specific relevance
- Multiple separate artifacts are better than one generic collection
- Think: "What specific document/item am I referencing here?"

FOR STRUCTURED DATA COMPONENT RESPONSES:

🚨 USE ARTIFACTCREATE AND ARTIFACT DATA COMPONENTS 🚨

1. Use ArtifactCreate components to create artifacts from tool results
2. Use Artifact components to reference the created artifacts  
3. MIX these components throughout your dataComponents array - NEVER group them at the end
4. PATTERN: Present information → ArtifactCreate → Artifact reference → Next information

EXAMPLE DATA COMPONENT RESPONSE:
\`\`\`json
{
  "dataComponents": [
    {
      "id": "summary1", 
      "name": "TextSummary", 
      "props": {
        "text": "Found the API documentation which provides authentication details."
      }
    },
    {
      "id": "create1",
      "name": "ArtifactCreate",
      "props": {
        "id": "api-doc-1",
        "tool_call_id": "call_xyz789",
        "type": "document",
        "base_selector": "result.data.data[0]",
        "summary_props": {"title": "name", "url": "link"},
        "full_props": {"title": "name", "url": "link", "content": "body.text"}
      }
    },
    {
      "id": "ref1",
      "name": "Artifact", 
      "props": {
        "artifact_id": "api-doc-1",
        "tool_call_id": "call_xyz789"
      }
    },
    {
      "id": "summary2",
      "name": "TextSummary",
      "props": {
        "text": "Also found the tutorial guide covering step-by-step implementation."
      }
    },
    {
      "id": "create2",
      "name": "ArtifactCreate",
      "props": {
        "id": "tutorial-1", 
        "tool_call_id": "toolu_abc123",
        "type": "document",
        "base_selector": "result.items[1]",
        "summary_props": {"title": "heading"}
      }
    },
    {
      "id": "ref2",
      "name": "Artifact",
      "props": {
        "artifact_id": "tutorial-1",
        "tool_call_id": "toolu_abc123"
      }
    }
  ]
}
\`\`\`

KEY PRINCIPLES:
- ArtifactCreate: Creates artifacts by extracting data from tool results using selectors
- Artifact: References the created artifacts for display
- NEVER make up tool_call_id - copy exactly from tool execution
- artifact_id must match between ArtifactCreate and Artifact components
- Mix creation and references throughout the response, not grouped at end

⚠️ CRITICAL: tool_call_id MUST be copied exactly from tool execution! ⚠️`;
    } else {
      return `CRITICAL ARTIFACT REFERENCING RULES - MUST ALWAYS FOLLOW:

***GROUNDING REQUIREMENT - ABSOLUTELY MANDATORY***:
- EVERY response MUST be GROUNDED in artifacts when information comes from sources
- ALWAYS try to reference artifacts - this is ESSENTIAL for credible, traceable responses
- You can NEVER overuse artifact references but you can very easily underuse them  
- Artifact references provide the foundation of trust and verifiability for all information

🚨 INDIVIDUAL ARTIFACT PRINCIPLE 🚨:
- Each artifact represents ONE SPECIFIC, IMPORTANT, and UNIQUE document or data item
- Reference artifacts individually by their specific relevance  
- Multiple separate artifacts are better than one generic collection
- Think: "What specific document/item am I referencing here?"

FOR PLAIN TEXT RESPONSES (when data components are NOT available):

🚨 CRITICAL: COPY EXACT IDs FROM TOOL OUTPUT 🚨

1. When referencing ANY artifact in flowing text, ALWAYS use this exact format: <artifact:ref id="{{artifact_id}}" tool="{{tool_call_id}}" />
2. **LOOK AT THE TOOL OUTPUT**: Find the tool execution result and copy the EXACT artifact_id and tool_call_id
3. **NEVER MAKE UP IDs**: Do not invent, guess, or modify the IDs - copy them EXACTLY as shown in tool results
4. NEVER reference artifacts by name or description alone - IDs are MANDATORY
5. This format is MANDATORY for text content, delegation messages, and all responses
6. These markers are automatically converted to interactive references
7. Reference individual, specific artifacts that directly support each piece of information

EXAMPLES WITH EXACT IDs FROM TOOL OUTPUT:
- Plain Text: "Based on the Nick Gomez profile <artifact:ref id="art_founder_abc123" tool="call_search_def456" /> you can..."
- Delegation: "Delegating to agent with founder information <artifact:ref id="art_profile_xyz789" tool="toolu_analysis_uvw012" />"

⚠️ WRONG IDs = BROKEN REFERENCES! Always copy from tool execution output! ⚠️`;
    }
  }

  private getArtifactCreationInstructions(hasArtifactComponents: boolean, artifactComponents?: any[]): string {
    if (!hasArtifactComponents || !artifactComponents) {
      return '';
    }

    const componentTypes = artifactComponents
      .map(ac => {
        const summaryPropsSchema = ac.summaryProps?.properties 
          ? Object.keys(ac.summaryProps.properties).join(', ')
          : 'No summary props defined';
        const fullPropsSchema = ac.fullProps?.properties 
          ? Object.keys(ac.fullProps.properties).join(', ')
          : 'No full props defined';
        
        return `- ${ac.name}: ${ac.description || 'No description available'}
  Summary Props: ${summaryPropsSchema}
  Full Props: ${fullPropsSchema}`;
      })
      .join('\n');

    return `🚨 ARTIFACT CREATION INSTRUCTIONS 🚨

When you use tools that return structured data, create artifacts as CITATIONS to support your answers:

🎯 CITATION PATTERN - CRITICAL:
1. FIRST: Provide your answer/content
2. THEN: Create artifact as supporting citation

✅ CORRECT EXAMPLES:

Example 1 - Simple document (OpenAI format):
"The API documentation explains authentication. <artifact:create id='api-doc-1' tool='call_xyz789' type='document' base='result.data.data[0]' summary='{\"title\":\"name\", \"url\":\"link\"}' full='{\"title\":\"name\", \"url\":\"link\", \"content\":\"body.text\"}' />"

Example 2 - Nested content structure (Anthropic format):
"Found the user guide. <artifact:create id='guide-1' tool='toolu_abc123' type='document' base='result.structuredContent.content[2]' summary='{\"title\":\"title\", \"url\":\"url\"}' full='{\"title\":\"title\", \"url\":\"url\", \"content\":\"source.content[0].text\"}' />"

Example 3 - Multiple artifacts (Mixed formats):
"There are two key resources: the setup guide <artifact:create id='setup-1' tool='call_def456' type='document' base='result.items[0]' summary='{\"title\":\"heading\", \"url\":\"permalink\"}' /> and the FAQ <artifact:create id='faq-1' tool='toolu_ghi789' type='document' base='result.items[1]' summary='{\"title\":\"heading\", \"url\":\"permalink\"}' />."

❌ WRONG EXAMPLES:

Wrong 1 - Artifact before content:
"<artifact:create ...> The company has 50 employees." 
(Should be: "The company has 50 employees. <artifact:create ...>")

Wrong 2 - Using literal field names as values:
"Details here. <artifact:create ... summary='{\"title\":\"title\", \"url\":\"url\"}' />"
(If the actual field is 'name', use: summary='{\"title\":\"name\", \"url\":\"link\"}')

Wrong 3 - Missing nested levels:
"Found docs. <artifact:create ... base='result.content[0]' />"
(If structure is result.structuredContent.content, use: base='result.structuredContent.content[0]')

🔄 REFERENCE PATTERN:
- FIRST use of data: Create artifact with <artifact:create>
- SUBSEQUENT references: Use <artifact:ref id="same-id" tool="same-tool-call-id" />
- NEVER create the same artifact twice

When you use tools that return structured data, create artifacts using this annotation syntax:

<artifact:create 
  id="unique-artifact-id" 
  tool="exact-tool-call-id" 
  type="artifact-type" 
  base="result.path.to.data[?filter]" 
  summary='{"propName": "actualFieldPath", "url": "urlField"}'
  full='{"propName": "actualFieldPath", "url": "urlField", "content": "contentField"}' />

🔧 TOOL CALL ID FORMATS (Provider Agnostic):
- OpenAI format: call_abc123, call_xyz789, call_def456
- Anthropic format: toolu_abc123, toolu_xyz789, toolu_def456
- ALWAYS copy the EXACT tool call ID from the tool execution

🚨 CRITICAL SELECTOR RULES WITH REAL EXAMPLES 🚨:

**EXAMPLE TOOL RESULT STRUCTURE:**
\`\`\`json
{
  "result": {
    "data": {
      "data": [
        {
          "name": "API Guide",
          "content": {
            "content": {
              "text": "How to use our API..."
            }
          }
        },
        {
          "name": "Tutorial",
          "content": {
            "content": {
              "text": "Step-by-step guide..."
            }
          }
        }
      ]
    }
  }
}
\`\`\`

1. **BASE SELECTOR EXAMPLES WITH OUTCOMES**:
   
   ✅ **CORRECT**: \`base="result.data.data[0]"\`
   Returns: \`{"name": "API Guide", "content": {"content": {"text": "How to use our API..."}}}\`
   
   ❌ **WRONG**: \`base="result.data[0]"\` 
   Returns: \`null\` (because result.data is an object, not an array!)
   
   ❌ **WRONG**: \`base="result.data.data"\`
   Returns: \`[array]\` (returns entire array, not a specific item - props will fail!)

2. **PROP SELECTOR EXAMPLES WITH OUTCOMES**:
   
   Given \`base="result.data.data[0]"\` which returns the API Guide object:
   
   ✅ **CORRECT**: \`summary='{"title": "name", "body": "content.content.text"}'\`
   Extracts: \`{"title": "API Guide", "body": "How to use our API..."}\`
   
   ❌ **WRONG**: \`summary='{"title": "title", "body": "text"}'\`
   Extracts: \`{"title": null, "body": null}\` (fields don't exist at that level!)
   
   ❌ **WRONG**: \`summary='{"body": "content.text"}'\`
   Extracts: \`{"body": null}\` (skipped middle 'content' level!)

**KEY DEBUGGING TIP**: 
If your selector returns \`null\`, check:
1. Are you including ALL nested levels?
2. Are field names exactly correct (not "title" when it's "name")?
3. Does your base point to ONE item, not an array?

⚡ CRITICAL: JSON-like text content in tool results is AUTOMATICALLY PARSED into proper JSON objects - treat all data as structured, not text strings.
🚨 CRITICAL: Data structures are deeply nested. When your path fails, READ THE ERROR MESSAGE - it shows the correct path!

AVAILABLE ARTIFACT TYPES:
${componentTypes}

🚨 FUNDAMENTAL RULE: ONE ARTIFACT = ONE SEPARATE DATA COMPONENT 🚨

Each artifact becomes a SEPARATE DATA COMPONENT in the structured response:
✅ A SINGLE, SPECIFIC document (e.g., one specific API endpoint, one specific person's profile, one specific error)
✅ IMPORTANT and directly relevant to the user's question  
✅ UNIQUE with distinct value from other artifacts
✅ RENDERED AS INDIVIDUAL DATA COMPONENT in the UI

USAGE PATTERN:
1. base: Navigate through nested structures to target ONE SPECIFIC item
   - Navigate through all necessary levels: "result.data.items.nested[?condition]"
   - Handle nested structures properly: "result.content.content[?field1=='value']" is fine if that's the structure
   - Use [?condition] filtering to get exactly the item you want
   - Example: "result.items[?field_a=='target_value' && field_b=='specific_type']"
   - NOT: "result.items[*]" (too broad, gets everything)

2. summary/full props: Extract properties relative to your selected item
   - 🎯 CRITICAL: Always relative to the single item that base selector returns
   - If base ends at a document → props access document fields
   - If base ends at content[0] → props access content[0] fields
   - Simple paths from that exact level: {"prop1": "field_x", "prop2": "nested.field_y"}
   - ❌ DON'T try to go back up or deeper - adjust your base selector instead!

3. Result: ONE artifact representing ONE important, unique item → ONE data component

💡 HANDLING NESTED STRUCTURES:
- Navigate as deep as needed: "result.data.items.content.documents[?condition]" is fine
- Focus on getting to the right level with base, then keep prop selectors simple
- Test your base selector: Does it return exactly the items you want?

REQUIRED ATTRIBUTES:
- id: Generate unique, descriptive ID (e.g., "doc-search-results-123")
- tool: EXACT tool call ID from the tool result you're processing (call_xyz789 or toolu_abc123)
- type: Must match one of the available artifact types above
- base: JMESPath selector starting with "result." to navigate to main data
- summary: JSON object mapping summary properties to JMESPath selectors
- full: JSON object mapping full properties to JMESPath selectors`;
  }

  private generateArtifactsSection(
    templates: Map<string, string>,
    artifacts: Artifact[],
    hasDataComponents: boolean = false,
    hasArtifactComponents: boolean = false,
    artifactComponents?: any[]
  ): string {
    const rules = this.getArtifactReferencingRules(hasDataComponents);
    const creationInstructions = this.getArtifactCreationInstructions(hasArtifactComponents, artifactComponents);

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

  private generateDataComponentsSection(
    templates: Map<string, string>,
    dataComponents: DataComponentApiInsert[]
  ): string {
    if (dataComponents.length === 0) {
      return '';
    }

    const dataComponentsXml = dataComponents
      .map((dataComponent) => this.generateDataComponentXml(templates, dataComponent))
      .join('\n  ');
    return `<available_data_components description="These are the data components available for you to use in generating responses. Each component represents a single structured piece of information. You can create multiple instances of the same component type when needed.

***MANDATORY JSON RESPONSE FORMAT - ABSOLUTELY CRITICAL***:
- WHEN DATA COMPONENTS ARE AVAILABLE, YOU MUST RESPOND IN JSON FORMAT ONLY
- DO NOT respond with plain text when data components are defined
- YOUR RESPONSE MUST BE STRUCTURED JSON WITH dataComponents ARRAY
- THIS IS NON-NEGOTIABLE - JSON FORMAT IS REQUIRED

CRITICAL JSON FORMATTING RULES - MUST FOLLOW EXACTLY:
1. Each data component must include id, name, and props fields
2. The id and name should match the exact component definition
3. The props field contains the actual component data using exact property names from the schema
4. NEVER omit the id and name fields

CORRECT: [{\"id\": \"component1\", \"name\": \"Component1\", \"props\": {\"field1\": \"value1\", \"field2\": \"value2\"}}, {\"id\": \"component2\", \"name\": \"Component2\", \"props\": {\"field3\": \"value3\"}}]
WRONG: [{\"field1\": \"value1\", \"field2\": \"value2\"}, {\"field3\": \"value3\"}]

">
  ${dataComponentsXml}
</available_data_components>`;
  }

  private generateDataComponentXml(
    templates: Map<string, string>,
    dataComponent: DataComponentApiInsert
  ): string {
    const dataComponentTemplate = templates.get('data-component');
    if (!dataComponentTemplate) {
      throw new Error('Data component template not loaded');
    }

    let dataComponentXml = dataComponentTemplate;

    // Replace data component variables
    dataComponentXml = dataComponentXml.replace('{{COMPONENT_NAME}}', dataComponent.name);
    dataComponentXml = dataComponentXml.replace(
      '{{COMPONENT_DESCRIPTION}}',
      dataComponent.description
    );
    dataComponentXml = dataComponentXml.replace(
      '{{COMPONENT_PROPS_SCHEMA}}',
      this.generateParametersXml(dataComponent.props)
    );

    return dataComponentXml;
  }

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
