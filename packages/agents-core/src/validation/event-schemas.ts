import { z } from 'zod';

// EVENT DATA SCHEMAS
// These schemas define the structure of event data used across the agent system
// They ensure consistent naming and type safety for inter-agent communication

/**
 * Agent transfer event data
 * Used when an agent transfers control to another agent
 */
export const TransferDataSchema = z.object({
  fromSubAgent: z.string().describe('ID of the sub-agent transferring control'),
  targetSubAgent: z.string().describe('ID of the sub-agent receiving control'),
  reason: z.string().optional().describe('Reason for the transfer'),
  context: z.any().optional().describe('Additional context data'),
});

export type TransferData = z.infer<typeof TransferDataSchema>;

/**
 * Delegation sent event data
 * Used when an agent delegates a task to another agent
 */
export const DelegationSentDataSchema = z.object({
  delegationId: z.string().describe('Unique identifier for this delegation'),
  fromSubAgent: z.string().describe('ID of the delegating sub-agent'),
  targetSubAgent: z.string().describe('ID of the sub-agent receiving the delegation'),
  taskDescription: z.string().describe('Description of the delegated task'),
  context: z.any().optional().describe('Additional context data'),
});

export type DelegationSentData = z.infer<typeof DelegationSentDataSchema>;

/**
 * Delegation returned event data
 * Used when a delegated task is completed and returned
 */
export const DelegationReturnedDataSchema = z.object({
  delegationId: z.string().describe('Unique identifier matching the original delegation'),
  fromSubAgent: z.string().describe('ID of the sub-agent that completed the task'),
  targetSubAgent: z.string().describe('ID of the sub-agent receiving the result'),
  result: z.any().optional().describe('Result data from the delegated task'),
});

export type DelegationReturnedData = z.infer<typeof DelegationReturnedDataSchema>;

/**
 * Data operation event details
 * Used for emit operations and agent data events
 */
export const DataOperationDetailsSchema = z.object({
  timestamp: z.number().describe('Unix timestamp in milliseconds'),
  subAgentId: z.string().describe('ID of the sub-agent that generated this data'),
  data: z.any().describe('The actual data payload'),
});

export type DataOperationDetails = z.infer<typeof DataOperationDetailsSchema>;

/**
 * Complete data operation event
 * Includes type and label for user-facing display
 */
export const DataOperationEventSchema = z.object({
  type: z.string().describe('Event type identifier'),
  label: z.string().describe('Human-readable label for the event'),
  details: DataOperationDetailsSchema,
});

export type DataOperationEvent = z.infer<typeof DataOperationEventSchema>;

// HELPER SCHEMAS FOR A2A METADATA

/**
 * Message metadata for A2A communication
 * Used in message passing between agents
 */
export const A2AMessageMetadataSchema = z.object({
  fromSubAgentId: z.string().optional().describe('ID of the sending sub-agent'),
  toSubAgentId: z.string().optional().describe('ID of the receiving sub-agent'),
  fromExternalAgentId: z.string().optional().describe('ID of the sending external agent'),
  toExternalAgentId: z.string().optional().describe('ID of the receiving external agent'),
  taskId: z.string().optional().describe('Associated task ID'),
  a2aTaskId: z.string().optional().describe('A2A-specific task ID'),
});

export type A2AMessageMetadata = z.infer<typeof A2AMessageMetadataSchema>;
