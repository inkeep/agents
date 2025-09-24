/**
 * Default status component schemas for AI agent operations
 */

import type { StatusComponent } from '@inkeep/agents-core';

/**
 * Schema for retrieve operations - when agents are looking up, searching,
 * or researching information in web or downstream services
 */
export const retrieveStatusSchema: StatusComponent = {
  type: 'retrieve',
  description:
    'Use this when the system found or retrieved specific information from searches, queries, or lookups. ONLY report ACTUAL findings that appear explicitly in the tool results - never make up data, names, numbers, or details. The label must state the SPECIFIC discovery (e.g., "Found 3 authentication methods", "Database contains 500 records", "API supports JSON format") not the act of searching. Every detail must be traceable to actual tool output. NEVER invent placeholder names, fictional data, or information not present in the activities.',
};

/**
 * Schema for action operations - when agents are using tools or delegating
 * tasks with side-effects to update, create, or modify downstream services
 */
export const actionStatusSchema: StatusComponent = {
  type: 'action',
  description:
    'Use this when the system executed a tool or performed an operation that modified state or had side effects. ONLY report ACTUAL tool executions and their results as they appear in the tool outputs - never make up tool names, parameters, or outcomes. The label must describe what specific action was performed and its concrete result based on actual tool execution data. DO NOT make up examples like "Ran test suite with X passes" unless a test suite was ACTUALLY run and reported X passes. DO NOT say "Executed database query" unless a database query was ACTUALLY executed. Only report what literally happened. NEVER invent tool names, execution results, or details not explicitly present in the tool execution activities. If a tool failed, report the actual failure, not imagined success.',
};

/**
 * Default status component schemas collection
 */
export const defaultStatusSchemas: StatusComponent[] = [retrieveStatusSchema, actionStatusSchema];
