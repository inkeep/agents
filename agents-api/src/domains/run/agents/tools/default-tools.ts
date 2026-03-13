import { z } from '@hono/zod-openapi';
import { type Tool, type ToolSet, tool } from 'ai';
import { getLogger } from '../../../../logger';
import { formatOversizedRetrievalReason } from '../../artifacts/artifact-utils';
import { getModelAwareCompressionConfig } from '../../compression/BaseCompressor';
import { agentSessionManager } from '../../session/AgentSession';
import type { AgentRunContext } from '../agent-types';
import { wrapToolWithStreaming } from './tool-wrapper';

const logger = getLogger('Agent');

export function getArtifactTools(ctx: AgentRunContext): Tool<any, any> {
  return tool({
    description:
      'Retrieves the complete data of an existing artifact. NOTE: To pass an artifact as input to another tool, do NOT call this first — use { "$artifact": "id", "$tool": "toolCallId" } directly as the argument and the system resolves the full data automatically. summary_data in available_artifacts already contains all preview fields. Only call this when you need to read a non-preview field value in context. The result is a structured object — if you need to extract a specific field from it (e.g. to search or match text), extract that field before passing it to a text tool.',
    inputSchema: z.object({
      artifactId: z.string().describe('The unique identifier of the artifact to get.'),
      toolCallId: z.string().describe('The tool call ID associated with this artifact.'),
    }),
    execute: async ({ artifactId, toolCallId }) => {
      logger.info({ artifactId, toolCallId }, 'get_artifact_full executed');

      const streamRequestId = ctx.streamRequestId ?? '';
      const artifactService = agentSessionManager.getArtifactService(streamRequestId);

      if (!artifactService) {
        throw new Error(`ArtifactService not found for session ${streamRequestId}`);
      }

      const artifactData = await artifactService.getArtifactFull(artifactId, toolCallId);
      if (!artifactData) {
        throw new Error(`Artifact ${artifactId} with toolCallId ${toolCallId} not found`);
      }

      if (artifactData.metadata?.isOversized || artifactData.metadata?.retrievalBlocked) {
        logger.info(
          {
            artifactId,
            toolCallId,
            tokenSize: artifactData.metadata?.originalTokenSize,
            contextWindowSize: artifactData.metadata?.contextWindowSize,
          },
          'Blocked retrieval of oversized artifact'
        );

        return {
          artifactId: artifactData.artifactId,
          name: artifactData.name,
          description: artifactData.description,
          type: artifactData.type,
          status: 'retrieval_blocked',
          warning:
            '⚠️ This artifact contains an oversized tool result that cannot be retrieved to prevent context overflow.',
          reason: formatOversizedRetrievalReason(
            artifactData.metadata?.originalTokenSize || 0,
            artifactData.metadata?.contextWindowSize || 0
          ),
          toolInfo: {
            toolName: artifactData.metadata?.toolName,
            toolArgs: artifactData.metadata?.toolArgs,
            structureInfo: (artifactData.data as { _structureInfo?: unknown } | null | undefined)
              ?._structureInfo,
          },
          recommendation:
            'The tool arguments that caused this large result are included above. Consider: 1) Using more specific filters/queries with the original tool, 2) Asking the user to break down the request, 3) Processing the data differently.',
        };
      }

      return {
        artifactId: artifactData.artifactId,
        name: artifactData.name,
        description: artifactData.description,
        type: artifactData.type,
        data: artifactData.data,
      };
    },
  });
}

export function createLoadSkillTool(ctx: AgentRunContext): Tool<
  { name: string },
  {
    id: string;
    name: string;
    description: string;
    content: string;
  }
> {
  return tool({
    description:
      'Load an on-demand skill by name and return its full content so you can apply it in this conversation.',
    inputSchema: z.object({
      name: z.string().describe('The skill name from the on-demand skills list.'),
    }),
    execute: async ({ name }) => {
      const skill = ctx.config.skills?.find((item) => item.name === name);

      if (!skill) {
        throw new Error(`Skill ${name} not found`);
      }

      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        content: skill.content,
      };
    },
  });
}

export async function getDefaultTools(
  ctx: AgentRunContext,
  streamRequestId?: string
): Promise<ToolSet> {
  const defaultTools: ToolSet = {};

  const compressionConfig = getModelAwareCompressionConfig();
  if ((await agentHasArtifactComponents(ctx)) || compressionConfig.enabled) {
    defaultTools.get_reference_artifact = getArtifactTools(ctx);
  }

  const hasOnDemandSkills = ctx.config.skills?.some((skill) => !skill.alwaysLoaded);
  if (hasOnDemandSkills) {
    defaultTools.load_skill = wrapToolWithStreaming(
      ctx,
      'load_skill',
      createLoadSkillTool(ctx),
      streamRequestId,
      'tool'
    );
  }

  logger.info(
    { agentId: ctx.config.id, streamRequestId },
    'Adding compress_context tool to defaultTools'
  );
  defaultTools.compress_context = tool({
    description:
      'Manually compress the current conversation context to save space. Use when shifting topics, completing major tasks, or when context feels cluttered.',
    inputSchema: z.object({
      reason: z
        .string()
        .describe(
          'Why you are requesting compression (e.g., "shifting from research to coding", "completed analysis phase")'
        ),
    }),
    execute: async ({ reason }) => {
      logger.info(
        {
          agentId: ctx.config.id,
          streamRequestId,
          reason,
        },
        'Manual compression requested by LLM'
      );

      if (ctx.currentCompressor) {
        ctx.currentCompressor.requestManualCompression(reason);
      }

      return {
        status: 'compression_requested',
        reason,
        message:
          'Context compression will be applied on the next generation step. Previous work has been summarized and saved as artifacts.',
      };
    },
  });

  logger.info('getDefaultTools returning tools:', Object.keys(defaultTools).join(', '));
  return defaultTools;
}

export async function agentHasArtifactComponents(ctx: AgentRunContext): Promise<boolean> {
  try {
    const project = ctx.executionContext.project;
    const agent = project.agents[ctx.config.agentId];
    const subAgents = agent?.subAgents;
    if (!subAgents) {
      return false;
    }
    return Object.values(subAgents).some(
      (subAgent) => (subAgent.artifactComponents?.length ?? 0) > 0
    );
  } catch (error) {
    logger.error(
      { error, agentId: ctx.config.agentId },
      'Failed to check agent artifact components'
    );
    return false;
  }
}
