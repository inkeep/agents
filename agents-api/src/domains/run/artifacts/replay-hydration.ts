import {
  type Artifact,
  type FullExecutionContext,
  getLedgerArtifacts,
  type MessageContent,
  type ProjectScopeConfig,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { MESSAGE_ATTACHMENT_TOOL_CALL_PREFIX } from '../services/blob-storage/attachment-artifacts';
import { ArtifactParser, type StreamPart } from './ArtifactParser';

const logger = getLogger('replay-hydration');

export type ArtifactRef = { artifactId: string; toolCallId: string };

export type ReplayHydrationContext = {
  parser: ArtifactParser;
  artifactMap: Map<string, Artifact>;
};

/**
 * Normalize a data part's raw `data` field. DB rows sometimes store the JSON
 * as a string; upstream code elsewhere may have already parsed it.
 */
export function parseDataPart(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * A data part is an artifact ref iff it carries both `artifactId` and
 * `toolCallId` strings.
 */
export function asArtifactRef(data: unknown): ArtifactRef | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.artifactId === 'string' && typeof d.toolCallId === 'string') {
    return { artifactId: d.artifactId, toolCallId: d.toolCallId };
  }
  return null;
}

/**
 * True for refs that exist purely as server-side bookkeeping for a user's
 * file upload. These are paired with a sibling `file` part that already
 * carries everything the UI needs — returning the ref on replay just
 * duplicates the attachment in the UI.
 */
export function isAttachmentBookkeepingRef(ref: ArtifactRef): boolean {
  return ref.toolCallId.startsWith(MESSAGE_ATTACHMENT_TOOL_CALL_PREFIX);
}

function artifactMapKey(artifactId: string, toolCallId: string): string {
  return `${artifactId}:${toolCallId}`;
}

/**
 * Construct an ArtifactParser scoped for replay. The parser only touches
 * `tenantId`/`projectId` on the execution context during the `getArtifactSummary`
 * path we exercise here — and that path short-circuits on the pre-loaded
 * `artifactMap` before the stricter guards run, so no further context is
 * required.
 */
function createReplayArtifactParser(scopes: ProjectScopeConfig): ArtifactParser {
  const minimalExecContext = {
    tenantId: scopes.tenantId,
    projectId: scopes.projectId,
  } as unknown as FullExecutionContext;
  return new ArtifactParser(minimalExecContext);
}

/**
 * Walk a batch of messages, collect every artifact ref's `toolCallId`, and
 * fetch the matching ledger rows in a single query. Callers pass the
 * resulting map to `hydrateArtifactRef` so the parser's summary-lookup hits
 * the map branch and skips any DB fallback.
 */
async function loadArtifactMapForMessages(
  scopes: ProjectScopeConfig,
  messages: Array<{ content: MessageContent }>
): Promise<Map<string, Artifact>> {
  const toolCallIds = new Set<string>();
  for (const msg of messages) {
    const parts = msg.content.parts;
    if (!parts) continue;
    for (const p of parts) {
      const kind = p.kind ?? (p as { type?: string }).type;
      if (kind !== 'data') continue;
      const ref = asArtifactRef(parseDataPart(p.data));
      if (ref && !isAttachmentBookkeepingRef(ref)) {
        toolCallIds.add(ref.toolCallId);
      }
    }
  }

  if (toolCallIds.size === 0) return new Map();

  const batchToolCallIds = Array.from(toolCallIds);
  let artifacts: Artifact[];
  try {
    artifacts = await getLedgerArtifacts(runDbClient)({
      scopes,
      toolCallIds: batchToolCallIds,
    });
  } catch (error) {
    // Degrade gracefully: the conversation still loads with unhydrated parts
    // dropped instead of the whole request 500ing on a transient DB failure.
    logger.error(
      {
        err: error,
        tenantId: scopes.tenantId,
        projectId: scopes.projectId,
        toolCallIdCount: batchToolCallIds.length,
      },
      'Failed to batch-load ledger artifacts for conversation replay'
    );
    return new Map();
  }

  const map = new Map<string, Artifact>();
  for (const a of artifacts) {
    if (a.toolCallId) {
      map.set(artifactMapKey(a.artifactId, a.toolCallId), a);
    }
  }
  return map;
}

/**
 * Build everything a conversation-replay pass needs to hydrate artifact refs
 * in a single shot: one batched ledger query + one scoped parser. Safe to
 * call on empty message lists (returns a context whose map is empty and
 * whose parser is never consulted).
 */
export async function createReplayHydrationContext(
  scopes: ProjectScopeConfig,
  messages: Array<{ content: MessageContent }>
): Promise<ReplayHydrationContext> {
  const artifactMap = await loadArtifactMapForMessages(scopes, messages);
  const parser = createReplayArtifactParser(scopes);
  return { parser, artifactMap };
}

/**
 * Hydrate a single `{artifactId, toolCallId}` ref into the Vercel-facing
 * `data-artifact` part shape. Delegates to `ArtifactParser.parseObject` so
 * we inherit the streaming path's summary-formatting and `typeSchema`
 * attachment logic without copying it.
 *
 * Returns `null` on a ledger miss — matching streaming behavior (which emits
 * `[]` rather than an unresolved placeholder).
 */
export async function hydrateArtifactRef(
  ctx: ReplayHydrationContext,
  ref: ArtifactRef
): Promise<{ type: 'data-artifact'; data: Record<string, unknown> } | null> {
  let streamParts: StreamPart[];
  try {
    streamParts = await ctx.parser.parseObject(
      {
        name: 'Artifact',
        props: { artifact_id: ref.artifactId, tool_call_id: ref.toolCallId },
      },
      ctx.artifactMap
    );
  } catch (error) {
    // A single corrupt ledger row (e.g. malformed `parts` JSON) shouldn't
    // tank the entire conversation. Drop this one part and move on.
    logger.error(
      { err: error, artifactId: ref.artifactId, toolCallId: ref.toolCallId },
      'Failed to hydrate artifact ref on conversation replay'
    );
    return null;
  }
  const first = streamParts[0];
  if (!first || first.kind !== 'data' || !first.data) return null;
  return { type: 'data-artifact', data: first.data as Record<string, unknown> };
}
