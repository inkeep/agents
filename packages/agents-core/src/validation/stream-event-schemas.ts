import { z } from 'zod';

/**
 * Vercel AI SDK Data Stream Protocol Event Schemas
 *
 * These schemas define the structure of events sent by the Inkeep Agents Run API.
 * They are used by both the streaming backend and AI SDK providers to ensure type safety.
 */

// =============================================================================
// TEXT STREAMING EVENTS
// =============================================================================

/**
 * Marks the beginning of a text stream
 */
export const TextStartEventSchema = z.object({
  type: z.literal('text-start'),
  id: z.string(),
});

/**
 * Represents a chunk of streaming text
 */
export const TextDeltaEventSchema = z.object({
  type: z.literal('text-delta'),
  id: z.string(),
  delta: z.string(),
});

/**
 * Marks the end of a text stream
 */
export const TextEndEventSchema = z.object({
  type: z.literal('text-end'),
  id: z.string(),
});

// =============================================================================
// DATA EVENTS
// =============================================================================

/**
 * Data component event - structured data in the stream
 * Used for artifacts, visualizations, or other structured outputs
 */
export const DataComponentStreamEventSchema = z.object({
  type: z.literal('data-component'),
  id: z.string(),
  data: z.any(),
});

/**
 * Data operation event - agent operations and state changes
 * Wraps operation events (agent_initializing, completion, etc.)
 */
export const DataOperationStreamEventSchema = z.object({
  type: z.literal('data-operation'),
  data: z.any(), // Contains OperationEvent types (AgentInitializingEvent, CompletionEvent, etc.)
});

/**
 * Data summary event - progress summaries and status updates
 */
export const DataSummaryStreamEventSchema = z.object({
  type: z.literal('data-summary'),
  data: z.any(), // Contains SummaryEvent from entities.ts
});

// =============================================================================
// CONTROL EVENTS
// =============================================================================

/**
 * Stream error event
 */
export const StreamErrorEventSchema = z.object({
  type: z.literal('error'),
  error: z.string(),
});

/**
 * Stream finish event with usage statistics
 */
export const StreamFinishEventSchema = z.object({
  type: z.literal('finish'),
  finishReason: z.string().optional(),
  usage: z
    .object({
      promptTokens: z.number().optional(),
      completionTokens: z.number().optional(),
      totalTokens: z.number().optional(),
    })
    .optional(),
});

// =============================================================================
// DISCRIMINATED UNION
// =============================================================================

/**
 * Union of all stream event types
 * This is the main schema used for validating incoming stream events
 */
export const StreamEventSchema = z.discriminatedUnion('type', [
  TextStartEventSchema,
  TextDeltaEventSchema,
  TextEndEventSchema,
  DataComponentStreamEventSchema,
  DataOperationStreamEventSchema,
  DataSummaryStreamEventSchema,
  StreamErrorEventSchema,
  StreamFinishEventSchema,
]);

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type TextStartEvent = z.infer<typeof TextStartEventSchema>;
export type TextDeltaEvent = z.infer<typeof TextDeltaEventSchema>;
export type TextEndEvent = z.infer<typeof TextEndEventSchema>;
export type DataComponentStreamEvent = z.infer<typeof DataComponentStreamEventSchema>;
export type DataOperationStreamEvent = z.infer<typeof DataOperationStreamEventSchema>;
export type DataSummaryStreamEvent = z.infer<typeof DataSummaryStreamEventSchema>;
export type StreamErrorEvent = z.infer<typeof StreamErrorEventSchema>;
export type StreamFinishEvent = z.infer<typeof StreamFinishEventSchema>;

/**
 * Union type of all possible stream events
 */
export type StreamEvent = z.infer<typeof StreamEventSchema>;
