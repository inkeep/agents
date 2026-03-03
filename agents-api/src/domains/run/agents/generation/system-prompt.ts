import type { Artifact, ArtifactComponentApiInsert } from '@inkeep/agents-core';
import { TemplateEngine } from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import { getModelAwareCompressionConfig } from '../../compression/BaseCompressor';
import { createDefaultConversationHistoryConfig } from '../../data/conversations';
import type { AssembleResult } from '../../utils/token-estimator';
import type { AgentRunContext, AiSdkToolDefinition } from '../agent-types';
import { createLoadSkillTool } from '../tools/default-tools';
import { getFunctionTools } from '../tools/function-tools';
import { getMcpTools } from '../tools/mcp-tools';
import { getRelationTools } from '../tools/relation-tools';
import type { SystemPromptV1 } from '../types';

const logger = getLogger('Agent');

export async function getResolvedContext(
  ctx: AgentRunContext,
  conversationId: string,
  headers?: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  try {
    const project = ctx.executionContext.project;

    if (!ctx.config.contextConfigId) {
      logger.debug({ agentId: ctx.config.agentId }, 'No context config found for agent');
      return null;
    }

    const contextConfig = project.agents[ctx.config.agentId]?.contextConfig;

    if (!contextConfig) {
      logger.warn({ contextConfigId: ctx.config.contextConfigId }, 'Context config not found');
      return null;
    }

    const contextConfigWithScopes = {
      ...contextConfig,
      tenantId: ctx.config.tenantId,
      projectId: ctx.config.projectId,
      agentId: ctx.config.agentId,
      createdAt: contextConfig.createdAt || '',
      updatedAt: contextConfig.updatedAt || '',
    };

    if (!ctx.contextResolver) {
      throw new Error('Context resolver not found');
    }

    const result = await ctx.contextResolver.resolve(contextConfigWithScopes, {
      triggerEvent: 'invocation',
      conversationId,
      headers: headers || {},
      tenantId: ctx.config.tenantId,
    });

    const contextWithBuiltins = {
      ...result.resolvedContext,
      $env: process.env,
    };

    logger.debug(
      {
        conversationId,
        contextConfigId: contextConfig.id,
        resolvedKeys: Object.keys(contextWithBuiltins),
        cacheHits: result.cacheHits.length,
        cacheMisses: result.cacheMisses.length,
        fetchedDefinitions: result.fetchedDefinitions.length,
        errors: result.errors.length,
      },
      'Context resolved for agent'
    );

    return contextWithBuiltins;
  } catch (error) {
    logger.error(
      {
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to get resolved context'
    );
    return null;
  }
}

export async function getPrompt(ctx: AgentRunContext): Promise<string | undefined> {
  const project = ctx.executionContext.project;
  const agentDefinition = project.agents[ctx.config.agentId];
  try {
    return agentDefinition?.prompt || undefined;
  } catch (error) {
    logger.warn(
      {
        agentId: ctx.config.agentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to get agent prompt'
    );
    return undefined;
  }
}

export async function hasAgentArtifactComponents(ctx: AgentRunContext): Promise<boolean> {
  const project = ctx.executionContext.project;
  try {
    const agentDefinition = project.agents[ctx.config.agentId];
    if (!agentDefinition) {
      return false;
    }

    return Object.values(agentDefinition.subAgents).some(
      (subAgent) =>
        'artifactComponents' in subAgent &&
        subAgent.artifactComponents &&
        subAgent.artifactComponents.length > 0
    );
  } catch (error) {
    logger.warn(
      {
        agentId: ctx.config.agentId,
        tenantId: ctx.config.tenantId,
        projectId: ctx.config.projectId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to check agent artifact components, assuming none exist'
    );
    return ctx.artifactComponents.length > 0;
  }
}

export function collectProjectArtifactComponents(
  ctx: AgentRunContext
): ArtifactComponentApiInsert[] {
  const project = ctx.executionContext.project;
  try {
    const agentDefinition = project.agents[ctx.config.agentId];
    if (!agentDefinition) {
      return ctx.artifactComponents;
    }

    const seen = new Set<string>();
    const collected: ArtifactComponentApiInsert[] = [];

    const addUnique = (components: ArtifactComponentApiInsert[]) => {
      for (const ac of components) {
        if (ac.name && !seen.has(ac.name)) {
          seen.add(ac.name);
          collected.push(ac);
        }
      }
    };

    addUnique(ctx.artifactComponents);

    const projectArtifactComponents = project.artifactComponents || {};

    for (const subAgent of Object.values(agentDefinition.subAgents)) {
      if ('artifactComponents' in subAgent && subAgent.artifactComponents) {
        const resolved = (subAgent.artifactComponents as string[])
          .map((id) => projectArtifactComponents[id])
          .filter(Boolean) as ArtifactComponentApiInsert[];
        addUnique(resolved);
      }
    }

    return collected;
  } catch {
    return ctx.artifactComponents;
  }
}

export function getClientCurrentTime(ctx: AgentRunContext): string | undefined {
  const clientTimezone = ctx.config.forwardedHeaders?.['x-inkeep-client-timezone'];
  const clientTimestamp = ctx.config.forwardedHeaders?.['x-inkeep-client-timestamp'];

  if (!clientTimezone || !clientTimestamp) {
    return undefined;
  }

  try {
    const clientDate = new Date(clientTimestamp);
    return clientDate.toLocaleString('en-US', {
      timeZone: clientTimezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch (error) {
    logger.warn(
      { clientTimezone, clientTimestamp, error },
      'Failed to format time for client timezone'
    );
    return undefined;
  }
}

export async function buildSystemPrompt(
  ctx: AgentRunContext,
  runtimeContext?: {
    contextId: string;
    metadata: {
      conversationId: string;
      threadId: string;
      streamRequestId?: string;
      streamBaseUrl?: string;
    };
  },
  excludeDataComponents: boolean = false
): Promise<AssembleResult> {
  const conversationId = runtimeContext?.metadata?.conversationId || runtimeContext?.contextId;

  const resolvedContext = conversationId ? await getResolvedContext(ctx, conversationId) : null;

  let processedPrompt = ctx.config.prompt || '';
  if (resolvedContext && ctx.config.prompt) {
    try {
      processedPrompt = TemplateEngine.render(ctx.config.prompt, resolvedContext, {
        strict: false,
        preserveUnresolved: false,
      });
    } catch (error) {
      logger.error(
        {
          conversationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to process agent prompt with context, using original'
      );
      processedPrompt = ctx.config.prompt;
    }
  }

  const streamRequestId = runtimeContext?.metadata?.streamRequestId;
  const { tools: mcpTools, toolSets } = await getMcpTools(ctx, undefined, streamRequestId);
  const functionTools = await getFunctionTools(ctx, streamRequestId || '');
  const relationTools = getRelationTools(ctx, runtimeContext);
  const hasOnDemandSkills = ctx.config.skills?.some((skill) => !skill.alwaysLoaded);
  const skillTools = hasOnDemandSkills ? { load_skill: createLoadSkillTool(ctx) } : {};
  const allTools = { ...mcpTools, ...functionTools, ...relationTools, ...skillTools } as Record<
    string,
    AiSdkToolDefinition
  >;

  logger.info(
    {
      mcpTools: Object.keys(mcpTools),
      functionTools: Object.keys(functionTools),
      relationTools: Object.keys(relationTools),
      skillTools: Object.keys(skillTools),
      allTools: Object.keys(allTools),
      functionToolsDetails: Object.entries(functionTools).map(([name, tool]) => ({
        name,
        hasExecute: typeof tool.execute === 'function',
        hasDescription: !!tool.description,
        hasInputSchema: !!tool.inputSchema,
      })),
    },
    'Tools loaded for agent'
  );

  const mcpToolNames = new Set(Object.keys(mcpTools));

  const toolDefinitions = Object.entries(allTools)
    .filter(([name]) => !mcpToolNames.has(name))
    .map(([name, tool]) => ({
      name,
      description: tool.description || '',
      inputSchema: (tool.inputSchema ?? tool.parameters ?? {}) as Record<string, unknown>,
      usageGuidelines:
        name === 'load_skill'
          ? 'Use this tool to load the full content of an on-demand skill by name.'
          : name.startsWith('transfer_to_') || name.startsWith('delegate_to_')
            ? `Use this tool to ${name.startsWith('transfer_to_') ? 'transfer' : 'delegate'} to another agent when appropriate.`
            : 'Use this tool when appropriate for the task at hand.',
    }));

  const mcpServerGroups = toolSets.map((ts) => ({
    serverName: ts.mcpServerName,
    serverInstructions: ts.serverInstructions,
    tools: Object.entries(ts.tools as Record<string, AiSdkToolDefinition>).map(
      ([toolName, tool]) => ({
        name: toolName,
        description: tool.description || '',
        inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>,
      })
    ),
  }));

  const { getConversationScopedArtifacts } = await import('../../data/conversations');
  const historyConfig =
    ctx.config.conversationHistoryConfig ?? createDefaultConversationHistoryConfig();

  const referenceArtifacts: Artifact[] = await getConversationScopedArtifacts({
    tenantId: ctx.config.tenantId,
    projectId: ctx.config.projectId,
    conversationId: runtimeContext?.contextId || '',
    historyConfig,
    ref: ctx.executionContext.resolvedRef,
  });

  const componentDataComponents = excludeDataComponents ? [] : ctx.config.dataComponents || [];

  let prompt = await getPrompt(ctx);

  if (prompt && resolvedContext) {
    try {
      prompt = TemplateEngine.render(prompt, resolvedContext, {
        strict: false,
        preserveUnresolved: false,
      });
    } catch (error) {
      logger.error(
        {
          conversationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to process agent prompt with context, using original'
      );
    }
  }

  const shouldIncludeArtifactComponents = !excludeDataComponents;

  const compressionConfig = getModelAwareCompressionConfig();
  const agentHasArtifacts = (await hasAgentArtifactComponents(ctx)) || compressionConfig.enabled;

  const hasStructuredOutput = Boolean(
    ctx.config.dataComponents && ctx.config.dataComponents.length > 0
  );
  const includeDataComponents = hasStructuredOutput && !excludeDataComponents;

  logger.info(
    {
      agentId: ctx.config.id,
      hasStructuredOutput,
      excludeDataComponents,
      includeDataComponents,
      dataComponentsCount: ctx.config.dataComponents?.length || 0,
    },
    'System prompt configuration'
  );
  const clientCurrentTime = getClientCurrentTime(ctx);

  const config: SystemPromptV1 = {
    corePrompt: processedPrompt,
    prompt,
    skills: ctx.config.skills || [],
    tools: toolDefinitions,
    mcpServerGroups,
    dataComponents: componentDataComponents,
    artifacts: referenceArtifacts,
    artifactComponents: shouldIncludeArtifactComponents ? ctx.artifactComponents : [],
    allProjectArtifactComponents: collectProjectArtifactComponents(ctx),
    hasAgentArtifactComponents: agentHasArtifacts,
    hasTransferRelations: (ctx.config.transferRelations?.length ?? 0) > 0,
    hasDelegateRelations: (ctx.config.delegateRelations?.length ?? 0) > 0,
    includeDataComponents,
    clientCurrentTime,
  };
  return ctx.systemPromptBuilder.buildSystemPrompt(config);
}
