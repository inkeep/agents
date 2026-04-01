import { getLogger } from '../../../logger';

const logger = getLogger('ToolApprovalUiBus');

export type ToolApprovalUiEvent =
  | {
      type: 'approval-needed';
      toolCallId: string;
      toolName: string;
      input: any;
      providerMetadata?: any;
      approvalId: string;
    }
  | {
      type: 'approval-resolved';
      toolCallId: string;
      approved: boolean;
      reason?: string;
    };

type Listener = (event: ToolApprovalUiEvent) => void | Promise<void>;

/**
 * In-process event bus keyed by streamRequestId.
 *
 * Used to propagate approval UI events from delegated agents (who must not write to stream)
 * up to the user-facing request handler, which can stream tool UI parts to the client.
 */
export class ToolApprovalUiBus {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(streamRequestId: string, listener: Listener): () => void {
    if (!streamRequestId) {
      return () => {};
    }

    const set = this.listeners.get(streamRequestId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(streamRequestId, set);

    return () => {
      const existing = this.listeners.get(streamRequestId);
      if (!existing) return;
      existing.delete(listener);
      if (existing.size === 0) {
        this.listeners.delete(streamRequestId);
      }
    };
  }

  async publish(streamRequestId: string, event: ToolApprovalUiEvent): Promise<void> {
    if (!streamRequestId) return;
    const set = this.listeners.get(streamRequestId);
    if (!set || set.size === 0) return;

    // Fire listeners serially to preserve ordering.
    for (const listener of set) {
      try {
        await listener(event);
      } catch (error) {
        logger.warn(
          {
            streamRequestId,
            eventType: event.type,
            toolCallId: (event as any).toolCallId,
            error: error instanceof Error ? error.message : String(error),
            reason: (event as any).reason,
          },
          'ToolApprovalUiBus listener failed'
        );
      }
    }
  }
}

export const toolApprovalUiBus = new ToolApprovalUiBus();
