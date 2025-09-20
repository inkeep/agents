/**
 * Default status component schemas for AI agent operations
 */

import type { StatusComponent } from './types';

/**
 * Schema for retrieve operations - when agents are looking up, searching, 
 * or researching information in web or downstream services
 */
export const retrieveStatusSchema: StatusComponent = {
  type: 'retrieve',
  description: 'AI Mono-Agent is actively looking up, searching, or researching information from web services, knowledge bases, databases, documentation, or other downstream services. This includes activities like querying APIs, searching through documents, filtering data, analyzing search results, cross-referencing information, and gathering relevant context to answer user questions or fulfill requests. The agent is in information-gathering mode, focused on finding and collecting data without making modifications.'
};

/**
 * Schema for action operations - when agents are using tools or delegating 
 * tasks with side-effects to update, create, or modify downstream services
 */
export const actionStatusSchema: StatusComponent = {
  type: 'action',
  description: 'AI Mono-Agent is actively using tools, executing commands, or delegating tasks that have side-effects to update, create, delete, or otherwise modify downstream services, systems, or data. This includes activities like making API calls that change state, writing to databases, creating files, sending emails, processing transactions, updating user profiles, triggering workflows, or coordinating with other agents to perform operations that alter the system or external services in some way.'
};

/**
 * Default status component schemas collection
 */
export const defaultStatusSchemas: StatusComponent[] = [
  retrieveStatusSchema,
  actionStatusSchema
];