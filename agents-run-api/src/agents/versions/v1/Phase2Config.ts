import type { Artifact, ArtifactComponentApiInsert, ArtifactComponentApiSelect, DataComponentApiInsert } from '@inkeep/agents-core';
import { ArtifactCreateSchema } from '../../../utils/artifact-component-schema';
// Import template content as raw text
import artifactTemplate from '../../../../templates/v1/shared/artifact.xml?raw';
import artifactRetrievalGuidance from '../../../../templates/v1/shared/artifact-retrieval-guidance.xml?raw';
import systemPromptTemplate from '../../../../templates/v1/phase2/system-prompt.xml?raw';
import dataComponentsTemplate from '../../../../templates/v1/phase2/data-components.xml?raw';
import dataComponentTemplate from '../../../../templates/v1/phase2/data-component.xml?raw';

/**
 * Configuration for Phase 2 structured output generation
 * Handles data components, artifact creation, and JSON formatting guidance
 */
export class Phase2Config {
  
  private getArtifactCreationGuidance(): string {
    return `🚨 MANDATORY ARTIFACT CREATION 🚨
You MUST create artifacts from tool results to provide citations. This is REQUIRED, not optional.
Every piece of information from tools MUST be backed by an artifact creation.

CRITICAL CITATION REQUIREMENTS:
- Information FROM tool results = MUST create artifact citation
- Information BASED ON tool results = MUST create artifact citation
- Analysis OF tool results = MUST create artifact citation  
- Summaries OF tool results = MUST create artifact citation
- NO INFORMATION from tools can be presented without artifact citation

CRITICAL: ARTIFACTS MUST BE CREATED FIRST
You MUST create an artifact before you can reference it. You cannot reference artifacts that don't exist yet.

CRITICAL CITATION PRINCIPLE:
Creating an artifact IS a citation. Only reference again when citing the SAME artifact for a different statement.

CRITICAL: ALWAYS SELECT SINGLE ITEMS, NEVER ARRAYS

SELECTOR REQUIREMENTS:
- MUST select ONE specific item, never an array  
- Use compound filtering: result.items[?title=='API Guide' && type=='doc'] | [0]
- Navigate nested structures: result.structuredContent.content[?title=='Setup'] | [0]
- ALWAYS end with | [0] to select the first matching item
- NEVER chain multiple [?...][?...] filters - use && for compound conditions

❌ WRONG FILTER SYNTAX:
- result.content[?title=='Guide'][?type=='doc'][0]  // Multiple chained filters - INVALID JMESPath
- result.items[?name=='API'][?status=='active'][0]   // Chained filters - INVALID JMESPath

✅ CORRECT FILTER SYNTAX:
- result.content[?title=='Guide' && type=='doc'] | [0]     // Compound filter with pipe
- result.structuredContent.content[?title=='Inkeep' && record_type=='site'] | [0]  // Navigate + filter

HANDLING REPEATED KEYS:
When the same field names appear at different levels (like 'content', 'title', 'type'):
- Use the FULL PATH to the correct level: result.structuredContent.content[*] not result.content[*]
- Check structure hints for the exact path depth
- Use compound conditions to be more specific: [?title=='Inkeep' && record_type=='site']

CRITICAL: SELECTOR HIERARCHY
- base_selector: Points to ONE specific item in the tool result
- summary_props/full_props: Contain JMESPath selectors RELATIVE to the base selector
- Example: If base="result.documents[?type=='api']" then summary_props uses "title" not "documents[0].title"

❌ WRONG EXAMPLE:
{
  "base_selector": "result.content[?title=='Guide']",
  "summary_props": {
    "title": "Guide",  // ❌ This is a literal value, not a selector!
    "url": "result.content[?title=='Guide'].url"  // ❌ This is absolute, not relative!
  },
  "full_props": {
    "description": "A comprehensive guide",  // ❌ Literal value instead of selector!
    "content": "result.content[?title=='Guide'].content"  // ❌ Absolute path instead of relative!
  }
}

✅ CORRECT EXAMPLE:
{
  "base_selector": "result.content[?title=='Guide']",
  "summary_props": {
    "title": "title",  // ✅ Relative selector to get title field
    "url": "url"       // ✅ Relative selector to get url field
  },
  "full_props": {
    "description": "description",    // ✅ Relative selector
    "content": "content",            // ✅ Relative selector
    "metadata": "metadata.details"  // ✅ Relative selector with nesting
  }
}

COMMON FAILURE POINTS (AVOID THESE):
1. **Array Selection**: result.items (returns array) ❌
   → Fix: result.items[?type=='guide'] (returns single item) ✅

2. **Literal Values Instead of Selectors**: "title": "API Guide" ❌
   → Fix: "title": "title" (selector to extract title field) ✅

3. **Absolute Paths Instead of Relative**: "title": "result.items[0].title" ❌
   → Fix: "title": "title" (relative to base_selector) ✅

4. **Similar Key Names**: "title" vs "name" vs "heading"
   → Always check the actual field names in tool results

5. **Repeated Keys**: Multiple items with same "title" field
   → Use more specific filters: [?title=='Guide' && section=='setup']

6. **Case Sensitivity**: 'Guide' vs 'guide'
   → Match exact case from tool results

7. **Missing Nested Levels**: "content.text" when it's "body.content.text"
   → Include all intermediate levels`;
  }

  private getStructuredArtifactGuidance(
    hasArtifactComponents: boolean,
    artifactComponents?: Array<ArtifactComponentApiInsert | ArtifactComponentApiSelect>,
    shouldShowReferencingRules: boolean = true
  ): string {
    // If we shouldn't show referencing rules at all, return empty
    if (!shouldShowReferencingRules) {
      return '';
    }
    
    // Get the shared retrieval guidance
    const sharedGuidance = artifactRetrievalGuidance;
    
    // Scenario 1: Has data components AND can create artifacts
    if (hasArtifactComponents && artifactComponents && artifactComponents.length > 0) {
      return `${sharedGuidance}

ARTIFACT MANAGEMENT FOR STRUCTURED RESPONSES:

You will create and reference artifacts using data components in your JSON response.

CREATING ARTIFACTS (SERVES AS CITATION):
Use the appropriate ArtifactCreate_[Type] component to extract and structure data from tool results.
The creation itself serves as a citation - no additional reference needed.

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

REFERENCING ARTIFACTS (WHEN CITING AGAIN):
Only use the Artifact component when you need to cite the same artifact again for a different statement or context.

EXAMPLE STRUCTURED RESPONSE:
\`\`\`json
{
  "dataComponents": [
    {
      "id": "text1",
      "name": "Text",
      "props": {
        "text": "Found documentation about the authentication API."
      }
    },
    {
      "id": "create1",
      "name": "ArtifactCreate_APIDoc",
      "props": {
        "id": "auth-api-doc",
        "tool_call_id": "call_abc123",
        "type": "APIDoc",
        "base_selector": "result.documents[?type=='api']",
        "summary_props": {"title": "metadata.title", "endpoint": "api.endpoint"},
        "full_props": {"description": "content.description", "parameters": "spec.parameters", "examples": "examples.sample_code"}
      }
    },
    {
      "id": "text2",
      "name": "Text",
      "props": {
        "text": "The API requires OAuth 2.0 authentication. Later in this guide, we'll reference the same documentation again."
      }
    },
    {
      "id": "ref1",
      "name": "Artifact",
      "props": {
        "artifact_id": "auth-api-doc",
        "tool_call_id": "call_abc123"
      }
    }
  ]
}
\`\`\`

${this.getArtifactCreationGuidance()}

COMPONENT GUIDELINES:
- Each artifact type has its own ArtifactCreate_[Type] component
- ArtifactCreate components serve as both creation AND citation
- Only add Artifact reference components when citing the SAME artifact again for a different point
- Use tool_call_id exactly as it appears in tool execution results`;
    }
    
    // Scenario 2: Has data components but CANNOT create artifacts (can only reference)
    return `${sharedGuidance}

ARTIFACT REFERENCING FOR STRUCTURED RESPONSES:

You can reference existing artifacts but cannot create new ones.

HOW TO REFERENCE ARTIFACTS:
Use the Artifact component with artifact_id and tool_call_id from existing artifacts or delegation responses.

EXAMPLE STRUCTURED RESPONSE:
\`\`\`json
{
  "dataComponents": [
    {
      "id": "text1",
      "name": "Text",
      "props": {
        "text": "Based on the previously collected information about authentication."
      }
    },
    {
      "id": "ref1",
      "name": "Artifact",
      "props": {
        "artifact_id": "existing-auth-doc",
        "tool_call_id": "call_previous123"
      }
    },
    {
      "id": "text2",
      "name": "Text", 
      "props": {
        "text": "The API uses OAuth 2.0 for secure access."
      }
    }
  ]
}
\`\`\`

IMPORTANT GUIDELINES:
- You can only reference artifacts that already exist
- Use the Artifact component to reference them
- Copy artifact_id and tool_call_id exactly from existing artifacts
- Mix artifact references naturally throughout your response`;
  }

  private getArtifactCreationInstructions(
    hasArtifactComponents: boolean,
    artifactComponents?: Array<ArtifactComponentApiInsert | ArtifactComponentApiSelect>
  ): string {
    if (!hasArtifactComponents || !artifactComponents || artifactComponents.length === 0) {
      return '';
    }

    // For structured responses - show available component types
    const componentDescriptions = artifactComponents
      .map((ac) => {
        const summaryProps = ac.summaryProps?.properties
          ? Object.entries(ac.summaryProps.properties)
              .map(([key, value]: [string, any]) => `      - ${key}: ${value.description || 'Field from tool result'}`)
              .join('\n')
          : '      No properties defined';

        const fullProps = ac.fullProps?.properties
          ? Object.entries(ac.fullProps.properties)
              .map(([key, value]: [string, any]) => `      - ${key}: ${value.description || 'Field from tool result'}`)
              .join('\n')
          : '      No properties defined';

        return `  ArtifactCreate_${ac.name}:
    Description: ${ac.description || 'Extract and structure data'}
    Summary Properties:
${summaryProps}
    Full Properties:
${fullProps}`;
      })
      .join('\n\n');

    return `
AVAILABLE ARTIFACT TYPES:

${componentDescriptions}`;
  }

  private generateDataComponentsSection(dataComponents: DataComponentApiInsert[]): string {
    if (dataComponents.length === 0) {
      return '';
    }

    const dataComponentsDescription = dataComponents
      .map((dc) => `${dc.name}: ${dc.description}`)
      .join(', ');

    const dataComponentsXml = dataComponents
      .map((dataComponent) => this.generateDataComponentXml(dataComponent))
      .join('\n  ');

    let dataComponentsSection = dataComponentsTemplate;
    dataComponentsSection = dataComponentsSection.replace('{{DATA_COMPONENTS_LIST}}', dataComponentsDescription);
    dataComponentsSection = dataComponentsSection.replace('{{DATA_COMPONENTS_XML}}', dataComponentsXml);

    return dataComponentsSection;
  }

  private generateDataComponentXml(dataComponent: DataComponentApiInsert): string {
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

  private generateArtifactsSection(artifacts: Artifact[]): string {
    if (artifacts.length === 0) {
      return `<available_artifacts description="No artifacts are currently available.

${artifactRetrievalGuidance}

"></available_artifacts>`;
    }

    const artifactsXml = artifacts
      .map((artifact) => this.generateArtifactXml(artifact))
      .join('\n  ');

    return `<available_artifacts description="These are the artifacts available for you to reference in your structured response.

${artifactRetrievalGuidance}

">
  ${artifactsXml}
</available_artifacts>`;
  }

  private generateArtifactXml(artifact: Artifact): string {
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

  /**
   * Assemble the complete Phase 2 system prompt for structured output generation
   */
  assemblePhase2Prompt(config: {
    corePrompt: string;
    dataComponents: DataComponentApiInsert[];
    artifactComponents?: Array<ArtifactComponentApiInsert | ArtifactComponentApiSelect>;
    hasArtifactComponents: boolean;
    hasGraphArtifactComponents?: boolean;
    artifacts?: Artifact[];
  }): string {
    const { corePrompt, dataComponents, artifactComponents, hasArtifactComponents, hasGraphArtifactComponents, artifacts = [] } = config;

    // Include ArtifactCreate components in data components when artifacts are available
    let allDataComponents = [...dataComponents];
    if (hasArtifactComponents && artifactComponents) {
      const artifactCreateComponents = ArtifactCreateSchema.getDataComponents(
        'tenant', // placeholder - not used in Phase2
        '', // placeholder - not used in Phase2  
        artifactComponents
      );
      allDataComponents = [...dataComponents, ...artifactCreateComponents];
    }

    const dataComponentsSection = this.generateDataComponentsSection(allDataComponents);
    const artifactsSection = this.generateArtifactsSection(artifacts);
    const shouldShowReferencingRules = hasGraphArtifactComponents || artifacts.length > 0;
    const artifactGuidance = this.getStructuredArtifactGuidance(hasArtifactComponents, artifactComponents, shouldShowReferencingRules);
    const artifactTypes = this.getArtifactCreationInstructions(hasArtifactComponents, artifactComponents);

    let phase2Prompt = systemPromptTemplate;
    phase2Prompt = phase2Prompt.replace('{{CORE_INSTRUCTIONS}}', corePrompt);
    phase2Prompt = phase2Prompt.replace('{{DATA_COMPONENTS_SECTION}}', dataComponentsSection);
    phase2Prompt = phase2Prompt.replace('{{ARTIFACTS_SECTION}}', artifactsSection);
    phase2Prompt = phase2Prompt.replace('{{ARTIFACT_GUIDANCE_SECTION}}', artifactGuidance);
    phase2Prompt = phase2Prompt.replace('{{ARTIFACT_TYPES_SECTION}}', artifactTypes);

    return phase2Prompt;
  }
}