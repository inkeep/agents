/**
 * Tool-call/tool-result pairing reconciler.
 *
 * The Anthropic (and AI SDK) message contract requires every `tool-call` part to have a matching
 * `tool-result` part and vice versa. Mid-generation compression rewrites the message array and can
 * sever that pairing, producing an illegal request the provider rejects with
 * "Tool results are missing for tool calls ...".
 *
 * This reconciler is the repair safety net (SPEC D1/D2/D3): it drops ONLY the unmatched side — never
 * synthesizes a placeholder — so the array compression returns is always legal. It is deliberately NOT
 * the SDK's `pruneMessages`, whose `toolCalls: 'all'` strips every tool part wholesale rather than only
 * the unpaired ones.
 */

type MessagePart = {
  type: string;
  toolCallId?: string;
  [key: string]: unknown;
};

type Message = {
  role: string;
  content: unknown;
  [key: string]: unknown;
};

export type ReconcileToolPairsResult = {
  messages: Message[];
  droppedDanglingCallIds: string[];
  droppedOrphanResultIds: string[];
  droppedMessageCount: number;
  changed: boolean;
};

/**
 * Remove dangling tool-calls (no matching tool-result) and orphan tool-results (no matching tool-call)
 * from a `ModelMessage[]` array. Only messages we actually modify are eligible for removal, and only
 * when nothing but reasoning remains after the tool part is dropped.
 */
export function reconcileToolPairs(messages: Message[]): ReconcileToolPairsResult {
  const callIds = new Set<string>();
  const resultIds = new Set<string>();

  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content as MessagePart[]) {
      if (part?.type === 'tool-call' && part.toolCallId != null) {
        callIds.add(part.toolCallId);
      } else if (part?.type === 'tool-result' && part.toolCallId != null) {
        resultIds.add(part.toolCallId);
      }
    }
  }

  const droppedDanglingCallIds: string[] = [];
  const droppedOrphanResultIds: string[] = [];
  let droppedMessageCount = 0;

  const out: Message[] = [];
  for (const message of messages) {
    if (!Array.isArray(message.content)) {
      out.push(message);
      continue;
    }

    const original = message.content as MessagePart[];
    const filtered = original.filter((part) => {
      if (
        part?.type === 'tool-call' &&
        part.toolCallId != null &&
        !resultIds.has(part.toolCallId)
      ) {
        droppedDanglingCallIds.push(part.toolCallId);
        return false;
      }
      if (
        part?.type === 'tool-result' &&
        part.toolCallId != null &&
        !callIds.has(part.toolCallId)
      ) {
        droppedOrphanResultIds.push(part.toolCallId);
        return false;
      }
      return true;
    });

    // Only ever touch messages we actually filtered. A message we didn't modify (e.g. an image- or
    // file-only multimodal message) is passed through untouched — never dropped.
    if (filtered.length === original.length) {
      out.push(message);
      continue;
    }

    // After removing tool parts, drop the message only if nothing but reasoning (or nothing) remains —
    // a stranded reasoning-only assistant turn would itself be rejected (thinking-block signature
    // integrity). Any other content part (text, image, file, ...) keeps the message alive.
    const hasSubstance = filtered.some((part) => part?.type !== 'reasoning');
    if (!hasSubstance) {
      droppedMessageCount++;
      continue;
    }

    out.push({ ...message, content: filtered });
  }

  const changed =
    droppedDanglingCallIds.length > 0 ||
    droppedOrphanResultIds.length > 0 ||
    droppedMessageCount > 0;

  return {
    messages: out,
    droppedDanglingCallIds,
    droppedOrphanResultIds,
    droppedMessageCount,
    changed,
  };
}
