import type { Artifact } from '@inkeep/agents-core';
import {
  type AssembleResult,
  type BreakdownComponentDef,
  calculateBreakdownTotal,
  createEmptyBreakdown,
  estimateTokens,
  V1_BREAKDOWN_SCHEMA,
} from '@inkeep/agents-core';
import { convertZodToJsonSchema, isZodSchema } from '@inkeep/agents-core/utils/schema-conversion';

import systemPromptTemplate from '../../../../../../templates/v1/prompt/system-prompt.xml?raw';
import toolTemplate from '../../../../../../templates/v1/prompt/tool.xml?raw';
import artifactTemplate from '../../../../../../templates/v1/shared/artifact.xml?raw';
import artifactRetrievalGuidance from '../../../../../../templates/v1/shared/artifact-retrieval-guidance.md?raw';
import dataComponentTemplate from '../../../../../../templates/v1/shared/data-component.xml?raw';
import dataComponentsTemplate from '../../../../../../templates/v1/shared/data-components.xml?raw';

import { ArtifactCreateSchema } from '../../../artifacts/artifact-component-schema';
import { ARTIFACT_TAG, ARTIFACT_TOOL, SENTINEL_KEY } from '../../../constants/artifact-syntax';
import {
  buildSchemaShape,
  type ExtendedJsonSchema,
  extractFullFields,
  extractPreviewFields,
} from '../../../utils/schema-validation';
import type {
  McpServerGroupData,
  SkillData,
  SystemPromptV1,
  ToolData,
  VersionConfig,
} from '../../types';

// Re-export for Agent.ts
export { V1_BREAKDOWN_SCHEMA };

function substituteSentinelKeys(template: string): string {
  return template
    .replace(/\{\{SENTINEL_REFS\}\}/g, SENTINEL_KEY.REFS)
    .replace(/\{\{SENTINEL_ARTIFACT\}\}/g, SENTINEL_KEY.ARTIFACT)
    .replace(/\{\{SENTINEL_TOOL\}\}/g, SENTINEL_KEY.TOOL)
    .replace(/\{\{SENTINEL_SELECT\}\}/g, SENTINEL_KEY.SELECT);
}

export class PromptConfig implements VersionConfig<SystemPromptV1> {
  loadTemplates(): Map<string, string> {
    const templates = new Map<string, string>();

    templates.set('system-prompt', substituteSentinelKeys(systemPromptTemplate));
    templates.set('tool', toolTemplate);
    templates.set('artifact', substituteSentinelKeys(artifactTemplate));
    templates.set('artifact-retrieval-guidance', substituteSentinelKeys(artifactRetrievalGuidance));

    return templates;
  }

  getBreakdownSchema(): BreakdownComponentDef[] {
    return V1_BREAKDOWN_SCHEMA;
  }

  private normalizeSchema(inputSchema: any): Record<string, unknown> {
    if (!inputSchema || typeof inputSchema !== 'object') {
      return inputSchema || {};
    }

    if (isZodSchema(inputSchema)) {
      try {
        return convertZodToJsonSchema(inputSchema);
      } catch {
        return {};
      }
    }

    return inputSchema;
  }

  assemble(templates: Map<string, string>, config: SystemPromptV1): AssembleResult {
    const breakdown = createEmptyBreakdown(this.getBreakdownSchema());

    const systemPromptTemplateContent = templates.get('system-prompt');
    if (!systemPromptTemplateContent) {
      throw new Error('System prompt template not loaded');
    }

    // Track base template tokens (without placeholders - estimate overhead)
    breakdown.components.systemPromptTemplate = estimateTokens(
      systemPromptTemplateContent
        .replace('{{CORE_INSTRUCTIONS}}', '')
        .replace('{{CURRENT_TIME_SECTION}}', '')
        .replace('{{AGENT_CONTEXT_SECTION}}', '')
        .replace('{{APP_CONTEXT_SECTION}}', '')
        .replace('{{ARTIFACTS_SECTION}}', '')
        .replace('{{TOOLS_SECTION}}', '')
        .replace('{{TRANSFER_INSTRUCTIONS}}', '')
        .replace('{{DELEGATION_INSTRUCTIONS}}', '')
    );

    let systemPrompt = systemPromptTemplateContent;

    // Handle core instructions - omit entire section if empty
    if (config.corePrompt?.trim()) {
      breakdown.components.coreInstructions = estimateTokens(config.corePrompt);
      systemPrompt = systemPrompt.replace('{{CORE_INSTRUCTIONS}}', config.corePrompt);
    } else {
      // Remove the entire core_instructions section if empty
      systemPrompt = systemPrompt.replace(
        /<core_instructions>\s*\{\{CORE_INSTRUCTIONS\}\}\s*<\/core_instructions>/g,
        ''
      );
    }

    // Handle current time section - include user's current time in their timezone if available
    const currentTimeSection = this.generateCurrentTimeSection(config.clientCurrentTime);
    breakdown.components.currentTime = estimateTokens(currentTimeSection);
    systemPrompt = systemPrompt.replace('{{CURRENT_TIME_SECTION}}', currentTimeSection);

    const agentContextSection = this.generateAgentContextSection(config.prompt);
    breakdown.components.agentPrompt = estimateTokens(agentContextSection);
    const skillsSection = this.#generateSkillsSection(config.skills);
    const skillsGuidelines = skillsSection
      ? `
      - I operate using a set of skills that govern my behavior, reasoning, and tool usage.
      - Skills are mandatory and must be followed.
      - Some skills are always active; others are loaded on demand when relevant.
      - Applicable skills are used automatically and implicitly, without explanation.
      - Skills are applied in priority order, with core instructions overriding conflicts.
      - Always call \`load_skill\` with skill name before responding.`.trimStart()
      : '';

    const appContextSection = this.generateAppContextSection(config.appPrompt);
    breakdown.components.appPrompt = estimateTokens(appContextSection);

    systemPrompt = systemPrompt
      .replace('{{AGENT_CONTEXT_SECTION}}', agentContextSection)
      .replace('{{APP_CONTEXT_SECTION}}', appContextSection)
      .replace('{{SKILLS_SECTION}}', skillsSection)
      .replace('{{SKILLS_GUIDELINES}}', skillsGuidelines);

    const toolData = config.tools.map((tool) => ({
      ...tool,
      inputSchema: this.normalizeSchema(tool.inputSchema),
    }));

    const hasArtifactComponents = Boolean(
      config.artifactComponents && config.artifactComponents.length > 0
    );

    const artifactsSection = this.generateArtifactsSection(
      templates,
      config.artifacts,
      hasArtifactComponents,
      config.artifactComponents,
      config.hasAgentArtifactComponents,
      config.allProjectArtifactComponents
    );

    const artifactInstructionsTokens = this.getArtifactInstructionsTokens(
      templates,
      hasArtifactComponents,
      config.hasAgentArtifactComponents,
      (config.artifacts?.length ?? 0) > 0
    );
    breakdown.components.systemPromptTemplate += artifactInstructionsTokens;

    const actualArtifactsXml =
      config.artifacts?.length > 0
        ? config.artifacts
            .map((artifact) => this.generateArtifactXml(templates, artifact))
            .join('\n  ')
        : '';
    breakdown.components.artifactsSection = estimateTokens(actualArtifactsXml);

    if (hasArtifactComponents) {
      const creationInstructions = this.getArtifactCreationInstructions(
        hasArtifactComponents,
        config.artifactComponents
      );
      breakdown.components.artifactComponents = estimateTokens(creationInstructions);
    }

    systemPrompt = systemPrompt.replace('{{ARTIFACTS_SECTION}}', artifactsSection);

    const normalizedMcpServerGroups = config.mcpServerGroups?.map((group) => ({
      ...group,
      tools: group.tools.map((t) => ({
        ...t,
        inputSchema: this.normalizeSchema(t.inputSchema),
      })),
    }));
    const toolsSection = this.generateToolsSection(templates, toolData, normalizedMcpServerGroups);
    breakdown.components.toolsSection = estimateTokens(toolsSection);
    systemPrompt = systemPrompt.replace('{{TOOLS_SECTION}}', toolsSection);

    const dataComponentsSection = this.generateDataComponentsSection(
      config.dataComponents,
      config.includeDataComponents,
      hasArtifactComponents,
      config.artifactComponents
    );
    breakdown.components.dataComponentsSection = estimateTokens(dataComponentsSection);
    systemPrompt = systemPrompt.replace('{{DATA_COMPONENTS_SECTION}}', dataComponentsSection);

    const transferSection = this.generateTransferInstructions(config.hasTransferRelations);
    breakdown.components.transferInstructions = estimateTokens(transferSection);
    systemPrompt = systemPrompt.replace('{{TRANSFER_INSTRUCTIONS}}', transferSection);

    const delegationSection = this.generateDelegationInstructions(config.hasDelegateRelations);
    breakdown.components.delegationInstructions = estimateTokens(delegationSection);
    systemPrompt = systemPrompt.replace('{{DELEGATION_INSTRUCTIONS}}', delegationSection);

    // Calculate total
    calculateBreakdownTotal(breakdown);

    return {
      prompt: systemPrompt,
      breakdown,
    };
  }

  private generateAgentContextSection(prompt?: string): string {
    if (!prompt || prompt.trim() === '') {
      return '';
    }

    return `
  <agent_context>
    ${prompt}
  </agent_context>`;
  }

  private generateAppContextSection(appPrompt?: string): string {
    if (!appPrompt || appPrompt.trim() === '') {
      return '';
    }

    return `
  <app_context>
    ${appPrompt}
  </app_context>`;
  }

  private generateCurrentTimeSection(clientCurrentTime?: string): string {
    if (!clientCurrentTime || clientCurrentTime.trim() === '') {
      return '';
    }

    return `
  <current_time>
    The current time for the user is: ${clientCurrentTime}
    Use this to provide context-aware responses (e.g., greetings appropriate for their time of day, understanding business hours in their timezone, etc.)
    IMPORTANT: You simply know what time it is for the user - don't mention "the current time" or reference this section in your responses.
  </current_time>`;
  }

  #generateSkillsSection(skills: SkillData[] = []): string {
    const result = skills
      .sort((a, b) => a.index - b.index)
      .map((skill) => {
        const baseAttrs = `name=${JSON.stringify(skill.name)} description=${JSON.stringify(skill.description)}`;
        return skill.alwaysLoaded
          ? `<skill mode="always" ${baseAttrs}>${skill.content}</skill>`
          : `<skill mode="on_demand" ${baseAttrs} />`;
      })
      .join('\n    ');

    if (!result) {
      return '';
    }

    return `<skills>
    <instructions>
      - Each entry has mode="always" or mode="on_demand".
      - Always‑loaded skills apply immediately.
      - On‑demand skills are discoverable by name/description. Call load_skill with the skill name to load the full content and attached files only when needed.
      - Apply skills by index; later entries weigh more.
      - core_instructions override skill content on conflict.
    </instructions>
    ${result}
  </skills>`;
  }

  private generateTransferInstructions(hasTransferRelations?: boolean): string {
    if (!hasTransferRelations) {
      return '';
    }

    return `You are part of a single unified assistant composed of specialized agents. To the user, you must always appear as one continuous, confident voice.

🚨 CRITICAL TRANSFER PROTOCOL 🚨
When you determine another agent should handle a request:
1. IMMEDIATELY call the appropriate transfer_to_* tool  
2. Generate ZERO text in your response - no words, no explanations, no acknowledgments
3. Do NOT stream any content - the tool call must be your ONLY output

FORBIDDEN BEFORE TRANSFERS:
❌ Do NOT acknowledge the request ("I understand you want...")
❌ Do NOT provide partial answers ("The basics are..." then transfer) 
❌ Do NOT explain what you're doing ("Let me search...", "I'll help you find...")
❌ Do NOT apologize or announce transfers ("I'll need to transfer you...")
❌ Do NOT generate ANY text content whatsoever - just call the transfer tool

REMEMBER: Tool call = complete response. No additional text generation allowed.

CRITICAL: When you receive a user message that ends with "Please continue from where this conversation was left off" - this indicates you are continuing a conversation that another agent started. You should:
- Review the conversation history to see what was already communicated to the user
- Continue seamlessly from where the previous response left off
- Do NOT repeat what was already said in the conversation history
- Do NOT announce what you're about to do ("Let me search...", "I'll look for...", etc.)
- Proceed directly with the appropriate tool or action
- Act as if you have been handling the conversation from the beginning

When receiving any transfer, act as if you have been engaged from the start. Continue the same tone, context, and style. Never reference other agents, tools, or roles.

Your goal: preserve the illusion of a single, seamless, intelligent assistant. All user-facing behavior must feel like one continuous conversation, regardless of internal transfers.
`;
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

  private getArtifactInstructionsTokens(
    templates: Map<string, string>,
    hasArtifactComponents: boolean,
    hasAgentArtifactComponents?: boolean,
    hasArtifacts?: boolean
  ): number {
    const shouldShowReferencingRules = hasAgentArtifactComponents || hasArtifacts;

    const rules = this.getArtifactReferencingRules(
      hasArtifactComponents,
      templates,
      shouldShowReferencingRules
    );

    const wrapperDescription = hasArtifacts
      ? 'These are the artifacts available for you to use in generating responses.'
      : 'No artifacts are currently available, but you may create them during execution.';

    const wrapperXml = `<available_artifacts description="${wrapperDescription}

${rules}

"></available_artifacts>`;

    return estimateTokens(wrapperXml);
  }

  private getArtifactCreationGuidance(): string {
    return `🚨 MANDATORY ARTIFACT CREATION (${ARTIFACT_TAG.CREATE}) 🚨
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
- details_selector: Contains JMESPath selectors RELATIVE to the base selector
- Example: If base="result.documents[?type=='api']" then details_selector uses "title" not "documents[0].title"

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
    if (!shouldShowReferencingRules) {
      return '';
    }
    const sharedGuidance = templates?.get('artifact-retrieval-guidance') || '';

    if (hasArtifactComponents) {
      return `${sharedGuidance}

ARTIFACT MANAGEMENT:

Artifacts have three modes of use. Each surfaces a different amount of data:

SPECIAL CASE: binary_attachment artifacts
- User-uploaded files and tool-produced files may appear as artifacts of type "binary_attachment".
- Their preview usually includes metadata only (for example filename, mimeType, binaryType, source), not the file contents.
- Do not infer file contents from preview metadata alone.

1. CREATE — extract and save data from a tool result as a citable artifact:
   Format: <${ARTIFACT_TAG.CREATE} id="unique-id" tool="tool_call_id" type="TypeName" base="selector.path" details='{"key":"jmespath_selector"}' />
   ⚠️ Do not create artifacts from ${ARTIFACT_TOOL.GET_REFERENCE} results — only from original research tools.

2. REFERENCE IN TEXT — cite a saved artifact inline in your response:
   Format: <${ARTIFACT_TAG.REF} id="artifact-id" tool="tool_call_id" />
   ⚠️ PREVIEW FIELDS ONLY. Only the preview fields appear in your context — you cannot see full fields this way.
   If an artifact is a binary_attachment and you only have preview metadata, do not claim what the file contains beyond that metadata.
   If you need the actual contents, either pass the artifact to a capable tool or call ${ARTIFACT_TOOL.GET_REFERENCE}.

3. TOOL CHAIN TO A TOOL (PREFERRED) — the way data flows between tools:
   To pass an artifact to a parameter "<paramName>", set "<paramName>": null and add an entry in "${SENTINEL_KEY.REFS}":
     { "<paramName>": null, "${SENTINEL_KEY.REFS}": { "<paramName>": { "${SENTINEL_KEY.ARTIFACT}": "artifact-id", "${SENTINEL_KEY.TOOL}": "tool_call_id" } } }
   Add "${SENTINEL_KEY.SELECT}": "<jmespath>" inside the ref entry to filter to a specific field.
   The system resolves references before execution. Use this regardless of whether the data is visible in context — tool chaining is about data flow, not visibility.
   Use the exact artifactId and toolCallId from when the artifact was created.
   ⚠️ available_artifacts lists artifacts from PRIOR turns only. Artifacts you create during THIS response are equally valid — use the id and tool values from your own ${ARTIFACT_TAG.CREATE} tag.
   See AVAILABLE ARTIFACT TYPES for the exact preview vs full schema breakdown per type.
   ❌ Never copy tool output inline — always tool-chain.
   ❌ Do not use ${ARTIFACT_TOOL.GET_REFERENCE} to pass data to another tool — tool-chain instead.
   ❌ NEVER reconstruct or copy artifact data inline as a tool argument:
      { "artifactArg": { "field1": "...", "field2": "..." }, "param2": "value" }
   ✅ ALWAYS tool-chain the reference via "${SENTINEL_KEY.REFS}":
      { "artifactArg": null, "param2": "value", "${SENTINEL_KEY.REFS}": { "artifactArg": { "${SENTINEL_KEY.ARTIFACT}": "artifact-id", "${SENTINEL_KEY.TOOL}": "toolu_abc123" } } }

CREATING ARTIFACTS (${ARTIFACT_TAG.CREATE}) — JMESPATH SELECTOR RULES:

🚨 CRITICAL: DETAILS PROPS USE JMESPATH SELECTORS, NOT LITERAL VALUES! 🚨

❌ WRONG - Using literal values:
details='{"title":"API Documentation","type":"guide"}'

✅ CORRECT - Using JMESPath selectors (relative to base selector):
details='{"title":"metadata.title","doc_type":"document_type","description":"content.description","main_text":"content.text","author":"metadata.author"}'

The selectors extract actual field values from the data structure selected by your base selector.

THE details PROPERTY IN ${ARTIFACT_TAG.CREATE} MUST CONTAIN JMESPATH SELECTORS THAT EXTRACT DATA FROM THE TOOL RESULT!
- details: Contains JMESPath selectors relative to the base selector that map to artifact schema fields
- These selectors are evaluated against the tool result to extract the actual values
- The system automatically determines which fields are preview vs full based on the artifact schema
- NEVER put literal values like "Inkeep" or "2023" - always use selectors like "metadata.company" or "founded_year"

🚫 FORBIDDEN JMESPATH PATTERNS:
❌ NEVER: [?title~'.*text.*'] (regex patterns with ~ operator)
❌ NEVER: [?field~'pattern.*'] (any ~ operator usage)
❌ NEVER: [?title~'Slack.*Discord.*'] (regex wildcards)
❌ NEVER: [?name~'https://.*'] (regex in URL matching)
❌ NEVER: [?text ~ contains(@, 'word')] (~ with @ operator)
❌ NEVER: contains(@, 'text') (@ operator usage)
❌ NEVER: [?field=="value"] (double quotes in filters)
❌ NEVER: [?field=='value'] (escaped quotes in filters)
❌ NEVER: [?field=='"'"'value'"'"'] (nightmare quote mixing)
❌ NEVER: result.items[?type=='doc'][?status=='active'] (chained filters)

✅ CORRECT JMESPATH SYNTAX:
✅ [?contains(title, 'text')] (contains function)
✅ [?title=='exact match'] (exact string matching)
✅ [?contains(title, 'Slack') && contains(title, 'Discord')] (compound conditions)
✅ [?starts_with(url, 'https://')] (starts_with function)
✅ [?type=='doc' && status=='active'] (single filter with &&)
✅ [?contains(text, 'Founder')] (contains haystack, needle format)
✅ source.content[?contains(text, 'Founder')].text (correct filter usage)

🚨 MANDATORY QUOTE PATTERN — FOLLOW EXACTLY:
- ALWAYS: base="path[?field=='value']" (double quotes outside, single inside)
- This is the ONLY allowed pattern — any other pattern WILL FAIL
- NEVER escape quotes, NEVER mix quote types, NEVER use complex quoting

🚨 CRITICAL: EXAMINE TOOL RESULTS BEFORE CREATING SELECTORS (${ARTIFACT_TAG.CREATE})! 🚨

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

EXAMPLE TEXT RESPONSE:
"I found the authentication documentation. <${ARTIFACT_TAG.CREATE} id='auth-doc-1' tool='call_xyz789' type='APIDoc' base="result.documents[?type=='auth']" details='{"title":"metadata.title","endpoint":"api.endpoint","description":"content.description","parameters":"spec.parameters","examples":"examples.sample_code"}' /> The documentation explains OAuth 2.0 implementation in detail.

The process involves three main steps: registration, token exchange, and API calls. As mentioned in the authentication documentation <${ARTIFACT_TAG.REF} id='auth-doc-1' tool='call_xyz789' />, you'll need to register your application first."

${this.getArtifactCreationGuidance()}

ARTIFACT ANNOTATION PLACEMENT:
- ALWAYS place annotations AFTER complete sentences and punctuation
- Never interrupt the flow of a sentence with an annotation
- Complete your thought, add punctuation, then place the annotation
- This ensures professional, readable responses

IMPORTANT GUIDELINES:
- Create artifacts inline as you discuss the information
- Use exact tool_call_id from tool execution results
- Each ${ARTIFACT_TAG.CREATE} establishes a citable source
- Use ${ARTIFACT_TAG.REF} for subsequent references to the same artifact
- Annotations are automatically converted to interactive elements`;
    }

    if (!hasArtifactComponents) {
      return `${sharedGuidance}

ARTIFACT USAGE:

You cannot create artifacts, but you can use existing ones in two ways:

SPECIAL CASE: binary_attachment artifacts
- User-uploaded files and tool-produced files may appear as artifacts of type "binary_attachment".
- Their preview usually includes metadata only (for example filename, mimeType, binaryType, source), not the file contents.
- Do not infer file contents from preview metadata alone.

1. REFERENCE IN TEXT — cite a saved artifact inline in your response:
   Format: <${ARTIFACT_TAG.REF} id="artifact-id" tool="tool_call_id" />
   ⚠️ PREVIEW FIELDS ONLY. Only the preview fields appear in your context — you cannot see full fields this way.
   If an artifact is a binary_attachment and you only have preview metadata, do not claim what the file contains beyond that metadata.
   If you need the actual contents, either pass the artifact to a capable tool or call ${ARTIFACT_TOOL.GET_REFERENCE}.

2. TOOL CHAIN TO A TOOL (PREFERRED) — the way data flows between tools:
   To pass an artifact to a parameter "<paramName>", set "<paramName>": null and add an entry in "${SENTINEL_KEY.REFS}":
     { "<paramName>": null, "${SENTINEL_KEY.REFS}": { "<paramName>": { "${SENTINEL_KEY.ARTIFACT}": "artifact-id", "${SENTINEL_KEY.TOOL}": "tool_call_id" } } }
   Add "${SENTINEL_KEY.SELECT}": "<jmespath>" inside the ref entry to filter to a specific field.
   The system resolves references before execution. Use this regardless of whether the data is visible in context.
   Use the exact artifactId and toolCallId from when the artifact was created.
   ⚠️ available_artifacts lists artifacts from PRIOR turns only. Artifacts you just received in this conversation (e.g. from a delegation) are equally valid — use the id and tool values shown in the artifact reference.
   ❌ Never copy tool output inline — always tool-chain.
   ❌ Do not use ${ARTIFACT_TOOL.GET_REFERENCE} to pass data to another tool — tool-chain instead.
   ❌ NEVER reconstruct or copy artifact data inline as a tool argument:
      { "artifactArg": { "field1": "...", "field2": "..." }, "param2": "value" }
   ✅ ALWAYS tool-chain the reference via "${SENTINEL_KEY.REFS}":
      { "artifactArg": null, "param2": "value", "${SENTINEL_KEY.REFS}": { "artifactArg": { "${SENTINEL_KEY.ARTIFACT}": "artifact-id", "${SENTINEL_KEY.TOOL}": "toolu_abc123" } } }

EXAMPLE TEXT RESPONSE:
"Based on the authentication guide <${ARTIFACT_TAG.REF} id='existing-auth-guide' tool='call_previous456' /> that was previously collected, the API uses OAuth 2.0.

The implementation details show that you need to register your application first and obtain client credentials. <${ARTIFACT_TAG.REF} id='existing-impl-doc' tool='toolu_previous789' />

For error handling, you can refer to the comprehensive error documentation. <${ARTIFACT_TAG.REF} id='existing-error-doc' tool='call_previous012' /> This lists all possible authentication errors and their solutions."

EXAMPLE REFERENCING DELEGATION ARTIFACTS:
After receiving a delegation response with artifacts, reference them naturally:

"I've gathered the requested data for you. The analysis <${ARTIFACT_TAG.REF} id='analysis-results' tool='toolu_abc123' /> shows significant improvements across all metrics.

Looking at the detailed breakdown <${ARTIFACT_TAG.REF} id='performance-metrics' tool='toolu_def456' />, the processing time has decreased by 40% while maintaining accuracy."

IMPORTANT GUIDELINES:
- You can only reference artifacts that already exist or were returned from delegations
- Use ${ARTIFACT_TAG.REF} annotations in your text with the exact artifactId and toolCallId
- References are automatically converted to interactive elements`;
    }

    return '';
  }

  private getArtifactCreationInstructions(
    hasArtifactComponents: boolean,
    artifactComponents?: any[]
  ): string {
    if (!hasArtifactComponents || !artifactComponents || artifactComponents.length === 0) {
      return '';
    }

    const typeDescriptions = artifactComponents
      .map((ac) => {
        let schemaDescription = 'No schema defined';

        if (ac.props?.properties) {
          const previewSchema = extractPreviewFields(ac.props as ExtendedJsonSchema);
          const fullSchema = extractFullFields(ac.props as ExtendedJsonSchema);

          const previewShape = previewSchema.properties
            ? buildSchemaShape(previewSchema.properties)
            : {};
          const fullShape = fullSchema.properties ? buildSchemaShape(fullSchema.properties) : {};

          schemaDescription = `CAPTURED by ${ARTIFACT_TAG.CREATE} — include ALL of these in your details (both preview and non-preview):
    ${JSON.stringify(fullShape, null, 2)}

    DISPLAYED to user — ${ARTIFACT_TAG.REF} in text shows only preview fields:
    ${JSON.stringify(previewShape, null, 2)}

    TOOL CHAINING (PREFERRED) — set the target parameter to null and add "${SENTINEL_KEY.REFS}": { "<paramName>": { "${SENTINEL_KEY.ARTIFACT}": "...", "${SENTINEL_KEY.TOOL}": "..." } }. Add "${SENTINEL_KEY.SELECT}" inside the ref entry to filter. Always tool-chain when data flows to another tool, regardless of whether the value is already visible in context:
    ${JSON.stringify(fullShape, null, 2)}

    RETRIEVED explicitly (ONLY when you need to read the data yourself) — ${ARTIFACT_TOOL.GET_REFERENCE} tool returns all captured fields. Do not use ${ARTIFACT_TOOL.GET_REFERENCE} to pass data to another tool — tool-chain instead:
    ${JSON.stringify(fullShape, null, 2)}`;
        }

        return `  - "${ac.name}": ${ac.description || 'No description available'}
    ${schemaDescription}`;
      })
      .join('\n\n');

    return `
AVAILABLE ARTIFACT TYPES:

${typeDescriptions}

🚨 CRITICAL: DETAILS PROPS MUST MATCH THE ARTIFACT SCHEMA! 🚨
- Only use property names that are defined in the artifact component schema above
- Do NOT make up arbitrary property names like "founders", "nick_details", "year"  
- Each artifact type has specific fields defined in its schema
- Your JMESPath selectors must extract values for these exact schema-defined properties
- Example: If the schema defines fields "title" (preview), "summary" (preview), and "body" (non-preview), your details must include all three: details='{"title":"title","summary":"summary","body":"body"}' — never omit non-preview fields
- Include ALL schema fields in your details — both preview and non-preview. ${ARTIFACT_TAG.CREATE} captures everything.
- Do NOT only include preview fields. Non-preview fields are what tools and ${ARTIFACT_TOOL.GET_REFERENCE} receive.
- The preview/full split is automatic based on the schema — your job is to map every field.

🚨 CRITICAL: USE EXACT ARTIFACT TYPE NAMES IN QUOTES! 🚨
- MUST use the exact type name shown in quotes above
- Copy the exact string between the quotes, including any capitalization
- The type= parameter in ${ARTIFACT_TAG.CREATE} MUST match exactly what is listed above
- Do NOT abbreviate, modify, or guess the type name
- Copy the exact quoted name from the "AVAILABLE ARTIFACT TYPES" list above`;
  }

  private buildTypeSchemaMap(
    artifactComponents: any[]
  ): Record<string, { previewShape: Record<string, unknown>; fullShape: Record<string, unknown> }> {
    const map: Record<
      string,
      { previewShape: Record<string, unknown>; fullShape: Record<string, unknown> }
    > = {};
    for (const ac of artifactComponents) {
      if (!ac.name || !ac.props?.properties) continue;
      const previewSchema = extractPreviewFields(ac.props as ExtendedJsonSchema);
      const fullSchema = extractFullFields(ac.props as ExtendedJsonSchema);
      map[ac.name] = {
        previewShape: previewSchema.properties ? buildSchemaShape(previewSchema.properties) : {},
        fullShape: fullSchema.properties ? buildSchemaShape(fullSchema.properties) : {},
      };
    }
    return map;
  }

  private generateArtifactsSection(
    templates: Map<string, string>,
    artifacts: Artifact[],
    hasArtifactComponents: boolean = false,
    artifactComponents?: any[],
    hasAgentArtifactComponents?: boolean,
    allProjectArtifactComponents?: any[]
  ): string {
    const shouldShowReferencingRules = hasAgentArtifactComponents || artifacts.length > 0;
    const rules = this.getArtifactReferencingRules(
      hasArtifactComponents,
      templates,
      shouldShowReferencingRules
    );
    const creationInstructions = this.getArtifactCreationInstructions(
      hasArtifactComponents,
      artifactComponents
    );

    const typeSchemaMap = this.buildTypeSchemaMap(
      allProjectArtifactComponents ?? artifactComponents ?? []
    );

    if (artifacts.length === 0) {
      return `<available_artifacts description="No artifacts are currently available, but you may create them during execution.

${rules}

${creationInstructions}

"></available_artifacts>`;
    }

    const artifactsXml = artifacts
      .map((artifact) => this.generateArtifactXml(templates, artifact, typeSchemaMap))
      .join('\n  ');

    return `<available_artifacts description="These are the artifacts available for you to use in generating responses.

${rules}

${creationInstructions}

">
  ${artifactsXml}
</available_artifacts>`;
  }

  private generateArtifactXml(
    templates: Map<string, string>,
    artifact: Artifact,
    typeSchemaMap?: Record<
      string,
      { previewShape: Record<string, unknown>; fullShape: Record<string, unknown> }
    >
  ): string {
    const artifactTemplate = templates.get('artifact');
    if (!artifactTemplate) {
      throw new Error('Artifact template not loaded');
    }

    let artifactXml = artifactTemplate;

    const summaryData =
      artifact.parts?.map((part: any) => part.data?.summary).filter(Boolean) || [];
    const artifactSummary =
      summaryData.length > 0 ? JSON.stringify(summaryData, null, 2) : 'No summary data available';

    const artifactType = artifact.type || 'unknown';
    const schemas = typeSchemaMap?.[artifactType];
    const typeSchema = schemas
      ? `DISPLAYED to user via ${ARTIFACT_TAG.REF} (preview fields only): ${JSON.stringify(schemas.previewShape)}
    TOOL CHAINING (PREFERRED) — set target param to null + "${SENTINEL_KEY.REFS}": { "<paramName>": { "${SENTINEL_KEY.ARTIFACT}": "...", "${SENTINEL_KEY.TOOL}": "..." } } (add "${SENTINEL_KEY.SELECT}" inside to filter). Always tool-chain when data flows to another tool, even for values already visible in context: ${JSON.stringify(schemas.fullShape)}
    RETRIEVED via ${ARTIFACT_TOOL.GET_REFERENCE} (only when you need to read the data yourself — do not use get_reference_artifact to pass data to another tool, tool-chain instead): ${JSON.stringify(schemas.fullShape)}`
      : 'Schema not available';

    artifactXml = artifactXml.replace('{{ARTIFACT_NAME}}', artifact.name || '');
    artifactXml = artifactXml.replace('{{ARTIFACT_DESCRIPTION}}', artifact.description || '');
    artifactXml = artifactXml.replace('{{TASK_ID}}', artifact.taskId || '');
    artifactXml = artifactXml.replace('{{ARTIFACT_ID}}', artifact.artifactId || '');
    artifactXml = artifactXml.replace('{{TOOL_CALL_ID}}', artifact.toolCallId || 'unknown');
    artifactXml = artifactXml.replace('{{ARTIFACT_TYPE}}', artifactType);
    artifactXml = artifactXml.replace('{{ARTIFACT_TYPE_SCHEMA}}', typeSchema);
    artifactXml = artifactXml.replace('{{ARTIFACT_SUMMARY}}', artifactSummary);

    return artifactXml;
  }

  private getToolChainingGuidance(): string {
    return `TOOL CHAINING — MANDATORY FOR ALL DATA FLOW BETWEEN TOOLS:
When one tool's output feeds another tool, pass a REFERENCE instead of copying values inline.
Every tool's schema exposes a "${SENTINEL_KEY.REFS}" property for this — its value is a map of { "<paramName>": <referenceObject> }.

HOW IT WORKS (the shape is always the same):
  { "<paramA>": null, "<paramB>": "<literal value>", "${SENTINEL_KEY.REFS}": { "<paramA>": <referenceObject> } }

  1. Set the chained parameter (e.g. "<paramA>") to null at the top level.
  2. Add an entry under "${SENTINEL_KEY.REFS}" whose KEY is that same parameter name.
  3. The VALUE is the reference object (see REFERENCE TYPES below).
  4. The system resolves "${SENTINEL_KEY.REFS}" entries before execution and replaces the nulls with the resolved data.
  5. Parameters you are NOT chaining keep their literal values. Omit "${SENTINEL_KEY.REFS}" entirely when you aren't chaining anything.

REFERENCE TYPES — what goes inside a "${SENTINEL_KEY.REFS}" entry:

  1. TOOL REF — full output of a prior tool call:
     { "${SENTINEL_KEY.TOOL}": "<tool_call_id>" }

  2. TOOL REF + SELECT — specific field from a prior tool call:
     { "${SENTINEL_KEY.TOOL}": "<tool_call_id>", "${SENTINEL_KEY.SELECT}": "<JMESPath>" }
     Use when the parameter expects a primitive (string/number/boolean) or a subset of the data.

  3. ARTIFACT REF — a saved artifact (add ${SENTINEL_KEY.SELECT} to filter):
     { "${SENTINEL_KEY.ARTIFACT}": "<artifact_id>", "${SENTINEL_KEY.TOOL}": "<tool_call_id>" }

RULES:
  1. NEVER paste a prior tool's output as a literal value — always reference it via "${SENTINEL_KEY.REFS}".
  2. This applies even when the data is visible in your context — chaining is about correct data flow, not data visibility.
  3. Dependent tools MUST be called sequentially (not batched) — the source result must exist first.
  4. When a parameter expects a primitive but the source is a complex object, you MUST use "${SENTINEL_KEY.SELECT}" to drill down to the exact field.
  5. Find "${SENTINEL_KEY.SELECT}" paths in _structureHints.exampleSelectors (verified paths) or terminalPaths (every leaf field with its type).
  6. References only work for tool calls from the current response turn.

EXAMPLES (✅ correct vs ❌ wrong):

  ❌ tool_a returns "some text" → tool_b({ "input": "some text" })
  ✅ tool_b({ "input": null, "${SENTINEL_KEY.REFS}": { "input": { "${SENTINEL_KEY.TOOL}": "call_a" } } })

  ❌ tool_a returns { "data": { "name": "..." } } → tool_b({ "name": "..." })
  ✅ tool_b({ "name": null, "${SENTINEL_KEY.REFS}": { "name": { "${SENTINEL_KEY.TOOL}": "call_a", "${SENTINEL_KEY.SELECT}": "data.name" } } })

  ❌ search returns results → analyze({ "text": "<pasted content>" })
  ✅ analyze({ "text": null, "${SENTINEL_KEY.REFS}": { "text": { "${SENTINEL_KEY.TOOL}": "call_s", "${SENTINEL_KEY.SELECT}": "results[0].content" } } })

  ✅ Multiple chains + literal at once:
     fetch({ "url": null, "method": "GET", "${SENTINEL_KEY.REFS}": { "url": { "${SENTINEL_KEY.TOOL}": "call_s", "${SENTINEL_KEY.SELECT}": "items[0].url" } } })

  ✅ Artifact chain:
     summarize({ "doc": null, "${SENTINEL_KEY.REFS}": { "doc": { "${SENTINEL_KEY.ARTIFACT}": "art_42", "${SENTINEL_KEY.TOOL}": "call_x" } } })

PRIMITIVE RESULTS:
Tool results shown as { "text": "hello", "_toolCallId": "call_a" }, { "value": 42, "_toolCallId": "call_a" }, or { "result": true, "_toolCallId": "call_a" }
are display wrappers. A "${SENTINEL_KEY.TOOL}" ref resolves to the raw primitive (string/number/boolean), not the wrapper object.

${SENTINEL_KEY.SELECT} JMESPATH PATTERNS:
  "items[?score > \`0.8\`]"              — filter array
  "items[].{title: title, url: url}"    — project fields
  "data | length(@)"                    — aggregate
  "items[0]"                            — first element
  "data.results[0].content.text"        — extract nested string`;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private renderPropertyXml(name: string, prop: any, required: string[], indent: string): string {
    const type = prop?.type || 'string';
    const isRequired = required.includes(name);
    const desc = prop?.description?.trim();
    const descAttr = desc ? ` description="${this.escapeXml(desc)}"` : '';
    const requiredAttr = isRequired ? ' required="true"' : '';
    return `${indent}<property name="${name}" type="${type}"${requiredAttr}${descAttr} />`;
  }

  private generateMcpToolXml(tool: ToolData): string {
    const schema = tool.inputSchema as
      | {
          properties?: Record<string, { type?: string; description?: string }>;
          required?: string[];
        }
      | undefined;
    const properties = schema?.properties || {};
    const required: string[] = Array.isArray(schema?.required) ? schema.required : [];
    const propertyEntries = Object.entries(properties);

    const descriptionXml = tool.description?.trim()
      ? `\n    <description>${tool.description.trim()}</description>`
      : '';

    let parametersXml = '';
    if (propertyEntries.length > 0) {
      const propsXml = propertyEntries
        .map(([name, prop]) => this.renderPropertyXml(name, prop, required, '      '))
        .join('\n');
      parametersXml = `\n    <parameters>\n${propsXml}\n    </parameters>`;
    }

    return `<tool name="${tool.name}">${descriptionXml}${parametersXml}\n  </tool>`;
  }

  private generateMcpServerGroupXml(group: McpServerGroupData): string {
    const toolsXml = group.tools.map((tool) => this.generateMcpToolXml(tool)).join('\n  ');
    const instructionsSection = group.serverInstructions
      ? `\n  <instructions>${this.escapeXml(group.serverInstructions)}</instructions>`
      : '';
    return `<mcp_server name="${group.serverName}">${instructionsSection}
  ${toolsXml}
</mcp_server>`;
  }

  private generateToolsSection(
    templates: Map<string, string>,
    tools: ToolData[],
    mcpServerGroups?: McpServerGroupData[]
  ): string {
    const hasRegularTools = tools.length > 0;
    const hasMcpGroups = mcpServerGroups && mcpServerGroups.length > 0;

    if (!hasRegularTools && !hasMcpGroups) {
      return '<available_tools description="No tools are currently available"></available_tools>';
    }

    const regularToolsXml = tools.map((tool) => this.generateToolXml(templates, tool)).join('\n  ');
    const mcpGroupsXml = hasMcpGroups
      ? mcpServerGroups.map((group) => this.generateMcpServerGroupXml(group)).join('\n  ')
      : '';

    const parts = [regularToolsXml, mcpGroupsXml].filter(Boolean).join('\n  ');
    return `<available_tools description="These are the tools available for you to use to accomplish tasks.

${this.getToolChainingGuidance()}">
  ${parts}
</available_tools>`;
  }

  private generateToolXml(templates: Map<string, string>, tool: ToolData): string {
    const toolTemplate = templates.get('tool');
    if (!toolTemplate) {
      throw new Error('Tool template not loaded');
    }

    let toolXml = toolTemplate;

    toolXml = toolXml.replace('{{TOOL_NAME}}', tool.name);
    toolXml = toolXml.replace(
      '{{TOOL_DESCRIPTION}}',
      tool.description || 'No description available'
    );
    toolXml = toolXml.replace(
      '{{TOOL_USAGE_GUIDELINES}}',
      tool.usageGuidelines || 'Use this tool when appropriate.'
    );

    const parametersXml = this.generatePropertiesXml(tool.inputSchema);
    toolXml = toolXml.replace('{{TOOL_PARAMETERS_SCHEMA}}', parametersXml);

    return toolXml;
  }

  private generatePropertiesXml(inputSchema: Record<string, unknown> | null | undefined): string {
    if (!inputSchema) return '';

    const properties = (inputSchema.properties as Record<string, any>) || {};
    const required: string[] = Array.isArray(inputSchema.required)
      ? (inputSchema.required as string[])
      : [];
    const propertyEntries = Object.entries(properties);

    if (propertyEntries.length === 0) return '';

    const propsXml = propertyEntries
      .map(([name, prop]: [string, any]) => this.renderPropertyXml(name, prop, required, '    '))
      .join('\n');

    return `<parameters>\n${propsXml}\n  </parameters>`;
  }

  private generateDataComponentParametersXml(
    inputSchema: Record<string, unknown> | null | undefined
  ): string {
    if (!inputSchema) {
      return '<type>object</type>\n      <properties>\n      </properties>\n      <required>[]</required>';
    }

    const schemaType = (inputSchema.type as string) || 'object';
    const properties = (inputSchema.properties as Record<string, any>) || {};
    const required = (inputSchema.required as string[]) || [];

    const propertiesXml = Object.entries(properties)
      .map(([key, value]) => {
        const isRequired = required.includes(key);
        const propType = value?.type || 'string';
        const propDescription = value?.description || 'No description';

        return `        ${key}: {\n          "type": "${propType}",\n          "description": "${propDescription}",\n          "required": ${isRequired}\n        }`;
      })
      .join('\n');

    return `<type>${schemaType}</type>\n      <properties>\n${propertiesXml}\n      </properties>\n      <required>${JSON.stringify(required)}</required>`;
  }

  private generateDataComponentsSection(
    dataComponents: any[],
    includeDataComponents?: boolean,
    hasArtifactComponents?: boolean,
    artifactComponents?: any[]
  ): string {
    if (!includeDataComponents || dataComponents.length === 0) {
      return '';
    }

    // Include ArtifactCreate components in data components when artifacts are available
    let allDataComponents = [...dataComponents];
    if (hasArtifactComponents && artifactComponents) {
      const artifactCreateComponents = ArtifactCreateSchema.getDataComponents(
        'tenant', // placeholder - not used in PromptConfig
        '', // placeholder - not used in PromptConfig
        artifactComponents
      );
      allDataComponents = [...dataComponents, ...artifactCreateComponents];
    }

    const dataComponentsDescription = allDataComponents
      .map((dc) => `${dc.name}: ${dc.description}`)
      .join(', ');

    const dataComponentsXml = allDataComponents
      .map((dataComponent) => this.generateDataComponentXml(dataComponent))
      .join('\n  ');

    let dataComponentsSection = dataComponentsTemplate;
    dataComponentsSection = dataComponentsSection.replace(
      '{{DATA_COMPONENTS_LIST}}',
      dataComponentsDescription
    );
    dataComponentsSection = dataComponentsSection.replace(
      '{{DATA_COMPONENTS_XML}}',
      dataComponentsXml
    );

    return dataComponentsSection;
  }

  private generateDataComponentXml(dataComponent: any): string {
    let dataComponentXml = dataComponentTemplate;

    dataComponentXml = dataComponentXml.replace('{{COMPONENT_NAME}}', dataComponent.name);
    dataComponentXml = dataComponentXml.replace(
      '{{COMPONENT_DESCRIPTION}}',
      dataComponent.description || ''
    );
    dataComponentXml = dataComponentXml.replace(
      '{{COMPONENT_PROPS_SCHEMA}}',
      this.generateDataComponentParametersXml(dataComponent.props)
    );

    return dataComponentXml;
  }
}
