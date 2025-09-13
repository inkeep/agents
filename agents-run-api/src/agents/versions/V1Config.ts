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
    const artifactsSection = this.generateArtifactsSection(
      templates,
      config.artifacts,
      hasDataComponents
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

🚨 CRITICAL: COPY EXACT IDs FROM TOOL OUTPUT 🚨

1. MIX Artifact components throughout your dataComponents array - NEVER group them at the end
2. PATTERN: Present information → Immediately follow with supporting Artifact → Next information → Next Artifact
3. **LOOK AT THE TOOL OUTPUT**: Find the save_tool_result output and copy the EXACT artifact_id and task_id
4. **NEVER MAKE UP IDs**: Do not invent, guess, or modify the IDs - copy them EXACTLY as shown in tool results
5. ALL artifact references MUST use exact artifact_id and task_id - NEVER reference by name or description
6. Use Artifact components liberally and frequently - INTERSPERSE them after EVERY claim or fact from sources
7. Reference individual, specific artifacts that directly support each adjacent piece of information

MANDATORY FORMAT WITH EXACT IDs FROM TOOL OUTPUT:
- Data Component: {"artifact_id": "art_founder_abc123", "task_id": "task_search_def456"}
- NEVER: {"artifact_name": "some name"} or {"description": "some description"}
- NEVER: {"artifact_id": "made_up_id"} - ALWAYS copy from tool output

⚠️ WRONG IDs = BROKEN REFERENCES! Always copy from save_tool_result output! ⚠️`;
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

1. When referencing ANY artifact in flowing text, ALWAYS use this exact format: <artifact:ref id="{{artifact_id}}" task="{{task_id}}" />
2. **LOOK AT THE TOOL OUTPUT**: Find the save_tool_result output and copy the EXACT artifact_id and task_id
3. **NEVER MAKE UP IDs**: Do not invent, guess, or modify the IDs - copy them EXACTLY as shown in tool results
4. NEVER reference artifacts by name or description alone - IDs are MANDATORY
5. This format is MANDATORY for text content, delegation messages, and all responses
6. These markers are automatically converted to interactive references
7. Reference individual, specific artifacts that directly support each piece of information

EXAMPLES WITH EXACT IDs FROM TOOL OUTPUT:
- Plain Text: "Based on the Nick Gomez profile <artifact:ref id="art_founder_abc123" task="task_search_def456" /> you can..."
- Delegation: "Delegating to agent with founder information <artifact:ref id="art_profile_xyz789" task="task_analysis_uvw012" />"

⚠️ WRONG IDs = BROKEN REFERENCES! Always copy from save_tool_result output! ⚠️`;
    }
  }

  private generateArtifactsSection(
    templates: Map<string, string>,
    artifacts: Artifact[],
    hasDataComponents: boolean = false
  ): string {
    const rules = this.getArtifactReferencingRules(hasDataComponents);

    if (artifacts.length === 0) {
      return `<available_artifacts description="No artifacts are currently available, but you may create them during execution.

${rules}

"></available_artifacts>`;
    }

    const artifactsXml = artifacts
      .map((artifact) => this.generateArtifactXml(templates, artifact))
      .join('\n  ');

    return `<available_artifacts description="These are the artifacts available for you to use in generating responses.

${rules}

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
