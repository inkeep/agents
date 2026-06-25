import { z } from '@hono/zod-openapi';
import { type MessageContent, toISODateString } from '@inkeep/agents-core';
import { isInternalToolResultArtifactData } from '../domains/run/artifacts/internal-artifacts';
import {
  asArtifactRef,
  hydrateArtifactRef,
  isAttachmentBookkeepingRef,
  parseDataPart,
  type ReplayHydrationContext,
} from '../domains/run/artifacts/replay-hydration';
import { getLogger } from '../logger';

const logger = getLogger('vercel-message-formatter');

export const VercelMessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  content: z.string(),
  parts: z.array(z.record(z.string(), z.unknown())),
  createdAt: z.string(),
});

export type VercelMessage = z.infer<typeof VercelMessageSchema>;

function normalizeRole(role: string): string {
  if (role === 'agent') return 'assistant';
  return role;
}

function getPartKind(p: { kind?: string; type?: string }): string | undefined {
  return p.kind ?? p.type;
}

export function extractText(content: MessageContent): string {
  if (content.text) return content.text;
  if (content.parts) {
    return content.parts
      .filter((p) => getPartKind(p) === 'text' && p.text)
      .map((p) => p.text as string)
      .join('');
  }
  return '';
}

export async function toVercelMessage(
  msg: {
    id: string;
    role: string;
    content: MessageContent;
    createdAt: string;
  },
  hydration: ReplayHydrationContext
): Promise<VercelMessage> {
  const role = normalizeRole(msg.role);
  const text = extractText(msg.content);
  const parts: Array<Record<string, unknown>> = [];

  if (msg.content.parts) {
    for (const p of msg.content.parts) {
      const kind = getPartKind(p);
      if (kind === 'text') {
        if (p.text) {
          parts.push({ type: 'text', text: p.text });
        }
      } else if (kind === 'data') {
        const parsed = parseDataPart(p.data);
        const ref = asArtifactRef(parsed);
        if (ref) {
          if (isAttachmentBookkeepingRef(ref)) continue;
          const hydrated = await hydrateArtifactRef(hydration, ref);
          if (hydrated) {
            if (isInternalToolResultArtifactData(hydrated.data)) {
              logger.debug(
                {
                  messageId: msg.id,
                  artifactId: ref.artifactId,
                  toolCallId: ref.toolCallId,
                },
                'Suppressed internal tool_result artifact from end-user replay'
              );
              continue;
            }
            parts.push(hydrated);
          } else {
            logger.debug(
              {
                messageId: msg.id,
                artifactId: ref.artifactId,
                toolCallId: ref.toolCallId,
              },
              'Dropped data-artifact part on replay (ledger miss or hydration failure)'
            );
          }
        } else {
          parts.push({ type: 'data-component', data: parsed });
        }
      } else if (kind === 'file') {
        const url = typeof p.data === 'string' ? p.data : undefined;
        if (!url) {
          logger.warn({ part: p }, 'File part missing data, skipping');
          continue;
        }
        const meta = p.metadata as Record<string, unknown> | undefined;
        const mediaType = typeof meta?.mimeType === 'string' ? meta.mimeType : undefined;
        const filename = typeof meta?.filename === 'string' ? meta.filename : undefined;
        parts.push({
          type: 'file',
          url,
          ...(mediaType && { mediaType }),
          ...(filename && { filename }),
        });
      }
    }
  } else if (text) {
    parts.push({ type: 'text', text });
  }

  if (msg.content.tool_calls) {
    for (const tc of msg.content.tool_calls) {
      parts.push({
        type: 'tool-invocation',
        toolCallId: tc.id,
        toolName: tc.function.name,
        args: tc.function.arguments,
        state: 'result',
      });
    }
  }

  return { id: msg.id, role, content: text, parts, createdAt: toISODateString(msg.createdAt) };
}
