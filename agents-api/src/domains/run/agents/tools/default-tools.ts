import { z } from '@hono/zod-openapi';
import { LOAD_SKILL_TOOL } from '@inkeep/agents-core';
import { type Tool, type ToolSet, tool } from 'ai';
import { getLogger } from '../../../../logger';
import type { ArtifactFullData } from '../../artifacts/ArtifactService';
import { formatOversizedRetrievalReason } from '../../artifacts/artifact-utils';
import { getModelAwareCompressionConfig } from '../../compression/BaseCompressor';
import { SENTINEL_KEY } from '../../constants/artifact-syntax';
import { fromBlobUri, getBlobStorageProvider, isBlobUri } from '../../services/blob-storage';
import { agentSessionManager } from '../../session/AgentSession';
import type { AgentRunContext } from '../agent-types';
import { wrapToolWithStreaming } from './tool-wrapper';

const logger = getLogger('Agent');

type BlobBackedArtifactData = {
  blobUri: string;
  mimeType?: string;
  binaryType?: string;
};

function isBlobBackedArtifactData(value: unknown): value is BlobBackedArtifactData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.blobUri === 'string' && isBlobUri(record.blobUri);
}

async function makeHydratedReferenceArtifactResult(artifactData: ArtifactFullData) {
  const metadataContent = {
    artifactId: artifactData.artifactId,
    name: artifactData.name,
    description: artifactData.description,
    type: artifactData.type,
    mimeType: isBlobBackedArtifactData(artifactData.data) ? artifactData.data.mimeType : undefined,
    binaryType: isBlobBackedArtifactData(artifactData.data)
      ? artifactData.data.binaryType
      : undefined,
  };

  if (!isBlobBackedArtifactData(artifactData.data)) {
    return {
      artifactId: artifactData.artifactId,
      name: artifactData.name,
      description: artifactData.description,
      type: artifactData.type,
      data: artifactData.data,
      content: [
        {
          type: 'text',
          text: JSON.stringify(metadataContent),
        },
      ],
    };
  }

  const storage = getBlobStorageProvider();
  try {
    const blob = await storage.download(fromBlobUri(artifactData.data.blobUri));
    const mimeType = artifactData.data.mimeType || blob.contentType || 'application/octet-stream';
    const filename = artifactData.data.blobUri.split('/').at(-1);

    return {
      artifactId: artifactData.artifactId,
      name: artifactData.name,
      description: artifactData.description,
      type: artifactData.type,
      data: artifactData.data,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ...metadataContent,
            mimeType,
          }),
        },
        {
          type: 'file',
          data: Buffer.from(blob.data).toString('base64'),
          mimeType,
          ...(filename ? { filename } : {}),
        },
      ],
    };
  } catch (error) {
    logger.warn(
      {
        artifactId: artifactData.artifactId,
        type: artifactData.type,
        blobUri: artifactData.data.blobUri,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to hydrate blob-backed artifact, returning metadata only'
    );

    return {
      artifactId: artifactData.artifactId,
      name: artifactData.name,
      description: artifactData.description,
      type: artifactData.type,
      data: artifactData.data,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ...metadataContent,
            hydrationStatus: 'metadata_only',
          }),
        },
      ],
    };
  }
}

export function getArtifactTools(ctx: AgentRunContext): Tool<any, any> {
  return tool({
    description: `Retrieves the complete data of an existing artifact. Do not use get_reference_artifact to pass data to another tool — tool-chain instead: { "${SENTINEL_KEY.ARTIFACT}": "id", "${SENTINEL_KEY.TOOL}": "toolCallId" } or { "${SENTINEL_KEY.TOOL}": "toolCallId", "${SENTINEL_KEY.SELECT}": "..." }. summary_data in available_artifacts already contains all preview fields. Only call this when you specifically need the actual value of a non-preview field that is not visible in summary_data, or to inspect a binary artifact yourself (images may provide visual input, other files may provide file input).`,
    inputSchema: z.object({
      artifactId: z.string().describe('The unique identifier of the artifact to get.'),
      toolCallId: z.string().describe('The tool call ID associated with this artifact.'),
    }),
    execute: async ({ artifactId, toolCallId }) => {
      logger.info({ artifactId, toolCallId }, 'get_artifact_full executed');

      const compressor = ctx.currentCompressor;
      if (compressor?.hasSummarizedArtifact(artifactId)) {
        const summarized = compressor.getSummarizedArtifact(artifactId);
        logger.info(
          { artifactId, toolCallId },
          'Blocked retrieval of artifact already summarized in compression'
        );
        return {
          artifactId,
          status: 'already_summarized',
          key_findings: summarized?.key_findings ?? [],
          hint: `This artifact's key findings are already in your compressed context. Use them directly to answer. To pass this artifact to a tool, use { "${SENTINEL_KEY.ARTIFACT}": "${artifactId}", "${SENTINEL_KEY.TOOL}": "${summarized?.tool_call_id ?? toolCallId}" } sentinel instead of retrieving it.`,
        };
      }

      const streamRequestId = ctx.streamRequestId ?? '';
      const artifactService = agentSessionManager.getArtifactService(streamRequestId);

      if (!artifactService) {
        logger.warn(
          { artifactId, toolCallId, streamRequestId },
          'ArtifactService not found for session'
        );
        return {
          artifactId,
          status: 'unavailable',
          reason:
            'Artifact service is not available for this session. The artifact cannot be retrieved.',
        };
      }

      const artifactData = await artifactService.getArtifactFull(artifactId, toolCallId);
      if (!artifactData) {
        logger.warn({ artifactId, toolCallId, streamRequestId }, 'Artifact not found');
        return {
          artifactId,
          status: 'not_found',
          reason: `Artifact ${artifactId} was not found. It may not have been saved yet or the toolCallId may be incorrect.`,
        };
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

      return makeHydratedReferenceArtifactResult(artifactData);
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
    files: Array<{
      filePath: string;
      content: string;
    }>;
  }
> {
  return tool({
    description:
      'Load an on-demand skill by name and return its full content plus any attached files so you can apply it in this conversation.',
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
        files: skill.files ?? [],
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
    defaultTools.get_reference_artifact = wrapToolWithStreaming(
      ctx,
      'get_reference_artifact',
      getArtifactTools(ctx),
      streamRequestId,
      'tool',
      { skipArtifactCreation: true }
    );
  }

  const hasOnDemandSkills = ctx.config.skills?.some((skill) => !skill.alwaysLoaded);
  if (hasOnDemandSkills) {
    defaultTools[LOAD_SKILL_TOOL] = wrapToolWithStreaming(
      ctx,
      LOAD_SKILL_TOOL,
      createLoadSkillTool(ctx),
      streamRequestId,
      'tool'
    );
  }

  logger.info({ streamRequestId }, 'Adding compress_context tool to defaultTools');
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

  logger.info({ tools: Object.keys(defaultTools) }, 'getDefaultTools returning tools');
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
    logger.error({ error }, 'Failed to check agent artifact components');
    return false;
  }
}
