import type { Artifact } from '@inkeep/agents-core';
import { z } from 'zod';

export const DurableApprovalDataSchema = z.object({
  type: z.literal('durable-approval-required'),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.unknown(),
  delegatedApproval: z
    .object({
      toolCallId: z.string().min(1),
      toolName: z.string().min(1),
      args: z.unknown(),
      subAgentId: z.string().min(1),
    })
    .optional(),
});

export type DurableApprovalData = z.infer<typeof DurableApprovalDataSchema>;

export interface ExtractionLogger {
  error: (obj: Record<string, unknown>, msg: string) => void;
}

/**
 * Search an A2A task result for a `durable-approval-required` data artifact.
 *
 * Searches two locations in the result structure:
 *   1. `result.parts[*]` — direct parts on the task result
 *   2. `result.artifacts[*].parts[*]` — parts nested inside artifacts
 *
 * Returns a validated `DurableApprovalData` or `undefined` if none found.
 * Logs an error and returns `undefined` when a candidate artifact is found
 * but fails schema validation (instead of silently skipping).
 */
export function extractDurableApprovalArtifact(
  taskResult: unknown,
  callerContext?: Record<string, unknown>,
  logger?: ExtractionLogger
): DurableApprovalData | undefined {
  if (!taskResult || typeof taskResult !== 'object') return undefined;

  const obj = taskResult as Record<string, unknown>;

  const candidate = findApprovalInParts(obj.parts) ?? findApprovalInArtifacts(obj.artifacts);

  if (!candidate) return undefined;

  const parsed = DurableApprovalDataSchema.safeParse(candidate);
  if (!parsed.success) {
    logger?.error(
      { candidate, validationError: parsed.error.format(), ...callerContext },
      'Found durable-approval-required artifact but it failed schema validation'
    );
    return undefined;
  }

  return parsed.data;
}

/**
 * Build a well-typed artifacts array containing a durable-approval-required signal.
 * Used by generateTaskHandler to construct the A2A response.
 */
export function buildDurableApprovalArtifact(
  data: Omit<DurableApprovalData, 'type'>,
  artifactId: string
): Artifact[] {
  return [
    {
      artifactId,
      parts: [
        {
          kind: 'data' as const,
          data: {
            type: 'durable-approval-required' as const,
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            args: data.args,
          },
        },
      ],
      createdAt: new Date().toISOString(),
    },
  ];
}

function findApprovalInParts(parts: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(parts)) return undefined;
  for (const part of parts) {
    if (part && typeof part === 'object' && part.kind === 'data') {
      const data = part.data as Record<string, unknown> | undefined;
      if (data && typeof data === 'object' && data.type === 'durable-approval-required') {
        return data;
      }
    }
  }
  return undefined;
}

function findApprovalInArtifacts(artifacts: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(artifacts)) return undefined;
  for (const artifact of artifacts) {
    if (artifact && typeof artifact === 'object') {
      const found = findApprovalInParts((artifact as Record<string, unknown>).parts);
      if (found) return found;
    }
  }
  return undefined;
}
